import hashlib
import json
from pathlib import Path
from typing import Optional, Tuple, List
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.media import MediaAsset
from app.models.processing_job import ProcessingJob
from app.models.transcript import Transcript, TranscriptSegment
from app.models.knowledge import KnowledgeVersion
from app.integrations.media.ffmpeg import probe_duration
from app.services.vector_service import compute_dense_embedding, KnowledgeEmbedding, EMBEDDING_DIM
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError, ConflictError
from app.core.logging import logger

MAX_DURATION_SECONDS = 300.0  # 5 minutes maximum


def create_voice_capture_job(
    db: Session,
    user_id: str,
    file_path: str,
    original_name: str,
    mime_type: str,
    size_bytes: int,
    title: Optional[str] = None,
    machine_id: Optional[str] = None,
    version_id: Optional[str] = None,
    content_sha256: Optional[str] = None,
) -> Tuple[MediaAsset, ProcessingJob]:
    """
    Creates media asset record, validates duration <= 5 minutes,
    and initializes an idempotent ProcessingJob for background transcription and RAG vector indexing.
    """
    audio_path = Path(file_path)
    if not audio_path.exists():
        raise ValidationError(code="file_not_found", message=f"Audio file '{file_path}' does not exist.")

    # Validate duration limit
    duration = probe_duration(audio_path)
    if duration > MAX_DURATION_SECONDS:
        raise ValidationError(
            code="duration_exceeded",
            message=f"Audio duration ({duration:.1f}s) exceeds the maximum allowed limit of 5 minutes (300s).",
        )

    # If linked to a knowledge version, verify ownership and draft status
    if version_id:
        version = db.get(KnowledgeVersion, version_id)
        if not version:
            raise NotFoundError(code="version_not_found", message=f"Knowledge version '{version_id}' not found.")
        if version.status not in ("draft", "changes_requested"):
            raise ForbiddenError(code="version_not_editable", message="Voice can only be attached to editable drafts.")

    idempotency_key = f"voice:{media_idempotency_digest(user_id, version_id, content_sha256)}" if content_sha256 else None
    if idempotency_key:
        existing_job = db.query(ProcessingJob).filter_by(idempotency_key=idempotency_key).first()
        existing_media = db.get(MediaAsset, existing_job.media_id) if existing_job and existing_job.media_id else None
        if existing_job and existing_media:
            if not Path(existing_media.file_path).exists():
                existing_media.file_path = str(audio_path.resolve())
                existing_media.size_bytes = size_bytes
                existing_job.status = "queued"
                existing_job.progress = 0
                existing_job.error_safe = None
                db.commit()
                db.refresh(existing_media)
                db.refresh(existing_job)
            return existing_media, existing_job

    if not version_id:
        # Auto-create draft KnowledgeItem and KnowledgeVersion for standalone voice narrations
        from app.repositories.knowledge_repository import KnowledgeRepository
        draft_title = title or (f"Voice SOP - {original_name}" if original_name else "Expert Voice Narration SOP")
        item, version = KnowledgeRepository.create_item_and_version_1(
            db=db,
            title=draft_title,
            author_id=user_id,
            machine_id=machine_id,
            summary="Draft Standard Operating Procedure generated from expert shop floor voice narration.",
            commit=False,
        )
        version.origin = "ai_draft"
        version_id = version.id

    # 1. Create MediaAsset
    media = MediaAsset(
        title=title or (f"Voice Narration - {original_name}" if original_name else "Expert Voice Narration"),
        machine_id=machine_id,
        version_id=version_id,
        kind="audio",
        file_path=str(audio_path.resolve()),
        original_name=original_name or "recording.webm",
        mime_type=mime_type or "audio/webm",
        size_bytes=size_bytes,
        duration_seconds=duration,
        uploaded_by=user_id,
    )
    db.add(media)
    db.flush()

    # 2. Idempotent ProcessingJob
    job = ProcessingJob(
        type="voice_to_knowledge",
        media_id=media.id,
        version_id=version_id,
        status="queued",
        progress=0,
        idempotency_key=idempotency_key or f"voice:{media.id}",
        user_id=user_id,
        created_by=user_id,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing_job = db.query(ProcessingJob).filter_by(idempotency_key=idempotency_key).first()
            existing_media = db.get(MediaAsset, existing_job.media_id) if existing_job and existing_job.media_id else None
            if existing_job and existing_media:
                return existing_media, existing_job
        raise
    db.refresh(media)
    db.refresh(job)

    logger.info(f"Created voice media asset {media.id} and processing job {job.id}.")

    from app.services.audit_service import AuditService
    AuditService.log(
        db=db,
        action="voice.upload",
        entity_type="media_asset",
        entity_id=media.id,
        actor_id=user_id,
        detail={"title": media.title, "mime": media.mime_type, "size_bytes": size_bytes, "job_id": job.id},
        commit=True,
    )
    return media, job


def media_idempotency_digest(user_id: str, version_id: Optional[str], content_sha256: str) -> str:
    """Scope a content digest to its uploader and target draft, keeping the DB key short."""
    scope = f"{user_id}:{version_id or 'standalone'}:{content_sha256.lower()}"
    return "v2:" + hashlib.sha256(scope.encode("utf-8")).hexdigest()


def retry_voice_job(db: Session, job_id: str, user_id: str, can_review: bool = False) -> ProcessingJob:
    """
    Retries a failed processing job if under retry limit (attempts < 3).
    """
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise NotFoundError(code="job_not_found", message=f"Processing job '{job_id}' not found.")

    if job.created_by != user_id and not can_review:
        raise ForbiddenError(code="forbidden", message="You may only retry your own transcription jobs.")

    if job.status != "failed":
        raise ValidationError(code="job_not_failed", message=f"Job status is '{job.status}'. Only failed jobs can be retried.")

    if job.attempts >= 3:
        raise ValidationError(code="max_retries_exceeded", message="Maximum retry limit (3 attempts) reached for this job.")

    if db.query(Transcript).filter(Transcript.media_id == job.media_id).first():
        raise ConflictError(code="transcript_exists", message="A transcript already exists for this recording. Review or edit the existing transcript instead of retrying.")

    job.status = "queued"
    job.progress = 0
    job.error_safe = None
    db.commit()
    db.refresh(job)
    return job


def update_transcript_segment(
    db: Session,
    segment_id: str,
    user_id: str,
    edited_text: Optional[str] = None,
    needs_review: Optional[bool] = None,
    can_review: bool = False,
) -> TranscriptSegment:
    """
    Edits segment text while keeping original_text untouched.
    Updates corresponding vector embedding in knowledge_embeddings.
    """
    segment = db.get(TranscriptSegment, segment_id)
    if not segment:
        raise NotFoundError(code="segment_not_found", message=f"Segment '{segment_id}' not found.")

    media = segment.transcript.media if segment.transcript else None
    if media and media.uploaded_by != user_id and not can_review:
        raise ForbiddenError(code="forbidden", message="You may only edit segments from your own recordings or recordings assigned for review.")

    if edited_text is not None:
        segment.edited_text = edited_text

    if needs_review is not None:
        segment.needs_review = needs_review

    db.commit()

    from app.services.audit_service import AuditService
    AuditService.log(
        db=db,
        action="voice.segment_edited",
        entity_type="transcript_segment",
        entity_id=segment.id,
        actor_id=user_id,
        detail={"edited_text": edited_text, "needs_review": needs_review},
        commit=True,
    )
    # Re-index updated segment vector in vector store
    new_text = segment.edited_text if segment.edited_text else segment.original_text
    new_vec = compute_dense_embedding(new_text)

    emb = db.query(KnowledgeEmbedding).filter(
        KnowledgeEmbedding.source_type == "voice_segment",
        KnowledgeEmbedding.source_id == segment.id,
    ).first()

    if emb:
        emb.chunk_text = new_text
        emb.embedding_json = json.dumps(new_vec)
        meta = emb.metadata_dict
        meta["needs_review"] = segment.needs_review
        meta["edited"] = True
        emb.metadata_json = json.dumps(meta)
    db.commit()

    # Refresh Assistant RAG knowledge chunks for this transcript
    try:
        from app.modules.assistant.services.indexing_service import IndexingService
        media = segment.transcript.media if segment.transcript else None
        title = media.title if media else None
        IndexingService.index_transcript(segment.transcript_id, db=db, title=title)
    except Exception as e:
        logger.error(f"Failed to update RAG chunks for edited segment {segment_id}: {e}")

    db.refresh(segment)
    return segment


def validate_version_for_submission(db: Session, version_id: str) -> None:
    """
    Enforces Strict Submission Invariants for Voice-Generated SOPs:
    1. Blocks submission if any step has needs_review=True.
    2. Blocks submission if latest voice processing job is currently processing or failed.
    """
    version = db.get(KnowledgeVersion, version_id)
    if not version:
        raise NotFoundError(code="version_not_found", message=f"Version '{version_id}' not found.")

    # 1. Check latest processing job for this version
    latest_job = (
    db.query(ProcessingJob)
    .filter(ProcessingJob.version_id == version_id)
    .order_by((ProcessingJob.created_at).desc())
    .first()
    )

    if latest_job:
        if latest_job.status in ("queued", "processing"):
            raise ValidationError(
                code="voice_processing_in_progress",
                message="Cannot submit version while voice narration is still processing. Please wait for transcription and structuring to complete.",
            )
        if latest_job.status == "failed":
            raise ValidationError(
                code="voice_processing_failed",
                message="Cannot submit version with a failed voice narration job. Please retry the job or remove the failed draft.",
            )

    # 2. Check steps for unresolved review flags
    if version.steps:
        try:
            steps_list = json.loads(version.steps) if isinstance(version.steps, str) else version.steps
            flagged_steps = []
            for idx, s in enumerate(steps_list, start=1):
                if s.get("needs_review") is True:
                    reason = s.get("note") or "Missing parameter or unverified tolerance"
                    flagged_steps.append(f"Step #{idx} ('{s.get('title')}'): {reason}")

            if flagged_steps:
                raise ValidationError(
                    code="unresolved_step_flags",
                    message=f"Submission blocked: {len(flagged_steps)} steps require expert review. Please verify values: {'; '.join(flagged_steps[:3])}",
                )
        except json.JSONDecodeError:
            pass
