import asyncio
import json
import wave
from datetime import timedelta
from pathlib import Path
from typing import Optional
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.processing_job import ProcessingJob
from app.models.media import MediaAsset
from app.models.transcript import Transcript, TranscriptSegment
from app.models.knowledge import KnowledgeVersion
from app.integrations.media.ffmpeg import extract_audio_wav, probe_duration
from app.integrations.speech.factory import get_speech_provider
from app.integrations.speech.base import Segment
from app.services.vector_service import index_voice_transcript
from app.services.structuring_service import structure_transcript_with_ai, determine_segment_flags
from app.core.logging import logger
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.db.base import utc_now


# Active inference refreshes updated_at every 20 seconds, so a two-minute
# cutoff recovers lost background tasks quickly without timing out slow CPU work.
STALE_JOB_AFTER = timedelta(minutes=2)
STALE_JOB_MESSAGE = (
    "Transcription was interrupted before completion. The recording is still saved; retry when the backend is available."
)


def _is_audio_silent(audio_path: Path) -> bool:
    """Return whether a normalized PCM WAV contains only zero-valued samples."""
    try:
        with wave.open(str(audio_path), "rb") as wav_file:
            if wav_file.getnframes() == 0:
                return True
            if wav_file.getsampwidth() != 2:
                return False
            while frames := wav_file.readframes(65536):
                if any(frames):
                    return False
        return True
    except (EOFError, OSError, wave.Error):
        return False


def fail_stale_voice_jobs(db: Session, stale_before=None) -> int:
    """Make jobs abandoned by a stopped server retryable without touching media/transcripts."""
    cutoff = stale_before or (utc_now() - STALE_JOB_AFTER)
    stale = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.type == "voice_to_knowledge",
            ProcessingJob.status.in_(("queued", "processing")),
            ProcessingJob.updated_at < cutoff,
        )
        .all()
    )
    for job in stale:
        job.status = "failed"
        job.error_safe = STALE_JOB_MESSAGE
        job.updated_at = utc_now()
    if stale:
        db.commit()
    return len(stale)


async def _transcribe_with_heartbeat(
    provider, audio_path: Path, db: Session, job_id: str, interval_seconds: float = 20,
) -> list:
    """Keep long model downloads/loads/inference visibly alive in persisted job state."""
    task = asyncio.create_task(provider.transcribe(audio_path))
    try:
        while True:
            done, _ = await asyncio.wait({task}, timeout=interval_seconds)
            if done:
                return await task
            job = db.get(ProcessingJob, job_id)
            if job and job.status == "processing":
                job.updated_at = utc_now()
                db.commit()
    except asyncio.CancelledError:
        task.cancel()
        raise


async def execute_voice_processing_job(job_id: str, db: Optional[Session] = None) -> None:
    """
    Asynchronous background job runner executing the complete voice-to-knowledge pipeline:
    1. Audio Extraction & Normalization (ffmpeg -> 16kHz mono WAV)
    2. Speech-to-Text Transcription (Whisper) -> Timestamped Segments
    3. Store transcript in the existing RAG index as inactive until approval
    4. AI Structuring through the shared AI orchestrator into Candidate SOP Steps
    5. Draft Snapshot Update with Invariant Governance (origin: ai_draft, needs_review)
    """
    own_session = False
    stage = "starting"
    normalized_path: Optional[Path] = None
    if db is None:
        db = SessionLocal()
        own_session = True
    try:
        job = db.get(ProcessingJob, job_id)
        if not job:
            logger.error(f"ProcessingJob {job_id} not found in background runner.")
            return

        saved_transcript = (
            db.query(Transcript)
            .filter(Transcript.media_id == job.media_id)
            .first()
        ) if job.media_id else None
        resume_structuring = bool(saved_transcript and job.progress == 75)

        # Claim atomically so duplicate background task dispatches cannot run
        # transcription concurrently or create a second transcript.
        claim = db.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id, ProcessingJob.status == "queued")
            .values(
                status="processing",
                progress=75 if resume_structuring else 15,
                attempts=ProcessingJob.attempts + 1,
            )
        )
        if claim.rowcount != 1:
            logger.info("ProcessingJob %s was not queued. Skipping duplicate execution.", job_id)
            return

        db.commit()
        db.refresh(job)

        media = db.get(MediaAsset, job.media_id)
        if not media:
            job.status = "failed"
            job.error_safe = "The recording record for this processing job was not found."
            db.commit()
            return

        if resume_structuring:
            # Resume from saved, editable transcript rows. No audio decoding,
            # transcription, transcript writes, or duplicate vector indexing occur.
            transcript = saved_transcript
            segments_data = [
                Segment(
                    idx=segment.idx,
                    start_s=segment.start_s,
                    end_s=segment.end_s,
                    text=segment.edited_text or segment.original_text or segment.text,
                )
                for segment in sorted(transcript.segments, key=lambda item: item.idx)
            ]
            if not segments_data:
                job.status = "failed"
                job.error_safe = "The saved transcript has no timestamped segments to structure. Review the transcript manually; the recording and transcript were preserved."
                db.commit()
                return
        else:
            stored = Path(media.file_path)
            audio_file_path = stored if stored.is_absolute() and stored.exists() else (Path(settings.MEDIA_ROOT) / media.storage_key)
            if not audio_file_path.exists():
                job.status = "failed"
                job.error_safe = "Media audio file not found on disk."
                db.commit()
                return

            stage = "audio normalization"
            try:
                source_duration = probe_duration(audio_file_path)
            except ValidationError:
                source_duration = media.duration_seconds or 0
            if source_duration < 0.5:
                job.status = "failed"
                job.error_safe = "The recording is too short or empty to transcribe. Record at least half a second of audio and retry."
                db.commit()
                return

            input_path = audio_file_path
            wav_path = input_path.with_suffix(".16k.wav")
            normalized_path = wav_path
            extract_audio_wav(input_path, wav_path)

            if not media.duration_seconds or media.duration_seconds <= 0:
                media.duration_seconds = probe_duration(wav_path)
                db.commit()

            if _is_audio_silent(wav_path):
                job.status = "failed"
                job.error_safe = "No audible sound detected in narration. Please verify microphone input."
                db.commit()
                return

            job.progress = 35
            db.commit()

            stage = "speech transcription"
            speech_provider = get_speech_provider()
            segments_data = await _transcribe_with_heartbeat(speech_provider, wav_path, db, job_id)
            if not segments_data:
                job.status = "failed"
                job.error_safe = "No audible speech detected in narration. Please verify microphone input."
                db.commit()
                return

            full_text = " ".join([s.text for s in segments_data])
            existing_transcript = db.query(Transcript).filter(Transcript.media_id == media.id).first()
            if existing_transcript:
                raise ValidationError(
                    code="transcript_exists",
                    message="A transcript already exists for this recording. Review or edit the existing transcript.",
                )

            transcript = Transcript(
                media_id=media.id,
                version_id=job.version_id,
                raw_text=full_text,
                language=(
                    getattr(speech_provider, "detected_language", None)
                    or getattr(speech_provider, "language", None)
                    or "en"
                ),
                provider=getattr(speech_provider, "model", "default_stt"),
                full_text=full_text,
                status="completed",
            )
            db.add(transcript)
            db.flush()

            for seg in segments_data:
                is_seg_flagged, _ = determine_segment_flags(seg.text)
                db.add(TranscriptSegment(
                    transcript_id=transcript.id,
                    segment_order=seg.idx,
                    start_time_seconds=seg.start_s,
                    end_time_seconds=seg.end_s,
                    text=seg.text,
                    idx=seg.idx,
                    start_s=seg.start_s,
                    end_s=seg.end_s,
                    original_text=seg.text,
                    needs_review=is_seg_flagged,
                ))

            db.commit()
            db.refresh(transcript)
            job.progress = 60
            db.commit()

            try:
                index_voice_transcript(db=db, transcript=transcript, media=media, version_id=job.version_id)
            except Exception as e:
                logger.error(f"Vector indexing error for job {job_id}: {e}")

            try:
                from app.modules.assistant.services.indexing_service import IndexingService
                IndexingService.index_transcript(transcript.id, db=db, title=media.title)
            except Exception as e:
                logger.error(f"Assistant RAG transcript indexing error for job {job_id}: {e}")

            job.progress = 75
            db.commit()

        # 4. AI Structuring into SOP Steps
        stage = "AI structuring"
        machine_name = media.machine.name if media.machine else None
        structured_draft = await structure_transcript_with_ai(segments=segments_data, machine_name=machine_name)

        job.progress = 90
        db.commit()

        # 5. Populate Draft Version if linked
        if job.version_id:
            version = db.get(KnowledgeVersion, job.version_id)
            if version and version.status in ("draft", "changes_requested"):
                version.origin = "ai_draft"
                if structured_draft.title:
                    version.title = structured_draft.title[:256]
                version.summary = structured_draft.summary or ""
                version.description = structured_draft.detailed_summary or None
                version.content = json.dumps({
                    "overview": structured_draft.summary,
                    "detailed_summary": structured_draft.detailed_summary,
                    "key_points": structured_draft.key_points,
                    "machine": structured_draft.machine or machine_name,
                    "machine_model": structured_draft.machine_model,
                    "component_or_tool": structured_draft.component_or_tool,
                    "operation": structured_draft.operation,
                    "purpose": structured_draft.purpose,
                    "materials": structured_draft.materials,
                    "parameters": structured_draft.parameters,
                    "quality_checkpoints": structured_draft.quality_checkpoints,
                    "procedures": structured_draft.procedures,
                    "troubleshooting": structured_draft.troubleshooting,
                    "keywords": structured_draft.keywords,
                    "unclear_segments": structured_draft.unclear_segments,
                    "source": {"media_id": media.id, "transcript_id": transcript.id},
                }, ensure_ascii=False)
                version.safety_warnings = "\n".join(structured_draft.safety_precautions) or None
                version.common_mistakes = "\n".join(structured_draft.troubleshooting) or None
                version.operating_conditions = "\n".join(structured_draft.parameters) or None
                version.prerequisites = "\n".join(structured_draft.materials) or None
                version.corrective_actions = "\n".join(structured_draft.troubleshooting) or None

                steps_payload = [step.model_dump() for step in structured_draft.steps]
                version.steps = json.dumps(steps_payload)

                # Set review flags on segments marked unclear
                if structured_draft.unclear_segments:
                    for seg in transcript.segments:
                        if seg.idx in structured_draft.unclear_segments:
                            seg.needs_review = True

                db.commit()

        # Strict Invariant 1: AI generates drafts only. Always requires human expert review.
        job.status = "needs_review"
        job.progress = 100
        job.error_safe = None
        db.commit()
        logger.info(f"ProcessingJob {job_id} successfully completed pipeline. Status: needs_review.")

    except asyncio.CancelledError:
        try:
            db.rollback()
            job = db.get(ProcessingJob, job_id)
            if job and job.status == "processing":
                job.status = "failed"
                job.error_safe = STALE_JOB_MESSAGE
                job.updated_at = utc_now()
                db.commit()
        except Exception:
            db.rollback()
        raise
    except ValidationError as e:
        logger.error("Voice processing job %s failed (%s).", job_id, e.code)
        try:
            db.rollback()
            job = db.get(ProcessingJob, job_id)
            if job:
                job.status = "failed"
                safe_provider_errors = {
                    "stt_provider_not_configured",
                    "transcription_not_configured",
                    "transcription_quota_exceeded",
                    "transcription_rate_limited",
                    "transcription_provider_limited",
                    "transcription_failed",
                    "transcription_timeout",
                    "transcription_network_error",
                    "local_whisper_dependency_missing",
                    "local_whisper_dependency_incompatible",
                    "local_whisper_model_unavailable",
                    "local_transcription_failed",
                    "structuring_provider_not_configured",
                    "structuring_provider_disabled",
                }
                message = str(e)
                if e.code in safe_provider_errors:
                    job.error_safe = e.message
                elif "AI structuring" in message:
                    job.error_safe = message
                elif stage == "audio normalization":
                    job.error_safe = "The recording could not be decoded. Upload a supported audio format and retry."
                elif stage == "speech transcription":
                    job.error_safe = "Speech-to-text failed. Check the recording and configured speech provider, then retry."
                elif stage == "AI structuring":
                    job.error_safe = (
                        "The transcript is saved, but automatic procedure structuring could not complete. "
                        "Review the transcript manually and check the configured language-model provider and credentials."
                    )
                else:
                    job.error_safe = "Narration processing failed. The recording is saved; check processing service status before retrying."
                db.commit()
        except Exception:
            db.rollback()
    except Exception as e:
        logger.error("Error processing voice job %s (%s).", job_id, type(e).__name__, exc_info=True)
        try:
            # SQLAlchemy requires rollback after a flush/commit failure before
            # the job failure state itself can be persisted.
            db.rollback()
            job = db.get(ProcessingJob, job_id)
            if job:
                job.status = "failed"
                if stage == "speech transcription" and isinstance(e, (TimeoutError, asyncio.TimeoutError)):
                    job.error_safe = "Speech transcription timed out. Check the speech provider connection and retry."
                elif stage == "AI structuring":
                    job.error_safe = (
                        "The transcript is saved, but automatic procedure structuring could not complete. "
                        "Review the transcript manually and check the configured language-model provider and credentials."
                    )
                else:
                    job.error_safe = "Narration processing failed. The recording is saved; check processing service status before retrying."
                db.commit()
        except Exception:
            db.rollback()
    finally:
        if normalized_path:
            normalized_path.unlink(missing_ok=True)
        if own_session:
            db.close()
