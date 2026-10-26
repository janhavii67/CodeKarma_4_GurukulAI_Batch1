import json
import os
import shutil
import uuid
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
from app.models.processing_job import ProcessingJob
from app.schemas.voice import (
    VoiceUploadResponse,
    MediaAssetResponse,
    TranscriptResponse,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdate,
    VectorSearchRequest,
    VectorSearchResponse,
    VectorSearchItemResponse,
    StepDraftResponse,
    StepsListResponse,
    CreateDraftFromVoiceResponse,
    ProcessingJobResponse,
)
from app.services.voice_service import (
    create_voice_capture_job,
    update_transcript_segment,
)
from app.services.job_runner import execute_voice_processing_job
from app.services.vector_service import search_vector_knowledge

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
    stored_filename = f"voice_{auth_ctx.user.id}_{uuid.uuid4().hex}{file_extension}"
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


@router.get("/assets/{media_id}/transcript", response_model=TranscriptResponse)
@router.get("/media/{media_id}/transcript", response_model=TranscriptResponse)
def get_media_transcript(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve timestamped narration transcript and segments for a specific media asset."""
    transcript = (
        db.query(Transcript)
        .filter(Transcript.media_id == media_id)
        .order_by(desc(Transcript.created_at))
        .first()
    )
    if not transcript:
        raise NotFoundError(code="transcript_not_found", message=f"No transcript found for media asset '{media_id}'.")
    return transcript


@router.get("/assets/{media_id}/steps", response_model=StepsListResponse)
@router.get("/media/{media_id}/steps", response_model=StepsListResponse)
def get_media_steps(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve structured candidate SOP steps for an expert voice recording."""
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    steps: List[dict] = []
    origin = "ai_draft"
    unclear: List[int] = []

    if media.version_id:
        version = db.get(KnowledgeVersion, media.version_id)
        if version:
            origin = version.origin or "ai_draft"
            if version.steps:
                steps = json.loads(version.steps) if isinstance(version.steps, str) else version.steps

    for s in steps:
        if isinstance(s, dict) and s.get("needs_review") and s.get("source_segment_ids"):
            unclear.extend(s.get("source_segment_ids"))

    return StepsListResponse(
        media_id=media.id,
        version_id=media.version_id,
        origin=origin,
        steps=steps,
        unclear_segments=list(set(unclear)),
    )


@router.post("/assets/{media_id}/create-draft", response_model=CreateDraftFromVoiceResponse)
async def create_draft_from_voice_asset(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """
    Create or attach an editable Knowledge draft SOP from this voice recording.
    Populates candidate steps from its transcript if not already linked.
    """
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    from app.repositories.knowledge_repository import KnowledgeRepository
    from app.services.structuring_service import structure_transcript_with_ai

    if media.version_id:
        version = db.get(KnowledgeVersion, media.version_id)
        if version:
            steps_list = json.loads(version.steps) if isinstance(version.steps, str) else (version.steps or [])
            return CreateDraftFromVoiceResponse(
                item_id=version.item_id,
                version_id=version.id,
                title=version.title or media.title,
                status=version.status,
                origin=version.origin or "ai_draft",
                steps_count=len(steps_list),
            )

    # Find transcript
    transcript = (
        db.query(Transcript)
        .filter(Transcript.media_id == media.id)
        .order_by(desc(Transcript.created_at))
        .first()
    )

    steps_payload = []
    summary_text = "Standard Operating Procedure generated from expert voice recording."
    if transcript and transcript.segments:
        structured = await structure_transcript_with_ai(
            segments=transcript.segments,
            machine_name=media.machine.name if media.machine else None,
        )
        steps_payload = [step.model_dump() for step in structured.steps]
        summary_text = structured.summary or summary_text

    item, version = KnowledgeRepository.create_item_and_version_1(
        db=db,
        title=media.title or f"Voice SOP - {media.original_name}",
        author_id=auth_ctx.user.id,
        machine_id=media.machine_id,
        summary=summary_text,
        commit=False,
    )
    version.origin = "ai_draft"
    version.steps = steps_payload

    media.version_id = version.id
    if transcript:
        transcript.version_id = version.id

    db.commit()
    db.refresh(version)

    return CreateDraftFromVoiceResponse(
        item_id=item.id,
        version_id=version.id,
        title=version.title,
        status=version.status,
        origin=version.origin,
        steps_count=len(steps_payload),
    )


@router.get("/jobs/{job_id}", response_model=ProcessingJobResponse)
def get_voice_job(
    job_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve processing job status and progress for voice transcription pipeline."""
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise NotFoundError(code="job_not_found", message=f"Processing job '{job_id}' not found.")
    return job


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
