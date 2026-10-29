"""
medical_audio/trainer.py
========================
Trains a Random Forest classifier on the synthetic medical-equipment dataset,
evaluates it, and persists the model + scaler with joblib.

Model file: data/medical_audio/model/medical_audio_classifier.joblib
Scaler file: data/medical_audio/model/scaler.joblib
Metadata:   data/medical_audio/model/metadata.json

Run directly:
    python -m app.services.medical_audio.trainer
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parents[3] / "data" / "medical_audio" / "model"
MODEL_PATH = MODEL_DIR / "medical_audio_classifier.joblib"
SCALER_PATH = MODEL_DIR / "scaler.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"


def train(
    samples_per_class: int = 120,
    test_fraction: float = 0.2,
    n_estimators: int = 200,
    random_state: int = 42,
    force_retrain: bool = False,
) -> Dict[str, Any]:
    """
    Train (or reload) the medical-equipment audio classifier.

    Returns a metadata dict with accuracy, class names, and paths.
    """
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report, accuracy_score
    from sklearn.model_selection import train_test_split

    if MODEL_PATH.exists() and SCALER_PATH.exists() and not force_retrain:
        logger.info("[medical_audio] Pre-trained model found — loading from disk.")
        metadata = json.loads(METADATA_PATH.read_text()) if METADATA_PATH.exists() else {}
        return metadata

    logger.info("[medical_audio] Generating synthetic dataset …")
    from app.services.medical_audio.dataset import generate_dataset, save_dataset_manifest
    wav_dir = Path(__file__).resolve().parents[3] / "data" / "medical_audio"
    X, y, class_names = generate_dataset(samples_per_class=samples_per_class, save_wavs=True, wav_dir=wav_dir)

    save_dataset_manifest(wav_dir)
    logger.info(f"[medical_audio] Dataset: {X.shape[0]} samples × {X.shape[1]} features, {len(class_names)} classes.")

    # ----  Split -----------------------------------------------------------
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_fraction, stratify=y, random_state=random_state
    )

    # ---- Scale ------------------------------------------------------------
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # ---- Train ------------------------------------------------------------
    logger.info(f"[medical_audio] Training RandomForest (n_estimators={n_estimators}) …")
    t0 = time.perf_counter()
    clf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=None,
        min_samples_split=4,
        class_weight="balanced",
        random_state=random_state,
        n_jobs=-1,
    )
    clf.fit(X_train_s, y_train)
    elapsed = time.perf_counter() - t0
    logger.info(f"[medical_audio] Training completed in {elapsed:.2f}s.")

    # ---- Evaluate ---------------------------------------------------------
    y_pred = clf.predict(X_test_s)
    acc = float(accuracy_score(y_test, y_pred))
    report = classification_report(y_test, y_pred, target_names=class_names, output_dict=True)
    logger.info(f"[medical_audio] Test accuracy: {acc:.4f}")
    logger.info(f"\n{classification_report(y_test, y_pred, target_names=class_names)}")

    # ---- Per-class accuracy -----------------------------------------------
    per_class_acc: Dict[str, float] = {}
    for i, cls in enumerate(class_names):
        mask = y_test == i
        if mask.sum() > 0:
            per_class_acc[cls] = float((y_pred[mask] == y_test[mask]).mean())

    # ---- Save model -------------------------------------------------------
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    metadata: Dict[str, Any] = {
        "accuracy": acc,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_features": int(X.shape[1]),
        "n_classes": len(class_names),
        "class_names": class_names,
        "per_class_accuracy": per_class_acc,
        "n_estimators": n_estimators,
        "train_time_s": round(elapsed, 3),
        "model_path": str(MODEL_PATH),
        "scaler_path": str(SCALER_PATH),
        "classification_report": report,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2))
    logger.info(f"[medical_audio] Model saved to {MODEL_PATH}")
    return metadata


if __name__ == "__main__":
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    force = "--force" in sys.argv or "-f" in sys.argv
    meta = train(force_retrain=force)
    print("\n===== Training Summary =====")
    print(f"  Accuracy  : {meta.get('accuracy', 'N/A'):.4f}")
    print(f"  Classes   : {meta.get('class_names', [])}")
    print(f"  Train time: {meta.get('train_time_s', 'N/A')}s")
    print(f"  Model     : {meta.get('model_path', 'N/A')}")
