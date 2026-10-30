"""
tests/test_medical_audio.py
===========================
Regression test suite for the medical equipment audio intelligence system.

Tests cover:
  1. Feature extraction produces correct shape and finite values
  2. Dataset generation produces balanced, reproducible data
  3. Model training (or load) succeeds and achieves >= 80% accuracy
  4. Per-class inference returns correct class for clean synthetic examples
  5. predict_from_bytes handles empty/corrupt input gracefully
  6. predict_from_signal round-trips correctly
  7. Resampling: 44.1 kHz stereo input normalised correctly
  8. RAG indexing stores a retrievable embedding
  9. REST endpoint /classify returns 200 with valid schema
  10. REST endpoint /model-info returns model stats
"""

from __future__ import annotations

import io
import json
import struct
import wave
from pathlib import Path
from typing import List

import numpy as np
import pytest

# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #

@pytest.fixture(scope="session", autouse=True)
def _train_model_once(tmp_path_factory):
    """Train the model once for the whole test session using a tiny dataset."""
    from app.services.medical_audio.trainer import train
    wav_dir = tmp_path_factory.mktemp("med_audio")
    meta = train(samples_per_class=20, test_fraction=0.25, n_estimators=50, force_retrain=True)
    return meta


def _make_wav_bytes(sig: np.ndarray, sr: int = 16_000) -> bytes:
    buf = io.BytesIO()
    int16 = (sig * 32767).clip(-32768, 32767).astype(np.int16)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int16.tobytes())
    return buf.getvalue()


def _synth(cls_name: str, seed: int = 0) -> np.ndarray:
    """Generate a clean synthetic signal for a given class."""
    from app.services.medical_audio.dataset import _GENERATORS, CLASSES
    rng = np.random.default_rng(seed)
    gen = _GENERATORS[cls_name]
    return gen(rng)


# --------------------------------------------------------------------------- #
# 1. Feature extraction shape & validity                                       #
# --------------------------------------------------------------------------- #

def test_feature_shape():
    from app.services.medical_audio.dataset import extract_features, CLIP_SAMPLES, SAMPLE_RATE
    sig = np.random.default_rng(1).normal(0, 0.1, CLIP_SAMPLES).astype(np.float32)
    feats = extract_features(sig, SAMPLE_RATE)
    assert feats.shape == (52,), f"Expected 52-dim feature, got {feats.shape}"
    assert np.all(np.isfinite(feats)), "Feature vector contains NaN or Inf"


def test_feature_deterministic():
    from app.services.medical_audio.dataset import extract_features, CLIP_SAMPLES
    sig = np.random.default_rng(42).normal(0, 0.1, CLIP_SAMPLES).astype(np.float32)
    f1 = extract_features(sig)
    f2 = extract_features(sig)
    np.testing.assert_array_equal(f1, f2, err_msg="Feature extraction is not deterministic")


def test_feature_empty_signal():
    from app.services.medical_audio.dataset import extract_features, CLIP_SAMPLES
    sig = np.zeros(CLIP_SAMPLES, dtype=np.float32)
    feats = extract_features(sig)
    assert feats.shape == (52,)
    assert np.all(np.isfinite(feats))


# --------------------------------------------------------------------------- #
# 2. Dataset generation                                                        #
# --------------------------------------------------------------------------- #

def test_dataset_shape():
    from app.services.medical_audio.dataset import generate_dataset, CLASSES
    X, y, class_names = generate_dataset(samples_per_class=5, save_wavs=False)
    n = 5 * len(CLASSES)
    assert X.shape == (n, 52), f"Expected ({n}, 52), got {X.shape}"
    assert y.shape == (n,)
    assert class_names == CLASSES


def test_dataset_balanced():
    from app.services.medical_audio.dataset import generate_dataset, CLASSES
    X, y, class_names = generate_dataset(samples_per_class=10, save_wavs=False)
    for i in range(len(CLASSES)):
        count = int((y == i).sum())
        assert count == 10, f"Class {class_names[i]} has {count} samples, expected 10"


def test_dataset_reproducible():
    from app.services.medical_audio.dataset import generate_dataset
    X1, y1, _ = generate_dataset(samples_per_class=3, save_wavs=False)
    X2, y2, _ = generate_dataset(samples_per_class=3, save_wavs=False)
    np.testing.assert_array_equal(X1, X2)
    np.testing.assert_array_equal(y1, y2)


# --------------------------------------------------------------------------- #
# 3. Model training accuracy                                                   #
# --------------------------------------------------------------------------- #

def test_model_accuracy(_train_model_once):
    meta = _train_model_once
    acc = meta.get("accuracy", 0)
    assert acc >= 0.80, f"Model accuracy {acc:.4f} is below the 80% threshold."


def test_model_metadata_complete(_train_model_once):
    meta = _train_model_once
    for key in ("accuracy", "class_names", "n_features", "n_train", "n_test"):
        assert key in meta, f"Metadata missing key: {key}"
    assert meta["n_features"] == 52


# --------------------------------------------------------------------------- #
# 4. Per-class inference correctness                                           #
# --------------------------------------------------------------------------- #

from app.services.medical_audio.dataset import CLASSES

@pytest.mark.parametrize("cls_name", CLASSES)
def test_predict_correct_class(cls_name):
    from app.services.medical_audio.inference import predict_from_signal
    # Use multiple seeds and check majority vote
    correct = 0
    for seed in range(10):
        sig = _synth(cls_name, seed=seed)
        pred = predict_from_signal(sig)
        if pred.predicted_class == cls_name:
            correct += 1
    assert correct >= 6, (
        f"Class '{cls_name}': only {correct}/10 seeds predicted correctly "
        f"(expected >= 6)"
    )


def test_predict_confidence_range():
    from app.services.medical_audio.inference import predict_from_signal
    sig = _synth("ecg_monitor_alarm")
    pred = predict_from_signal(sig)
    assert 0.0 <= pred.confidence <= 1.0


def test_predict_probabilities_sum_to_one():
    from app.services.medical_audio.inference import predict_from_signal
    sig = _synth("infusion_pump_occlusion")
    pred = predict_from_signal(sig)
    total = sum(pred.probabilities.values())
    assert abs(total - 1.0) < 1e-4, f"Probabilities sum to {total}, expected ~1.0"


def test_severity_alarm_is_critical():
    from app.services.medical_audio.inference import predict_from_signal
    sig = _synth("ventilator_alarm")
    pred = predict_from_signal(sig)
    if pred.predicted_class == "ventilator_alarm":
        assert pred.severity == "critical"


def test_severity_normal_is_normal():
    from app.services.medical_audio.inference import predict_from_signal
    sig = _synth("ambient_silence")
    pred = predict_from_signal(sig)
    assert pred.severity == "normal"


# --------------------------------------------------------------------------- #
# 5. predict_from_bytes edge cases                                             #
# --------------------------------------------------------------------------- #

def test_predict_bytes_valid_wav():
    from app.services.medical_audio.inference import predict_from_bytes
    sig = _synth("ecg_monitor_normal")
    wav_bytes = _make_wav_bytes(sig)
    pred = predict_from_bytes(wav_bytes, filename="ecg.wav")
    assert pred.predicted_class in CLASSES
    assert pred.error is None


def test_predict_bytes_empty():
    from app.services.medical_audio.inference import predict_from_bytes
    pred = predict_from_bytes(b"", filename="empty.wav")
    # Should return an error result, not raise
    assert pred.error is not None or pred.predicted_class == "unknown"


def test_predict_bytes_corrupt():
    from app.services.medical_audio.inference import predict_from_bytes
    pred = predict_from_bytes(b"\x00\x01\x02\x03garbage", filename="corrupt.wav")
    assert pred.predicted_class == "unknown" or pred.error is not None


# --------------------------------------------------------------------------- #
# 6. predict_from_signal round-trip                                           #
# --------------------------------------------------------------------------- #

def test_predict_signal_float32():
    from app.services.medical_audio.inference import predict_from_signal
    from app.services.medical_audio.dataset import CLIP_SAMPLES, SAMPLE_RATE
    sig = np.random.default_rng(99).normal(0, 0.1, CLIP_SAMPLES).astype(np.float32)
    pred = predict_from_signal(sig, sr=SAMPLE_RATE)
    assert pred.predicted_class in CLASSES


def test_predict_signal_short_pads():
    from app.services.medical_audio.inference import predict_from_signal
    sig = np.random.default_rng(5).normal(0, 0.1, 4000).astype(np.float32)  # only 0.25 s
    pred = predict_from_signal(sig, sr=16_000)
    assert pred.predicted_class in CLASSES  # must not crash


# --------------------------------------------------------------------------- #
# 7. Resampling: 44.1 kHz stereo input                                       #
# --------------------------------------------------------------------------- #

def test_predict_signal_44k_stereo():
    from app.services.medical_audio.inference import predict_from_signal
    sr = 44_100
    n = sr * 3
    stereo = np.random.default_rng(7).normal(0, 0.05, (n, 2)).astype(np.float32)
    sig_mono = stereo.mean(axis=1)
    pred = predict_from_signal(sig_mono, sr=sr)
    assert pred.predicted_class in CLASSES


# --------------------------------------------------------------------------- #
# 8. RAG indexing stores retrievable embedding                                #
# --------------------------------------------------------------------------- #

def test_index_prediction_to_rag(db_session):
    from app.services.medical_audio.inference import index_prediction_to_rag, SoundPrediction
    from app.services.vector_service import search_vector_knowledge
    from app.services.medical_audio.dataset import CONDITION_DESCRIPTIONS

    pred = SoundPrediction(
        predicted_class="ecg_monitor_alarm",
        confidence=0.92,
        condition_description=CONDITION_DESCRIPTIONS["ecg_monitor_alarm"],
        probabilities={"ecg_monitor_alarm": 0.92},
        severity="critical",
        inference_time_ms=5.0,
    )

    emb_id = index_prediction_to_rag(db_session, pred)
    assert emb_id is not None

    # Retrieve via semantic search
    results = search_vector_knowledge(db_session, "ECG monitor alarm arrhythmia", top_k=5)
    ids = [r.id for r in results]
    assert emb_id in ids, "Indexed embedding not found via RAG search"


# --------------------------------------------------------------------------- #
# 9 & 10. Synthetic classifier routes are retired                             #
# --------------------------------------------------------------------------- #

def test_retired_synthetic_classifier_api_is_not_exposed(client):
    assert client.get("/api/v1/sound-inference/model-info").status_code == 404
    assert client.get("/api/v1/sound-inference/classes").status_code == 404
    for route in ("classify", "classify-and-index"):
        response = client.post(
            f"/api/v1/sound-inference/{route}",
            files={"file": ("synthetic.wav", b"not served", "audio/wav")},
        )
        assert response.status_code == 404
