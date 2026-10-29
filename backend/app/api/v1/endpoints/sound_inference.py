"""
endpoints/sound_inference.py
============================
REST API for medical equipment sound classification.

Endpoints
---------
POST /api/v1/sound-inference/classify
    Upload an audio file → get predicted equipment condition + severity.

GET  /api/v1/sound-inference/model-info
    Returns model metadata (accuracy, class names, training stats).

GET  /api/v1/sound-inference/classes
    Returns the list of supported equipment condition classes.

POST /api/v1/sound-inference/classify-and-index
    Classify audio AND push result into the RAG vector store.
    Requires Expert or Admin role.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.logging import logger
from app.db.session import get_db
from app.core.permissions import ROLE_ADMIN, ROLE_EXPERT
from app.models.user import User
from app.services.medical_audio.dataset import CLASSES, CONDITION_DESCRIPTIONS
from app.services.medical_audio.inference import (
    SoundPrediction,
    get_model_info,
    index_prediction_to_rag,
    predict_from_bytes,
)

router = APIRouter(prefix="/sound-inference", tags=["Sound Inference"])

# ------------------------------------------------------------------ auth helper

def _current_user(request) -> Optional[User]:
    """Minimal session-based user extraction reusing the app's existing pattern."""
    return getattr(request.state, "user", None)


def _require_login(request) -> User:
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    return user


def _require_expert_or_admin(request) -> User:
    user = _require_login(request)
    if user.role.name not in (ROLE_EXPERT, ROLE_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Expert or Admin role required.")
    return user


# ------------------------------------------------------------------ schemas

class ClassifyResponse(BaseModel):
    predicted_class: str
    confidence: float = Field(description="Model confidence 0–1 for top class.")
    condition_description: str
    severity: str = Field(description="normal | critical")
    probabilities: Dict[str, float]
    inference_time_ms: float
    model_version: str
    error: Optional[str] = None


class ModelInfoResponse(BaseModel):
    model_ready: bool
    model_version: str
    accuracy: Optional[float]
    n_classes: Optional[int]
    class_names: Optional[List[str]]
    n_features: Optional[int]
    n_train: Optional[int]
    n_test: Optional[int]
    train_time_s: Optional[float]


class ClassifyAndIndexResponse(ClassifyResponse):
    rag_embedding_id: Optional[str] = None
    indexed: bool = False


class ClassEntry(BaseModel):
    class_name: str
    description: str


# ------------------------------------------------------------------ endpoints

@router.post(
    "/classify",
    response_model=ClassifyResponse,
    summary="Classify medical equipment sound",
    description=(
        "Upload a WAV, MP3, OGG, FLAC, or WebM audio file. "
        "The model returns the predicted equipment condition and severity."
    ),
)
async def classify_audio(
    file: UploadFile = File(..., description="Audio file to classify."),
):
    if file.content_type and not any(
        ct in file.content_type
        for ct in ("audio", "video", "octet-stream", "multipart")
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type: {file.content_type}. Upload an audio file.",
        )

    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    MAX_BYTES = 50 * 1024 * 1024  # 50 MB
    if len(audio_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")

    pred: SoundPrediction = predict_from_bytes(audio_bytes, filename=file.filename or "upload.wav")

    if pred.error == "model_not_loaded":
        raise HTTPException(status_code=503, detail="Model not ready — please retry in a moment.")

    return ClassifyResponse(
        predicted_class=pred.predicted_class,
        confidence=pred.confidence,
        condition_description=pred.condition_description,
        severity=pred.severity,
        probabilities=pred.probabilities,
        inference_time_ms=pred.inference_time_ms,
        model_version=pred.model_version,
        error=pred.error,
    )


@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Get model metadata",
)
async def model_info():
    info = get_model_info()
    return ModelInfoResponse(**info)


@router.get(
    "/classes",
    response_model=List[ClassEntry],
    summary="List supported equipment condition classes",
)
async def list_classes():
    return [
        ClassEntry(class_name=c, description=CONDITION_DESCRIPTIONS.get(c, c))
        for c in CLASSES
    ]


@router.post(
    "/classify-and-index",
    response_model=ClassifyAndIndexResponse,
    summary="Classify audio and index result into the RAG knowledge store",
    description=(
        "Expert/Admin only. Classifies the uploaded audio then pushes the "
        "condition description into the vector knowledge store so the AI Tutor "
        "can answer questions about equipment sounds."
    ),
)
async def classify_and_index(
    file: UploadFile = File(...),
    machine_id: Optional[str] = Form(None, description="Optional machine UUID to tag the embedding."),
    media_id: Optional[str] = Form(None, description="Optional media asset UUID."),
    db: Session = Depends(get_db),
):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    pred: SoundPrediction = predict_from_bytes(audio_bytes, filename=file.filename or "audio.wav")

    if pred.error == "model_not_loaded":
        raise HTTPException(status_code=503, detail="Model not ready.")

    rag_id: Optional[str] = None
    indexed = False
    try:
        rag_id = index_prediction_to_rag(
            db=db,
            prediction=pred,
            media_id=media_id,
            machine_id=machine_id,
            audio_source="api_classify_and_index",
        )
        indexed = True
    except Exception as exc:
        logger.error(f"[sound_inference] RAG indexing failed: {exc}")

    return ClassifyAndIndexResponse(
        predicted_class=pred.predicted_class,
        confidence=pred.confidence,
        condition_description=pred.condition_description,
        severity=pred.severity,
        probabilities=pred.probabilities,
        inference_time_ms=pred.inference_time_ms,
        model_version=pred.model_version,
        error=pred.error,
        rag_embedding_id=rag_id,
        indexed=indexed,
    )
