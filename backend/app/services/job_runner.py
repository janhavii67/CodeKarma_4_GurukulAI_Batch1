import json
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.processing_job import ProcessingJob
from app.models.media import MediaAsset
from app.models.transcript import Transcript, TranscriptSegment
from app.models.knowledge import KnowledgeVersion
from app.integrations.media.ffmpeg import extract_audio_wav, probe_duration
from app.integrations.speech.factory import get_speech_provider
from app.services.vector_service import index_voice_transcript
from app.services.structuring_service import structure_transcript_with_ai, determine_segment_flags
from app.core.logging import logger


async def execute_voice_processing_job(job_id: str, db: Optional[Session] = None) -> None:
    """
    Asynchronous background job runner executing the complete voice-to-knowledge pipeline:
    1. Audio Extraction & Normalization (ffmpeg -> 16kHz mono WAV)
    2. Speech-to-Text Transcription (Whisper) -> Timestamped Segments
    3. Vector Indexing into Knowledge Embeddings store for RAG
    4. AI Structuring (Claude/Rules) into Candidate SOP Steps
    5. Draft Snapshot Update with Invariant Governance (origin: ai_draft, needs_review)
    """
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True
    try:
        job = db.get(ProcessingJob, job_id)
        if not job:
            logger.error(f"ProcessingJob {job_id} not found in background runner.")
            return

        if job.status in ("completed", "needs_review", "cancelled"):
            logger.info(f"ProcessingJob {job_id} is already in terminal state {job.status}. Skipping.")
            return

        # Mark job as processing
        job.status = "processing"
        job.progress = 15
        job.attempts += 1
        db.commit()

        media = db.get(MediaAsset, job.media_id)
        if not media or not Path(media.file_path).exists():
            job.status = "failed"
            job.error_safe = "Media audio file not found on disk."
            db.commit()
            return

        # 1. Normalize Audio
        input_path = Path(media.file_path)
        wav_path = input_path.with_suffix(".16k.wav")
        extract_audio_wav(input_path, wav_path)

        # Update media duration if missing
        if not media.duration_seconds or media.duration_seconds <= 0:
            media.duration_seconds = probe_duration(wav_path)
            db.commit()

        job.progress = 35
        db.commit()

        # 2. Speech-to-Text Transcription
        speech_provider = get_speech_provider()
        segments_data = await speech_provider.transcribe(wav_path)

        if not segments_data:
            job.status = "failed"
            job.error_safe = "No audible speech detected in narration. Please verify microphone input."
            db.commit()
            return

        full_text = " ".join([s.text for s in segments_data])

        # Delete any previous transcript for this media asset to maintain idempotency
        existing_transcript = db.query(Transcript).filter(Transcript.media_id == media.id).first()
        if existing_transcript:
            db.delete(existing_transcript)
            db.commit()

        transcript = Transcript(
            media_id=media.id,
            version_id=job.version_id,
            language="en",
            provider=getattr(speech_provider, "model", "default_stt"),
            full_text=full_text,
            status="completed",
        )
        db.add(transcript)
        db.flush()

        for seg in segments_data:
            is_seg_flagged, _ = determine_segment_flags(seg.text)
            t_seg = TranscriptSegment(
                transcript_id=transcript.id,
                idx=seg.idx,
                start_s=seg.start_s,
                end_s=seg.end_s,
                original_text=seg.text,
                needs_review=is_seg_flagged,
            )
            db.add(t_seg)

        db.commit()
        db.refresh(transcript)

        job.progress = 60
        db.commit()

        # 3. Vector Embedding Storage for RAG Model (Voice Segment Search during Drafting)
        try:
            index_voice_transcript(db=db, transcript=transcript, media=media, version_id=job.version_id)
        except Exception as e:
            logger.error(f"Vector indexing error for job {job_id}: {e}")

        # 3b. Index transcript chunks into Assistant Knowledge Base (Module 02 RAG)
        try:
            from app.modules.assistant.services.indexing_service import IndexingService
            IndexingService.index_transcript(transcript.id, db=db, title=media.title)
        except Exception as e:
            logger.error(f"Assistant RAG transcript indexing error for job {job_id}: {e}")

        job.progress = 75
        db.commit()

        # 4. AI Structuring into SOP Steps
        machine_name = media.machine.name if media.machine else None
        structured_draft = await structure_transcript_with_ai(segments=segments_data, machine_name=machine_name)

        job.progress = 90
        db.commit()

        # 5. Populate Draft Version if linked
        if job.version_id:
            version = db.get(KnowledgeVersion, job.version_id)
            if version and version.status in ("draft", "changes_requested"):
                version.origin = "ai_draft"
                if not version.summary:
                    version.summary = structured_draft.summary

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

    except Exception as e:
        logger.error(f"Error processing voice job {job_id}: {e}", exc_info=True)
        try:
            job = db.get(ProcessingJob, job_id)
            if job:
                job.status = "failed"
                job.error_safe = "Narration processing failed. You can retry with clearer audio."
                db.commit()
        except Exception:
            pass
    finally:
        if own_session:
            db.close()
