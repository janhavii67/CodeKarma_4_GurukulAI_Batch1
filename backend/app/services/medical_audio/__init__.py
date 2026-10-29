"""
medical_audio/__init__.py
Exposes the public API of the medical_audio sub-package.
"""

from .inference import (
    predict_from_file,
    predict_from_bytes,
    predict_from_signal,
    get_model_info,
    index_prediction_to_rag,
    SoundPrediction,
)
from .dataset import (
    CLASSES,
    CLASS_TO_IDX,
    IDX_TO_CLASS,
    CONDITION_DESCRIPTIONS,
    extract_features,
    load_wav_features,
)

__all__ = [
    "predict_from_file",
    "predict_from_bytes",
    "predict_from_signal",
    "get_model_info",
    "index_prediction_to_rag",
    "SoundPrediction",
    "CLASSES",
    "CLASS_TO_IDX",
    "IDX_TO_CLASS",
    "CONDITION_DESCRIPTIONS",
    "extract_features",
    "load_wav_features",
]
