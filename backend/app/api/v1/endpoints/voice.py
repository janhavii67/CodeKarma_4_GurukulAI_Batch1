import hashlib
import json
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.db.session import get_db
from app.core.config import settings
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
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

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".webm", ".mp4"}
ALLOWED_AUDIO_MIME_TYPES = {
    "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a",
    "audio/aac", "audio/ogg", "audio/webm", "video/mp4", "application/octet-stream",
}


async def _store_validated_audio(file: UploadFile, target_path: Path) -> int:
    original_name = Path(file.filename or "recording.webm").name
    extension = Path(original_name).suffix.lower()
    mime_type = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
    if extension not in ALLOWED_AUDIO_EXTENSIONS or mime_type not in ALLOWED_AUDIO_MIME_TYPES:
        raise ValidationError(code="unsupported_audio_type", message="Upload an audio recording in WAV, MP3, M4A, AAC, OGG, WebM, or MP4 format.")

    limit = max(1, int(settings.MAX_UPLOAD_BYTES))
    size = 0
    try:
        with target_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ValidationError(code="upload_too_large", message=f"Audio recording exceeds the {limit // (1024 * 1024)} MB upload limit.")
                output.write(chunk)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    if size == 0:
        target_path.unlink(missing_ok=True)
        raise ValidationError(code="empty_upload", message="The uploaded audio file is empty.")
    return size


def _sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    if version_id:
        version = db.get(KnowledgeVersion, version_id)
        if not version:
            raise NotFoundError(code="version_not_found", message=f"KnowledgeVersion '{version_id}' not found.")
        if version.created_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
            raise ForbiddenError(code="not_author", message="Only the draft author or an admin can attach a recording.")
        if version.status not in ("draft", "changes_requested"):
            raise ForbiddenError(code="version_not_editable", message="Recordings can only be attached to editable drafts.")
        existing_media_count = db.query(MediaAsset).filter(MediaAsset.version_id == version_id).count()
        if existing_media_count >= settings.MAX_MEDIA_PER_VERSION:
            raise ValidationError(code="media_limit_exceeded", message="This knowledge version has reached its media attachment limit.")

    media_dir = Path(settings.MEDIA_DIR)
    media_dir.mkdir(parents=True, exist_ok=True)

    file_extension = Path(file.filename or "recording.webm").suffix.lower() or ".webm"
    stored_filename = f"voice_{auth_ctx.user.id}_{uuid.uuid4().hex}{file_extension}"
    target_path = media_dir / stored_filename

    file_size = await _store_validated_audio(file, target_path)
    mime_type = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
    try:
        media, job = create_voice_capture_job(
            db=db,
            user_id=auth_ctx.user.id,
            file_path=str(target_path),
            original_name=Path(file.filename or "recording.webm").name,
            mime_type=mime_type,
            size_bytes=file_size,
            title=title,
            machine_id=machine_id,
            version_id=version_id,
            content_sha256=_sha256_file(target_path),
        )
    except Exception:
        target_path.unlink(missing_ok=True)
        raise

    # A byte-identical re-upload reuses its original media/job and doesn't enqueue work twice.
    is_duplicate = Path(media.file_path).resolve() != target_path.resolve()
    if is_duplicate:
        target_path.unlink(missing_ok=True)
    else:
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
    """List expert voice recordings available to the current user."""
    # Trainees cannot view raw voice draft recordings
    if auth_ctx.user.role_id == "TRAINEE":
        return []

    query = db.query(MediaAsset).filter(MediaAsset.kind == "audio")
    if machine_id:
        query = query.filter(MediaAsset.machine_id == machine_id)

    # Reviewers can inspect recordings attached to submissions awaiting approval.
    if auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE in auth_ctx.permissions:
        query = query.outerjoin(KnowledgeVersion, MediaAsset.version_id == KnowledgeVersion.id).filter(
            or_(MediaAsset.uploaded_by == auth_ctx.user.id, KnowledgeVersion.status == "in_review")
        ).distinct()
    elif auth_ctx.user.role_id != "ADMIN":
        query = query.filter(MediaAsset.uploaded_by == auth_ctx.user.id)

    assets = query.order_by(desc(MediaAsset.created_at)).all()
    media_root = Path(settings.MEDIA_ROOT).resolve()

    valid_assets = []
    for a in assets:
        p = Path(a.file_path)
        if (p.is_absolute() and p.exists()) or \
           (media_root / a.storage_key).resolve().exists() or \
           (media_root / Path(a.storage_key).name).resolve().exists() or \
           (Path("data/media") / Path(a.storage_key).name).resolve().exists():
            valid_assets.append(a)

    return valid_assets


@router.get("/assets/{media_id}", response_model=MediaAssetResponse)
def get_voice_asset(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve details for a specific expert voice capture with IDOR check."""
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    if auth_ctx.user.role_id == "TRAINEE":
        raise ForbiddenError(code="trainee_draft_forbidden", message="Trainees cannot access unapproved draft procedures.")

    if media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="not_author", message="You do not have access to this voice recording.")

    return media


@router.get("/assets/{media_id}/transcript", response_model=TranscriptResponse)
@router.get("/media/{media_id}/transcript", response_model=TranscriptResponse)
def get_media_transcript(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve timestamped narration transcript and segments for a specific media asset."""
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    if auth_ctx.user.role_id == "TRAINEE":
        raise ForbiddenError(code="trainee_draft_forbidden", message="Trainees cannot access unapproved draft procedures.")

    if media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="not_author", message="You do not have access to this voice recording.")

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
    """Retrieve structured candidate SOP steps for an expert voice recording with server-side gate metrics."""
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    if auth_ctx.user.role_id == "TRAINEE":
        raise ForbiddenError(code="trainee_draft_forbidden", message="Trainees cannot access unapproved draft procedures.")

    if media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="not_author", message="You do not have access to this voice recording.")

    steps: List[dict] = []
    origin = "ai_draft"
    unclear: List[int] = []
    item_id = None
    summary = None
    detailed_summary = None

    if media.version_id:
        version = db.get(KnowledgeVersion, media.version_id)
        if version:
            origin = version.origin or "ai_draft"
            item_id = version.item_id
            summary = version.summary
            detailed_summary = version.description
            if version.steps:
                steps = json.loads(version.steps) if isinstance(version.steps, str) else version.steps

    for s in steps:
        if isinstance(s, dict) and s.get("needs_review") and s.get("source_segment_ids"):
            unclear.extend(s.get("source_segment_ids"))

    flagged_count = sum(1 for s in steps if isinstance(s, dict) and s.get("needs_review") is True)
    can_submit = (flagged_count == 0)
    is_demo = getattr(settings, "DEMO_MODE", False) or any(
        "[ILLUSTRATIVE" in str(s.get("instruction", "")) for s in steps if isinstance(s, dict)
    )

    return StepsListResponse(
        media_id=media.id,
        version_id=media.version_id,
        item_id=item_id,
        summary=summary,
        detailed_summary=detailed_summary,
        origin=origin,
        steps=steps,
        unclear_segments=list(set(unclear)),
        flagged_count=flagged_count,
        can_submit=can_submit,
        is_demo=is_demo,
        submission_gate_status="OPEN" if can_submit else "BLOCKED_UNRESOLVED_FLAGS",
    )


@router.patch("/assets/{media_id}/steps/{step_idx}/verify", response_model=StepsListResponse)
def verify_candidate_step(
    media_id: str,
    step_idx: int,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """
    Expert author clears the 'needs_review' flag on a specific procedural step.
    Persists verification state to database and updates origin to 'ai_draft_edited'.
    """
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message=f"Media asset '{media_id}' not found.")

    if auth_ctx.user.role_id == "TRAINEE":
        raise ForbiddenError(code="trainee_edit_forbidden", message="Trainees cannot edit drafts.")

    if media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="not_author", message="Only the author or admin can verify draft steps.")

    if not media.version_id:
        raise NotFoundError(code="version_not_found", message="No knowledge version linked to this voice asset.")

    version = db.get(KnowledgeVersion, media.version_id)
    if not version:
        raise NotFoundError(code="version_not_found", message=f"Version '{media.version_id}' not found.")

    steps = json.loads(version.steps) if isinstance(version.steps, str) else (version.steps or [])
    target_idx = step_idx if step_idx < len(steps) else (step_idx - 1)
    if target_idx < 0 or target_idx >= len(steps):
        raise NotFoundError(code="step_not_found", message=f"Step index {step_idx} is out of bounds.")

    steps[target_idx]["needs_review"] = False
    verifier_name = auth_ctx.user.name or auth_ctx.user.email
    steps[target_idx]["note"] = f"Verified by Expert Author ({verifier_name})"

    version.steps = json.dumps(steps) if isinstance(version.steps, str) else steps
    version.origin = "ai_draft_edited"
    db.commit()
    db.refresh(version)

    from app.services.audit_service import AuditService
    AuditService.log(
        db=db,
        action="voice.step_verified",
        entity_type="knowledge_version",
        entity_id=version.id,
        actor_id=auth_ctx.user.id,
        detail={"step_idx": target_idx, "step_title": steps[target_idx].get("title")},
        commit=True,
    )

    unclear = [sid for s in steps if isinstance(s, dict) and s.get("needs_review") for sid in s.get("source_segment_ids", [])]
    flagged_count = sum(1 for s in steps if isinstance(s, dict) and s.get("needs_review") is True)
    can_submit = (flagged_count == 0)

    return StepsListResponse(
        media_id=media.id,
        version_id=version.id,
        item_id=version.item_id,
        summary=version.summary,
        detailed_summary=version.description,
        origin=version.origin,
        steps=steps,
        unclear_segments=list(set(unclear)),
        flagged_count=flagged_count,
        can_submit=can_submit,
        is_demo=getattr(settings, "DEMO_MODE", False),
        submission_gate_status="OPEN" if can_submit else "BLOCKED_UNRESOLVED_FLAGS",
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

    if media.uploaded_by != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="not_author", message="Only the recording owner or an admin can create a knowledge draft from this recording.")

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
    media = db.get(MediaAsset, job.media_id) if job.media_id else None
    if auth_ctx.user.role_id != "ADMIN" and (not media or media.uploaded_by != auth_ctx.user.id):
        raise ForbiddenError(code="not_author", message="You do not have access to this voice processing job.")
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

    media = db.get(MediaAsset, transcript.media_id) if transcript.media_id else None
    version = db.get(KnowledgeVersion, version_id)
    if auth_ctx.user.role_id == "TRAINEE" and (not version or version.status != "published"):
        raise ForbiddenError(code="trainee_draft_forbidden", message="Trainees cannot access unapproved transcripts.")
    if auth_ctx.user.role_id != "ADMIN" and (not media or media.uploaded_by != auth_ctx.user.id) and (not version or version.status != "published"):
        raise ForbiddenError(code="not_author", message="You do not have access to this transcript.")

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

    visible_results = []
    for result in results:
        media = db.get(MediaAsset, result.media_id) if result.media_id else None
        if not media and result.source_type == "voice_segment":
            segment = db.get(TranscriptSegment, result.source_id)
            media = segment.transcript.media if segment and segment.transcript else None
        version = db.get(KnowledgeVersion, result.version_id) if result.version_id else None
        if not version and media and media.version_id:
            version = db.get(KnowledgeVersion, media.version_id)
        is_owner = bool(media and media.uploaded_by == auth_ctx.user.id)
        is_published = bool(version and version.status == "published")
        # Legacy standalone vector rows without an associated recording are not
        # draft media records and remain searchable for backward compatibility.
        if auth_ctx.user.role_id == "ADMIN" or is_owner or is_published or not media:
            visible_results.append(result)

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
        for r in visible_results
    ]

    return VectorSearchResponse(
        query=payload.query,
        total=len(items),
        results=items,
    )


@router.get("/stream/{media_id}")
def stream_voice_audio(
    media_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream audio file directly to browser audio player for click-to-seek playback.
    """
    media = db.get(MediaAsset, media_id)
    if not media:
        raise NotFoundError(code="media_not_found", message="Media asset not found.")
    version = db.get(KnowledgeVersion, media.version_id) if media.version_id else None
    if auth_ctx.user.role_id == "TRAINEE" and (not version or version.status != "published"):
        raise ForbiddenError(code="trainee_draft_forbidden", message="Trainees cannot access unapproved recordings.")
    if auth_ctx.user.role_id != "ADMIN" and media.uploaded_by != auth_ctx.user.id and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions and (not version or version.status != "published"):
        raise ForbiddenError(code="not_author", message="You do not have access to this recording.")

    target_path = None
    media_root = Path(settings.MEDIA_ROOT).resolve()

    raw_path = Path(media.file_path)
    if raw_path.is_absolute() and raw_path.exists():
        target_path = raw_path
    elif (media_root / media.storage_key).resolve().exists():
        target_path = (media_root / media.storage_key).resolve()
    elif (media_root / Path(media.storage_key).name).resolve().exists():
        target_path = (media_root / Path(media.storage_key).name).resolve()
    elif (Path("data/media") / Path(media.storage_key).name).resolve().exists():
        target_path = (Path("data/media") / Path(media.storage_key).name).resolve()

    if not target_path or not target_path.exists():
        raise NotFoundError(code="audio_not_found", message="Audio media file not found on disk.")

    return FileResponse(
        path=str(target_path),
        media_type=media.mime_type or "audio/webm",
        filename=media.original_name,
    )
