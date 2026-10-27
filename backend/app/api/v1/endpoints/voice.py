import os
import shutil
import json
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.core.config import settings
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
)
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.models.media import MediaAsset
from app.models.transcript import Transcript, TranscriptSegment
from app.models.knowledge import KnowledgeVersion
from app.schemas.voice import (
    VoiceUploadResponse,
    MediaAssetResponse,
    TranscriptResponse,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdate,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorSearchItemResponse,
)
from app.services.voice_service import (
    create_voice_capture_job,
    update_transcript_segment,
)
from app.services.job_runner import execute_voice_processing_job
from app.services.vector_service import search_vector_knowledge
from app.services.vector_service import compute_dense_embedding
from app.models.embedding import KnowledgeEmbedding

router = APIRouter(prefix="/voice", tags=["Voice to Knowledge & RAG"])


@router.post("/upload", response_model=VoiceUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_voice_narration(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    machine_id: Optional[str] = Form(None),
    version_id: Optional[str] = Form(None),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """
    Upload an expert voice narration audio/video recording.
    Stores media asset, indexes into vector store for RAG, and launches background transcription.
    """
    media_dir = Path(settings.MEDIA_DIR)
    media_dir.mkdir(parents=True, exist_ok=True)

    file_extension = Path(file.filename or "recording.webm").suffix or ".webm"
    stored_filename = f"voice_{auth_ctx.user.id}_{int(os.times().elapsed * 1000)}{file_extension}"
    target_path = media_dir / stored_filename

    # Save uploaded file to disk
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = target_path.stat().st_size
    mime_type = file.content_type or "audio/webm"

    media, job = create_voice_capture_job(
        db=db,
        user_id=auth_ctx.user.id,
        file_path=str(target_path),
        original_name=file.filename or "recording.webm",
        mime_type=mime_type,
        size_bytes=file_size,
        title=title,
        machine_id=machine_id,
        version_id=version_id,
    )

    # Queue async processing pipeline in background
    background_tasks.add_task(execute_voice_processing_job, job.id)

    return VoiceUploadResponse(
        media=MediaAssetResponse.model_validate(media),
        job=job,
    )


@router.post("/knowledge-versions/{version_id}/voice", response_model=VoiceUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def attach_voice_to_version(
    version_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """
    Directly attach expert voice narration to an editable knowledge draft version.
    """
    version = db.get(KnowledgeVersion, version_id)
    if not version:
        raise NotFoundError(code="version_not_found", message=f"KnowledgeVersion '{version_id}' not found.")

    if version.created_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="not_author", message="Only the draft author can attach voice narrations.")

    return await upload_voice_narration(
        background_tasks=background_tasks,
        file=file,
        title=title or f"Narration for {version.title}",
        machine_id=version.machine_id,
        version_id=version.id,
        auth_ctx=auth_ctx,
        db=db,
    )


@router.get("/assets", response_model=List[MediaAssetResponse])
def list_voice_assets(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List expert voice recordings available across the platform."""
    query = db.query(MediaAsset).filter(MediaAsset.kind == "audio")
    if machine_id:
        query = query.filter(MediaAsset.machine_id == machine_id)

    return query.order_by(desc(MediaAsset.created_at)).all()


@router.get("/assets/{media_id}", response_model=MediaAssetResponse)
def get_voice_asset(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve details for a specific expert voice capture."""
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")
    return media


@router.get("/knowledge-versions/{version_id}/transcript", response_model=TranscriptResponse)
def get_version_transcript(
    version_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve timestamped narration transcript and segments for a knowledge version.
    """
    transcript = (
        db.query(Transcript)
        .filter(Transcript.version_id == version_id)
        .order_by(desc(Transcript.created_at))
        .first()
    )
    if not transcript:
        raise NotFoundError(code="transcript_not_found", message=f"No transcript found for version '{version_id}'.")

    return transcript


@router.get("/transcripts/{transcript_id}", response_model=TranscriptResponse)
def get_transcript(transcript_id: str, auth_ctx: AuthenticatedContext = Depends(get_current_user), db: Session = Depends(get_db)):
    transcript = db.get(Transcript, transcript_id)
    if not transcript:
        raise NotFoundError(code="transcript_not_found", message="Transcript not found.")
    return transcript


@router.patch("/transcripts/{transcript_id}", response_model=TranscriptResponse)
def edit_transcript(transcript_id: str, payload: dict,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    transcript = db.get(Transcript, transcript_id)
    if not transcript:
        raise NotFoundError(code="transcript_not_found", message="Transcript not found.")
    if not isinstance(payload.get("full_text"), str) or not payload["full_text"].strip():
        raise ValidationError(code="invalid_transcript", message="Transcript text cannot be empty.")
    if transcript.media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="forbidden", message="You may only edit transcripts for your own recordings.")
    transcript.full_text = payload["full_text"].strip()
    db.commit(); db.refresh(transcript)
    emb = db.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.source_type == "voice_transcript",
        KnowledgeEmbedding.source_id == transcript.id).first()
    if emb:
        emb.chunk_text = transcript.full_text
        emb.embedding_json = json.dumps(compute_dense_embedding(transcript.full_text))
        db.commit()
    return transcript


@router.patch("/transcripts/{transcript_id}/segments/{segment_id}", response_model=TranscriptSegmentResponse)
def patch_transcript_segment(
    transcript_id: str,
    segment_id: str,
    payload: TranscriptSegmentUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """
    Edit segment text or clear review flag.
    Re-indexes updated segment vector in vector store for updated RAG search.
    """
    segment = update_transcript_segment(
        db=db,
        segment_id=segment_id,
        user_id=auth_ctx.user.id,
        edited_text=payload.edited_text,
        needs_review=payload.needs_review,
    )
    return segment


@router.post("/search", response_model=VectorSearchResponse)
def search_voice_knowledge_vector(
    payload: VectorSearchRequest,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Semantic Vector Search API across expert voice knowledge and SOP chunks.
    Powers RAG models and real-time shop floor knowledge retrieval by finding
    the exact timestamped audio segments matching natural language queries.
    """
    results = search_vector_knowledge(
        db=db,
        query=payload.query,
        top_k=payload.top_k,
        machine_id=payload.machine_id,
        source_type=payload.source_type,
    )

    items = [
        VectorSearchItemResponse(
            id=r.id,
            source_type=r.source_type,
            source_id=r.source_id,
            chunk_text=r.chunk_text,
            similarity_score=r.similarity_score,
            media_id=r.media_id,
            media_title=r.media_title,
            file_path=r.file_path,
            version_id=r.version_id,
            machine_id=r.machine_id,
            start_s=r.start_s,
            end_s=r.end_s,
            metadata=r.metadata,
        )
        for r in results
    ]

    return VectorSearchResponse(
        query=payload.query,
        total=len(items),
        results=items,
    )


@router.get("/stream/{media_id}")
def stream_voice_audio(
    media_id: str,
    db: Session = Depends(get_db),
):
    """
    Stream audio file directly to browser audio player for click-to-seek playback.
    """
    media = db.get(MediaAsset, media_id)
    if not media or not Path(media.file_path).exists():
        raise NotFoundError(code="audio_not_found", message="Audio media file not found on disk.")

    return FileResponse(
        path=media.file_path,
        media_type=media.mime_type or "audio/webm",
        filename=media.original_name,
    )
