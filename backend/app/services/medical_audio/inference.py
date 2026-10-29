"""
medical_audio/inference.py
==========================
Singleton inference service: loads the trained model once and exposes
predict() for real-time sound classification from file path or raw bytes.

Also provides index_prediction_to_rag() to push the classified condition
description into the vector knowledge store for AI Tutor retrieval.
"""

from __future__ import annotations

import io
import json
import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from app.core.logging import logger

MODEL_DIR = Path(__file__).resolve().parents[3] / "data" / "medical_audio" / "model"
MODEL_PATH = MODEL_DIR / "medical_audio_classifier.joblib"
SCALER_PATH = MODEL_DIR / "scaler.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"

_lock = threading.Lock()
_loaded_clf = None
_loaded_scaler = None
_loaded_meta: Dict = {}


def _ensure_model_loaded() -> bool:
    """Load model lazily on first call. Returns True if model is ready."""
    global _loaded_clf, _loaded_scaler, _loaded_meta
    if _loaded_clf is not None:
        return True
    with _lock:
        if _loaded_clf is not None:
            return True
        if not MODEL_PATH.exists() or not SCALER_PATH.exists():
            logger.warning("[medical_audio] Model not found — triggering training …")
            try:
                from app.services.medical_audio.trainer import train
                _loaded_meta = train()
            except Exception as exc:
                logger.error(f"[medical_audio] Training failed: {exc}")
                return False
        try:
            import joblib
            _loaded_clf = joblib.load(MODEL_PATH)
            _loaded_scaler = joblib.load(SCALER_PATH)
            if METADATA_PATH.exists():
                _loaded_meta = json.loads(METADATA_PATH.read_text())
            logger.info(
                f"[medical_audio] Model loaded — "
                f"accuracy={_loaded_meta.get('accuracy', 'unknown'):.4f}, "
                f"classes={_loaded_meta.get('n_classes', '?')}"
            )
            return True
        except Exception as exc:
            logger.error(f"[medical_audio] Model load failed: {exc}")
            return False


# ------------------------------------------------------------------ data types

@dataclass
class SoundPrediction:
    predicted_class: str
    confidence: float                      # probability of top class (0–1)
    condition_description: str
    probabilities: Dict[str, float]        # all class probabilities
    severity: str                          # normal | warning | critical
    inference_time_ms: float
    model_version: str = "rf-v1"
    error: Optional[str] = None


def _severity(cls: str) -> str:
    if "alarm" in cls or "occlusion" in cls or "charging" in cls:
        return "critical"
    if cls == "ambient_silence":
        return "normal"
    return "normal"


# ------------------------------------------------------------------ public API

def predict_from_file(audio_path: Path) -> SoundPrediction:
    """
    Classify a WAV/audio file and return a SoundPrediction.
    Accepts any format supported by soundfile (WAV, FLAC, OGG, …).
    """
    if not _ensure_model_loaded():
        return SoundPrediction(
            predicted_class="unknown",
            confidence=0.0,
            condition_description="Model not available.",
            probabilities={},
            severity="normal",
            inference_time_ms=0.0,
            error="model_not_loaded",
        )

    from app.services.medical_audio.dataset import (
        CONDITION_DESCRIPTIONS, IDX_TO_CLASS, load_wav_features
    )

    t0 = time.perf_counter()
    try:
        feats = load_wav_features(audio_path)
    except Exception as exc:
        return SoundPrediction(
            predicted_class="unknown",
            confidence=0.0,
            condition_description=f"Feature extraction failed: {exc}",
            probabilities={},
            severity="normal",
            inference_time_ms=0.0,
            error="feature_extraction_failed",
        )

    feats_s = _loaded_scaler.transform(feats.reshape(1, -1))
    proba = _loaded_clf.predict_proba(feats_s)[0]
    class_names: List[str] = _loaded_meta.get("class_names", list(IDX_TO_CLASS.values()))
    top_idx = int(np.argmax(proba))
    top_cls = class_names[top_idx]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    return SoundPrediction(
        predicted_class=top_cls,
        confidence=round(float(proba[top_idx]), 4),
        condition_description=CONDITION_DESCRIPTIONS.get(top_cls, top_cls),
        probabilities={class_names[i]: round(float(p), 4) for i, p in enumerate(proba)},
        severity=_severity(top_cls),
        inference_time_ms=round(elapsed_ms, 2),
    )


def predict_from_bytes(audio_bytes: bytes, filename: str = "upload.wav") -> SoundPrediction:
    """
    Classify audio from raw bytes (file upload).
    Writes to a temp WAV, extracts features, then deletes.
    """
    import tempfile
    import os
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)
    try:
        return predict_from_file(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def predict_from_signal(sig: np.ndarray, sr: int = 16_000) -> SoundPrediction:
    """
    Classify from a numpy float32 mono signal array.
    """
    if not _ensure_model_loaded():
        return SoundPrediction(
            predicted_class="unknown",
            confidence=0.0,
            condition_description="Model not available.",
            probabilities={},
            severity="normal",
            inference_time_ms=0.0,
            error="model_not_loaded",
        )

    from app.services.medical_audio.dataset import (
        CONDITION_DESCRIPTIONS, IDX_TO_CLASS, SAMPLE_RATE, CLIP_SAMPLES, extract_features
    )
    from scipy.signal import resample_poly
    from math import gcd

    t0 = time.perf_counter()

    if sig.ndim == 2:
        sig = sig.mean(axis=1)
    sig = sig.astype(np.float32)

    if sr != SAMPLE_RATE:
        g = gcd(SAMPLE_RATE, sr)
        sig = resample_poly(sig, SAMPLE_RATE // g, sr // g).astype(np.float32)

    if len(sig) < CLIP_SAMPLES:
        sig = np.pad(sig, (0, CLIP_SAMPLES - len(sig)))
    else:
        sig = sig[:CLIP_SAMPLES]

    feats = extract_features(sig)
    feats_s = _loaded_scaler.transform(feats.reshape(1, -1))
    proba = _loaded_clf.predict_proba(feats_s)[0]
    class_names: List[str] = _loaded_meta.get("class_names", list(IDX_TO_CLASS.values()))
    top_idx = int(np.argmax(proba))
    top_cls = class_names[top_idx]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    return SoundPrediction(
        predicted_class=top_cls,
        confidence=round(float(proba[top_idx]), 4),
        condition_description=CONDITION_DESCRIPTIONS.get(top_cls, top_cls),
        probabilities={class_names[i]: round(float(p), 4) for i, p in enumerate(proba)},
        severity=_severity(top_cls),
        inference_time_ms=round(elapsed_ms, 2),
    )


def get_model_info() -> Dict:
    """Return model metadata (accuracy, class names, feature count, …)."""
    _ensure_model_loaded()
    return {
        "model_ready": _loaded_clf is not None,
        "model_version": "rf-v1",
        "accuracy": _loaded_meta.get("accuracy"),
        "n_classes": _loaded_meta.get("n_classes"),
        "class_names": _loaded_meta.get("class_names"),
        "n_features": _loaded_meta.get("n_features"),
        "n_train": _loaded_meta.get("n_train"),
        "n_test": _loaded_meta.get("n_test"),
        "train_time_s": _loaded_meta.get("train_time_s"),
    }


# ------------------------------------------------------------------ RAG bridge

def index_prediction_to_rag(
    db,
    prediction: SoundPrediction,
    media_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    audio_source: str = "sound_inference",
) -> str:
    """
    Index a classified sound condition into the vector knowledge store
    so the AI Tutor can answer questions like 'What does the ventilator alarm sound like?'

    Returns the embedding ID created.
    """
    from app.services.vector_service import compute_dense_embedding
    from app.models.embedding import KnowledgeEmbedding
    import json as _json

    text = (
        f"Medical equipment sound classified as: {prediction.predicted_class}. "
        f"Condition: {prediction.condition_description} "
        f"Confidence: {prediction.confidence:.0%}. "
        f"Severity: {prediction.severity}."
    )

    vec = compute_dense_embedding(text)
    meta = {
        "type": "sound_inference",
        "predicted_class": prediction.predicted_class,
        "confidence": prediction.confidence,
        "severity": prediction.severity,
        "source": audio_source,
    }

    emb = KnowledgeEmbedding(
        source_type="sound_inference",
        source_id=str(uuid.uuid4()),
        media_id=media_id,
        machine_id=machine_id,
        chunk_index=0,
        chunk_type="sound_inference",
        content_text=text,
        embedding_vector=vec,
        embedding_dim=len(vec),
        model_name="dense-multi-hash-384",
        chunk_text=text,
        embedding_json=_json.dumps(vec),
        embedding_model="dense-multi-hash-384",
        metadata_json=_json.dumps(meta),
    )
    db.add(emb)
    db.commit()
    db.refresh(emb)
    logger.info(f"[medical_audio] Indexed prediction '{prediction.predicted_class}' to RAG store (id={emb.id})")
    return emb.id
