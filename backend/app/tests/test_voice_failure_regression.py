import io
import wave
import uuid
import struct
import numpy as np
import pytest
from pathlib import Path
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from app.core.config import settings
from app.db.base import utc_now
from app.models.media import MediaAsset
from app.models.processing_job import ProcessingJob
from app.models.transcript import Transcript
from app.models.knowledge import KnowledgeVersion, KnowledgeItem, STATUS_PUBLISHED
from app.models.embedding import KnowledgeEmbedding
from app.models.user import User
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk
from app.modules.assistant.services.retrieval_service import RetrievalService, RetrievalQuery
from app.modules.assistant.services.indexing_service import IndexingService
from app.services.job_runner import (
    execute_voice_processing_job,
    fail_stale_voice_jobs,
    _is_audio_silent,
    STALE_JOB_MESSAGE,
)
from app.services.voice_service import retry_voice_job
from app.core.exceptions import ValidationError, ConflictError


def _generate_wav(path: Path, duration_s: float = 2.0, frequency_hz: float = 440.0, silence: bool = False):
    """Generate a valid 16kHz mono 16-bit PCM WAV file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16000
    n_samples = int(sample_rate * duration_s)
    if silence or n_samples == 0:
        samples = np.zeros(n_samples, dtype=np.int16)
    else:
        t = np.linspace(0, duration_s, n_samples, endpoint=False)
        samples = (np.sin(2 * np.pi * frequency_hz * t) * 16000).astype(np.int16)

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return path


def _get_test_user(db_session):
    user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    if not user:
        user = db_session.query(User).first()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email="test-expert@gurukul.local",
            name="Test Expert",
            password_hash="test",
            role_id="expert",
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()
    return user


def test_regression_case_1_server_restart_interruption(db_session, tmp_path):
    """Case 1 (ecf577b9): Stale job interrupted by server restart is recovered cleanly."""
    user = _get_test_user(db_session)
    media = MediaAsset(
        title="Stale Recording",
        original_name="test_stale.wav",
        kind="audio",
        storage_key="test_stale.wav",
        file_path=str(tmp_path / "test_stale.wav"),
        mime="audio/wav",
        size_bytes=1000,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        progress=0,
        attempts=0,
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    # Simulate stale timeout past 2 minutes
    past_cutoff = utc_now() + timedelta(minutes=5)
    recovered = fail_stale_voice_jobs(db_session, stale_before=past_cutoff)
    assert recovered >= 1

    db_session.refresh(job)
    assert job.status == "failed"
    assert job.error_safe == STALE_JOB_MESSAGE
    assert job.attempts == 0  # Attempts not penalized by server crash


@pytest.mark.asyncio
async def test_regression_case_2_empty_header_only_audio(db_session, tmp_path):
    """Case 2 (ecf577b9 media): 44-byte empty WAV header fails fast before STT."""
    user = _get_test_user(db_session)
    empty_wav = tmp_path / "empty_header.wav"
    # Write only 44-byte WAV header with 0 samples
    with wave.open(str(empty_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(b"")

    media = MediaAsset(
        title="Empty Header WAV",
        original_name=empty_wav.name,
        kind="audio",
        storage_key=empty_wav.name,
        file_path=str(empty_wav),
        mime="audio/wav",
        size_bytes=empty_wav.stat().st_size,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    await execute_voice_processing_job(job.id, db=db_session)
    db_session.refresh(job)

    assert job.status == "failed"
    assert "too short or empty" in job.error_safe
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0
    assert db_session.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.media_id == media.id).count() == 0


@pytest.mark.asyncio
async def test_regression_case_3_ultra_short_audio(db_session, tmp_path):
    """Case 3 (a155126b): Sub-half-second audio fails before STT."""
    user = _get_test_user(db_session)
    short_wav = tmp_path / "short.wav"
    _generate_wav(short_wav, duration_s=0.2)

    media = MediaAsset(
        title="Short Recording",
        original_name=short_wav.name,
        kind="audio",
        storage_key=short_wav.name,
        file_path=str(short_wav),
        mime="audio/wav",
        size_bytes=short_wav.stat().st_size,
        duration_seconds=0.2,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    await execute_voice_processing_job(job.id, db=db_session)
    db_session.refresh(job)

    assert job.status == "failed"
    assert "too short or empty" in job.error_safe
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0


@pytest.mark.asyncio
async def test_regression_case_4_silent_audio(db_session, tmp_path):
    """Case 4 (a155126b): Silent recording (zero amplitude) is detected before calling STT."""
    user = _get_test_user(db_session)
    silent_wav = tmp_path / "silent.wav"
    _generate_wav(silent_wav, duration_s=2.0, silence=True)
    assert _is_audio_silent(silent_wav) is True

    media = MediaAsset(
        title="Silent Recording",
        original_name=silent_wav.name,
        kind="audio",
        storage_key=silent_wav.name,
        file_path=str(silent_wav),
        mime="audio/wav",
        size_bytes=silent_wav.stat().st_size,
        duration_seconds=2.0,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    await execute_voice_processing_job(job.id, db=db_session)
    db_session.refresh(job)

    assert job.status == "failed"
    assert "No audible sound detected in narration" in job.error_safe
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0


@pytest.mark.asyncio
async def test_regression_case_5_stt_provider_misconfiguration(db_session, tmp_path):
    """Case 5 (Oct 26 batch): Unconfigured STT provider returns safe guidance."""
    user = _get_test_user(db_session)
    audio_wav = tmp_path / "audio.wav"
    _generate_wav(audio_wav, duration_s=2.5)

    media = MediaAsset(
        title="Audible Audio",
        original_name=audio_wav.name,
        kind="audio",
        storage_key=audio_wav.name,
        file_path=str(audio_wav),
        mime="audio/wav",
        size_bytes=audio_wav.stat().st_size,
        duration_seconds=2.5,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    with patch("app.services.job_runner.get_speech_provider") as mock_get:
        mock_get.side_effect = ValidationError(
            code="transcription_not_configured",
            message="Gemini transcription is selected but GEMINI_API_KEY is not configured.",
        )
        await execute_voice_processing_job(job.id, db=db_session)

    db_session.refresh(job)
    assert job.status == "failed"
    assert "GEMINI_API_KEY is not configured" in job.error_safe


@pytest.mark.asyncio
async def test_regression_case_6_stt_rate_limit(db_session, tmp_path):
    """Case 6 (60a2b77d, a041b752): Provider 429/quota error is cleanly classified."""
    user = _get_test_user(db_session)
    audio_wav = tmp_path / "audio.wav"
    _generate_wav(audio_wav, duration_s=2.5)

    media = MediaAsset(
        title="Audible Audio",
        original_name=audio_wav.name,
        kind="audio",
        storage_key=audio_wav.name,
        file_path=str(audio_wav),
        mime="audio/wav",
        size_bytes=audio_wav.stat().st_size,
        duration_seconds=2.5,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    mock_provider = AsyncMock()
    mock_provider.transcribe.side_effect = ValidationError(
        code="transcription_rate_limited",
        message="The speech provider returned a usage-limit response. Check provider quota and rate limits before retrying.",
    )

    with patch("app.services.job_runner.get_speech_provider", return_value=mock_provider):
        await execute_voice_processing_job(job.id, db=db_session)

    db_session.refresh(job)
    assert job.status == "failed"
    assert "usage-limit response" in job.error_safe


@pytest.mark.asyncio
async def test_regression_case_7_stt_timeout(db_session, tmp_path):
    """Case 7 (60a2b77d, a041b752): Network timeout error is cleanly classified."""
    user = _get_test_user(db_session)
    audio_wav = tmp_path / "audio.wav"
    _generate_wav(audio_wav, duration_s=2.5)

    media = MediaAsset(
        title="Audible Audio",
        original_name=audio_wav.name,
        kind="audio",
        storage_key=audio_wav.name,
        file_path=str(audio_wav),
        mime="audio/wav",
        size_bytes=audio_wav.stat().st_size,
        duration_seconds=2.5,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="queued",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()

    mock_provider = AsyncMock()
    mock_provider.transcribe.side_effect = TimeoutError("Connection timed out after 30s")

    with patch("app.services.job_runner.get_speech_provider", return_value=mock_provider):
        await execute_voice_processing_job(job.id, db=db_session)

    db_session.refresh(job)
    assert job.status == "failed"
    assert "timed out" in job.error_safe.lower()


@pytest.mark.asyncio
async def test_regression_case_8_duplicate_transcript_protection(db_session, tmp_path):
    """Case 8 (4d00e2f3, fbe0cba1): Cannot overwrite an existing transcript for a media recording."""
    user = _get_test_user(db_session)
    audio_wav = tmp_path / "audio.wav"
    _generate_wav(audio_wav, duration_s=2.5)

    media = MediaAsset(
        title="Audible Audio",
        original_name=audio_wav.name,
        kind="audio",
        storage_key=audio_wav.name,
        file_path=str(audio_wav),
        mime="audio/wav",
        size_bytes=audio_wav.stat().st_size,
        duration_seconds=2.5,
        uploaded_by=user.id,
    )
    db_session.add(media)
    db_session.flush()

    # Pre-existing transcript
    existing_t = Transcript(
        media_id=media.id,
        full_text="Pre-existing expert transcript that must not be overwritten.",
        status="completed",
        language="en",
    )
    db_session.add(existing_t)
    db_session.commit()

    # Retry should be blocked by ConflictError
    failed_job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=media.id,
        status="failed",
        created_by=user.id,
        attempts=1,
    )
    db_session.add(failed_job)
    db_session.commit()

    with pytest.raises(ConflictError) as exc_info:
        retry_voice_job(db=db_session, job_id=failed_job.id, user_id=user.id)
    assert "transcript already exists" in exc_info.value.message


@pytest.mark.asyncio
async def test_regression_case_9_retry_missing_file_vs_preserved_media_and_retrieval(db_session, tmp_path):
    """
    Case 9 (Full Lifecycle):
    1. Retry on missing disk file raises media_file_missing.
    2. Retry on preserved media succeeds, indexes vectors, keeps draft inactive from trainees,
       and upon expert publication, indexes active chunks retrievable by AI Tutor.
    """
    user = _get_test_user(db_session)
    # 1. Missing disk file
    missing_media = MediaAsset(
        title="Deleted Recording",
        original_name="deleted_from_disk.wav",
        kind="audio",
        storage_key="deleted_from_disk.wav",
        file_path=str(tmp_path / "deleted_from_disk.wav"),
        mime="audio/wav",
        size_bytes=500,
        uploaded_by=user.id,
    )
    db_session.add(missing_media)
    db_session.flush()

    missing_job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=missing_media.id,
        status="failed",
        created_by=user.id,
        attempts=1,
    )
    db_session.add(missing_job)
    db_session.commit()

    with pytest.raises(ValidationError) as exc_missing:
        retry_voice_job(db=db_session, job_id=missing_job.id, user_id=user.id)
    assert exc_missing.value.code == "media_file_missing"

    # 2. Preserved media file with KnowledgeVersion
    valid_wav = tmp_path / "valid_narration.wav"
    _generate_wav(valid_wav, duration_s=3.0)

    item = KnowledgeItem(
        title="Spindle Chuck Clamping Standard",
        category="CNC",
        author_id=user.id,
    )
    db_session.add(item)
    db_session.flush()

    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status="draft",
        title="Spindle Chuck Clamping Draft",
        summary="Spindle chuck clamping pressure guide for CNC lathe operation.",
        content="Set hydraulic chuck clamping pressure strictly to 25 bar for steel billets. Verify spindle chuck jaw pressure before beginning the face turning cycle.",
        created_by=user.id,
        author_id=user.id,
    )
    db_session.add(version)
    db_session.flush()

    valid_media = MediaAsset(
        title="Valid Audio Recording",
        original_name=valid_wav.name,
        kind="audio",
        storage_key=valid_wav.name,
        file_path=str(valid_wav),
        version_id=version.id,
        mime="audio/wav",
        size_bytes=valid_wav.stat().st_size,
        duration_seconds=3.0,
        uploaded_by=user.id,
    )
    db_session.add(valid_media)
    db_session.flush()

    valid_job = ProcessingJob(
        idempotency_key=f"voice:{uuid.uuid4().hex}",
        type="voice_to_knowledge",
        media_id=valid_media.id,
        version_id=version.id,
        status="failed",
        created_by=user.id,
        attempts=1,
    )
    db_session.add(valid_job)
    db_session.commit()

    # Retry job
    retried_job = retry_voice_job(db=db_session, job_id=valid_job.id, user_id=user.id)
    assert retried_job.status == "queued"
    assert retried_job.error_safe is None

    # Execute background pipeline
    await execute_voice_processing_job(retried_job.id, db=db_session)
    db_session.refresh(retried_job)
    assert retried_job.status == "needs_review"
    assert retried_job.progress == 100

    # Verify transcript persisted
    transcript = db_session.query(Transcript).filter(Transcript.media_id == valid_media.id).first()
    assert transcript is not None
    assert len(transcript.segments) > 0

    # Verify vector embeddings stored in knowledge_embeddings
    embs = db_session.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.media_id == valid_media.id).all()
    assert len(embs) >= 2  # 1 doc + N segments

    # Verify RAG chunks created as inactive (unapproved draft protection)
    rag_source = db_session.query(KnowledgeSource).filter(KnowledgeSource.source_ref_id == transcript.id).first()
    assert rag_source is not None
    assert all(c.is_active is False for c in rag_source.chunks)

    # Verify trainee CANNOT retrieve unapproved draft chunks
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).first()
    trainee_id = trainee.id if trainee else "trainee-1"
    trainee_query = RetrievalQuery(query="spindle chuck clamping pressure", user_id=trainee_id)
    retrieved_before_publish = RetrievalService.retrieve_chunks(trainee_query, db=db_session)
    assert not any(r.source_id == rag_source.id for r in retrieved_before_publish)

    # Now simulate Expert Approval & Publication
    version.status = STATUS_PUBLISHED
    version.published_at = utc_now()
    item.status = STATUS_PUBLISHED
    item.current_published_version_id = version.id
    db_session.commit()

    # Index published version into RAG
    IndexingService.index_knowledge_version(version.id, db=db_session)

    # Verify chunks are now active and retrievable by trainee
    retrieved_after_publish = RetrievalService.retrieve_chunks(trainee_query, db=db_session)
    assert len(retrieved_after_publish) > 0
    assert any("Spindle Chuck Clamping" in r.title for r in retrieved_after_publish)
