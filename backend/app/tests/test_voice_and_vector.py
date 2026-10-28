import io
import json
import wave
import asyncio
import pytest
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.media import MediaAsset
from app.models.processing_job import ProcessingJob
from app.models.transcript import Transcript, TranscriptSegment
from app.models.machine import Machine
from app.models.user import User
from app.models.knowledge import KnowledgeVersion, KnowledgeItem
from app.models.embedding import KnowledgeEmbedding
from app.integrations.speech.base import Segment
from app.services.structuring_service import (
    StepDraftSchema,
    StructuredDraftResponse,
    post_validate_structured_draft,
    extract_numbers_with_units,
)
from app.services.vector_service import (
    compute_dense_embedding,
    cosine_similarity,
    index_voice_transcript,
    search_vector_knowledge,
)
from app.services.voice_service import (
    create_voice_capture_job,
    retry_voice_job,
    update_transcript_segment,
    validate_version_for_submission,
)
from app.services.job_runner import execute_voice_processing_job, fail_stale_voice_jobs, _transcribe_with_heartbeat
from app.services import job_runner as job_runner_module
from app.core.exceptions import ValidationError, ConflictError, ForbiddenError
from app.core.config import settings


def get_expert_credentials(client):
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "expert.a@demo.local", "password": "ExpertA@Gurukul2026!"},
    )
    assert login_res.status_code == 200
    csrf_token = login_res.cookies.get("gk_csrf")
    assert csrf_token is not None
    return csrf_token


def test_dense_vector_embedding_math():
    """Verify that vector embeddings are unit length and cosine similarity works reliably."""
    v1 = compute_dense_embedding("CNC lathe spindle pressure chuck")
    v2 = compute_dense_embedding("spindle chuck clamping pressure")
    v3 = compute_dense_embedding("completely unrelated banana fruit salad recipe")

    # Both vectors are unit length (L2 norm ~ 1.0)
    norm1 = sum(x * x for x in v1)
    norm2 = sum(x * x for x in v2)
    assert pytest.approx(norm1, rel=1e-3) == 1.0
    assert pytest.approx(norm2, rel=1e-3) == 1.0

    # Machining terms have much higher similarity than unrelated food
    sim_machining = cosine_similarity(v1, v2)
    sim_unrelated = cosine_similarity(v1, v3)

    assert sim_machining > sim_unrelated
    assert sim_machining > 0.3


def test_zero_hallucination_post_validator():
    """Test that post_validate_structured_draft detects unstated tolerances and invented numbers."""
    segments = [
        Segment(idx=1, start_s=0.0, end_s=5.0, text="Mount the CNMG insert and tighten clamping bolt."),
        Segment(idx=2, start_s=5.1, end_s=10.0, text="Set hydraulic pressure to 25 bar."),
        Segment(idx=3, start_s=10.1, end_s=15.0, text="Set feed rate to the correct value before cycle start."),
    ]

    draft = StructuredDraftResponse(
        summary="Turning setup",
        keywords=["lathe"],
        steps=[
            # Step 1: Valid
            StepDraftSchema(
                title="Mount insert",
                instruction="Mount the CNMG insert and tighten clamping bolt.",
                source_segment_ids=[1],
                needs_review=False,
            ),
            # Step 2: Hallucinated number 500 bar (not in segment #2 which says 25 bar)
            StepDraftSchema(
                title="Set pressure",
                instruction="Set hydraulic pressure to 500 bar immediately.",
                source_segment_ids=[2],
                needs_review=False,
            ),
            # Step 3: Vague phrase "correct value"
            StepDraftSchema(
                title="Feed rate",
                instruction="Set feed rate to the correct value before cycle start.",
                source_segment_ids=[3],
                needs_review=False,
            ),
        ],
        unclear_segments=[],
    )

    validated = post_validate_structured_draft(draft, segments)

    # Step 1 should remain valid
    assert validated.steps[0].needs_review is False

    # Step 2 must be flagged for hallucinated 500
    assert validated.steps[1].needs_review is True
    assert "not found" in validated.steps[1].note.lower()

    # Step 3 must be flagged for unstated "correct value"
    assert validated.steps[2].needs_review is True
    assert "value not stated" in validated.steps[2].note.lower()


def test_voice_upload_and_job_endpoint(client, db_session: Session, tmp_path):
    """Test POST /api/v1/voice/upload endpoint."""
    csrf_token = get_expert_credentials(client)

    # Use the real fixture so upload validation can probe the audio duration.
    sample_audio = (Path(__file__).parent / "fixtures" / "multimodal" / "sample_voice.wav").read_bytes()

    response = client.post(
        "/api/v1/voice/upload",
        files={"file": ("sample_voice.wav", sample_audio, "audio/wav")},
        data={"title": "Lathe Setup Audio Note"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 202
    data = response.json()
    assert "media" in data
    assert "job" in data
    assert data["media"]["title"] == "Lathe Setup Audio Note"
    assert data["job"]["status"] == "queued"
    job_id = data["job"]["id"]
    stored_job = db_session.get(ProcessingJob, job_id)
    assert stored_job is not None
    assert stored_job.user_id == data["media"]["uploaded_by"]
    assert stored_job.created_by == data["media"]["uploaded_by"]

    # Poll job status
    poll_res = client.get(f"/api/v1/processing-jobs/{job_id}")
    assert poll_res.status_code == 200
    job_data = poll_res.json()
    assert job_data["id"] == job_id

    # Clean up uploaded test file
    uploaded_path = Path(data["media"]["file_path"])
    if uploaded_path.exists():
        uploaded_path.unlink()


def _make_failed_audio_job(db_session: Session, status="failed", attempts=1):
    owner = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machine = db_session.query(Machine).first()
    media = MediaAsset(
        title="Retry test recording", machine_id=machine.id, kind="audio",
        storage_key=f"retry-tests/{status}-{attempts}.webm", original_name="recording.webm",
        mime="audio/webm", size_bytes=10, uploaded_by=owner.id,
    )
    db_session.add(media)
    db_session.flush()
    job = ProcessingJob(
        type="voice_to_knowledge", media_id=media.id, version_id=None, status=status,
        progress=35, attempts=attempts, error_safe="old error",
        idempotency_key=f"voice:{media.id}", user_id=owner.id, created_by=owner.id,
    )
    db_session.add(job)
    db_session.commit()
    return owner, media, job


def test_transcription_retry_is_owner_only_and_does_not_duplicate_jobs_or_transcripts(db_session: Session):
    owner, media, job = _make_failed_audio_job(db_session)
    other = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).one()

    with pytest.raises(ForbiddenError):
        retry_voice_job(db_session, job.id, other.id)
    assert db_session.query(ProcessingJob).filter(ProcessingJob.media_id == media.id).count() == 1

    retried = retry_voice_job(db_session, job.id, owner.id)
    assert retried.id == job.id
    assert retried.status == "queued"
    assert retried.error_safe is None
    assert db_session.query(ProcessingJob).filter(ProcessingJob.media_id == media.id).count() == 1
    with pytest.raises(ValidationError):
        retry_voice_job(db_session, job.id, owner.id)
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0

    transcript = Transcript(media_id=media.id, full_text="Keep reviewed text", status="completed", provider="test")
    db_session.add(transcript)
    db_session.commit()
    job.status = "failed"
    db_session.commit()
    with pytest.raises(ConflictError):
        retry_voice_job(db_session, job.id, owner.id)
    db_session.expire_all()
    assert db_session.query(ProcessingJob).filter(ProcessingJob.media_id == media.id).count() == 1
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).one().full_text == "Keep reviewed text"


def test_processing_runner_skips_duplicate_nonqueued_execution(db_session: Session, monkeypatch):
    _, _, job = _make_failed_audio_job(db_session, status="processing", attempts=2)
    monkeypatch.setattr("app.services.job_runner.get_speech_provider", lambda: pytest.fail("duplicate runner must not call provider"))

    asyncio.run(asyncio.wait_for(execute_voice_processing_job(job.id, db=db_session), timeout=3))

    db_session.refresh(job)
    assert job.status == "processing"
    assert job.attempts == 2


def test_stale_voice_job_recovery_marks_interrupted_jobs_failed_without_touching_recording(db_session: Session):
    from datetime import timedelta
    from app.db.base import utc_now

    _, media, stale = _make_failed_audio_job(db_session, status="processing", attempts=1)
    _, _, recent = _make_failed_audio_job(db_session, status="processing", attempts=2)
    stale.updated_at = utc_now() - timedelta(hours=1)
    db_session.commit()
    cutoff = utc_now() - timedelta(minutes=10)

    assert fail_stale_voice_jobs(db_session, stale_before=cutoff) == 1

    db_session.refresh(stale)
    db_session.refresh(recent)
    assert stale.status == "failed"
    assert "interrupted" in stale.error_safe.lower()
    assert stale.attempts == 1
    assert recent.status == "processing"
    assert db_session.get(MediaAsset, media.id) is not None
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0


def test_long_transcription_refreshes_job_heartbeat(db_session: Session, monkeypatch):
    _, _, job = _make_failed_audio_job(db_session, status="processing", attempts=1)
    before = job.updated_at

    class SlowProvider:
        async def transcribe(self, _path):
            await asyncio.sleep(0.025)
            return []

    result = asyncio.run(asyncio.wait_for(
        _transcribe_with_heartbeat(SlowProvider(), Path("unused.wav"), db_session, job.id, interval_seconds=0.005),
        timeout=1,
    ))

    db_session.refresh(job)
    assert result == []
    assert job.updated_at >= before


@pytest.mark.asyncio
async def test_stale_job_recovery_runs_periodically_after_startup(monkeypatch):
    import app.main as main

    calls = []
    monkeypatch.setattr(main, "_recover_interrupted_voice_jobs", lambda: calls.append(True))
    task = asyncio.create_task(main._stale_voice_job_recovery_loop(interval_seconds=0.005))
    try:
        await asyncio.wait_for(asyncio.sleep(0.025), timeout=1)
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert calls


def test_transcription_provider_failure_is_persisted_without_transcript(db_session: Session, tmp_path, monkeypatch):
    import app.services.job_runner as job_runner

    _, media, job = _make_failed_audio_job(db_session, status="queued", attempts=0)
    storage_root = tmp_path / "media"
    storage_root.mkdir()
    (storage_root / media.storage_key).parent.mkdir(parents=True, exist_ok=True)
    (storage_root / media.storage_key).write_bytes(b"audio")
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(storage_root))
    monkeypatch.setattr(job_runner, "extract_audio_wav", lambda source, target: Path(target).write_bytes(b"wav"))
    monkeypatch.setattr(job_runner, "probe_duration", lambda path: 1.0)

    class LimitedProvider:
        async def transcribe(self, path):
            raise ValidationError(
                code="transcription_quota_exceeded",
                message="Transcription is unavailable because the speech provider account has reached its usage limit.",
            )

    monkeypatch.setattr(job_runner, "get_speech_provider", LimitedProvider)
    asyncio.run(asyncio.wait_for(execute_voice_processing_job(job.id, db=db_session), timeout=3))

    db_session.refresh(job)
    assert job.status == "failed"
    assert job.attempts == 1
    assert "usage limit" in job.error_safe
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0


def test_transcript_database_failure_persists_failed_job_after_rollback(threadsafe_env, tmp_path, monkeypatch):
    import app.services.job_runner as job_runner
    _, db_session = threadsafe_env

    _, media, job = _make_failed_audio_job(db_session, status="queued", attempts=0)
    storage_root = tmp_path / "media-db-error"
    storage_root.mkdir()
    (storage_root / media.storage_key).parent.mkdir(parents=True, exist_ok=True)
    (storage_root / media.storage_key).write_bytes(b"audio")
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(storage_root))
    monkeypatch.setattr(job_runner, "extract_audio_wav", lambda source, target: Path(target).write_bytes(b"wav"))
    monkeypatch.setattr(job_runner, "probe_duration", lambda path: 1.0)

    class SuccessfulProvider:
        async def transcribe(self, _path):
            return [Segment(idx=1, start_s=0.0, end_s=1.0, text="Check the chuck pressure.")]

    monkeypatch.setattr(job_runner, "get_speech_provider", SuccessfulProvider)
    original_flush = db_session.flush
    fail_once = {"enabled": True}

    def flush_with_constraint_failure(*args, **kwargs):
        if fail_once["enabled"]:
            fail_once["enabled"] = False
            raise IntegrityError("insert transcript", {}, Exception("simulated constraint failure"))
        return original_flush(*args, **kwargs)

    monkeypatch.setattr(db_session, "flush", flush_with_constraint_failure)
    asyncio.run(asyncio.wait_for(execute_voice_processing_job(job.id, db=db_session), timeout=3))

    db_session.refresh(job)
    assert job.status == "failed"
    assert job.attempts == 1
    assert job.error_safe
    assert db_session.query(Transcript).filter(Transcript.media_id == media.id).count() == 0


def test_processing_job_status_and_retry_enforce_asset_access_and_csrf(client, db_session: Session, monkeypatch):
    owner, media, job = _make_failed_audio_job(db_session)
    import app.api.v1.endpoints.jobs as jobs_endpoint

    async def no_op_job(_job_id):
        return None

    monkeypatch.setattr(jobs_endpoint, "execute_voice_processing_job", no_op_job)
    owner_csrf = get_expert_credentials(client)
    assert client.get(f"/api/v1/processing-jobs/{job.id}").status_code == 200
    assert client.post(f"/api/v1/processing-jobs/{job.id}/retry").status_code == 403

    retried = client.post(
        f"/api/v1/processing-jobs/{job.id}/retry",
        headers={"X-CSRF-Token": owner_csrf},
    )
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "queued"
    assert db_session.query(ProcessingJob).filter(ProcessingJob.media_id == media.id).count() == 1

    unassigned_login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert unassigned_login.status_code == 200
    other_csrf = unassigned_login.cookies.get(settings.CSRF_COOKIE_NAME)
    assert client.get(f"/api/v1/processing-jobs/{job.id}").status_code == 403
    forbidden_retry = client.post(
        f"/api/v1/processing-jobs/{job.id}/retry",
        headers={settings.CSRF_HEADER_NAME: other_csrf},
    )
    assert forbidden_retry.status_code == 403


@pytest.mark.asyncio
async def test_job_runner_vector_indexing_and_rag(db_session: Session, tmp_path, monkeypatch):
    """Test background runner executes transcription, vector indexing, and RAG search."""
    # The sample provider is an explicit test double; real requests must never
    # silently receive its canned transcript when STT is unconfigured.
    monkeypatch.setattr(settings, "STT_PROVIDER", "mock")
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    # Create sample media file
    dummy_wav = tmp_path / "test_narration.wav"
    sample_voice = Path(__file__).parent / "fixtures" / "multimodal" / "sample_voice.wav"
    dummy_wav.write_bytes(sample_voice.read_bytes())

    normalized = {}
    actual_normalizer = job_runner_module.extract_audio_wav

    def capture_normalized_audio(input_path, output_path):
        result_path = actual_normalizer(input_path, output_path)
        with wave.open(str(result_path), "rb") as normalized_wav:
            normalized.update({
                "channels": normalized_wav.getnchannels(),
                "sample_rate": normalized_wav.getframerate(),
                "sample_width": normalized_wav.getsampwidth(),
            })
        return result_path

    monkeypatch.setattr(job_runner_module, "extract_audio_wav", capture_normalized_audio)

    media, job = create_voice_capture_job(
        db=db_session,
        user_id="seed-user-expert-a",
        file_path=str(dummy_wav),
        original_name="test_narration.wav",
        mime_type="audio/wav",
        size_bytes=len(dummy_wav.read_bytes()),
        title="Chuck Pressure & Safety Narration",
    )

    # Execute background pipeline
    await execute_voice_processing_job(job.id, db=db_session)

    db_session.refresh(job)
    assert job.status == "needs_review"
    assert job.progress == 100
    assert normalized == {"channels": 1, "sample_rate": 16_000, "sample_width": 2}

    # Check transcript and segments were created
    transcript = db_session.query(Transcript).filter(Transcript.media_id == media.id).first()
    assert transcript is not None
    assert transcript.raw_text == transcript.full_text
    assert transcript.updated_at is not None
    assert len(transcript.segments) >= 3
    assert all(segment.start_s >= 0 and segment.end_s > segment.start_s for segment in transcript.segments)
    assert all(segment.segment_order == segment.idx for segment in transcript.segments)
    assert all(segment.start_time_seconds == segment.start_s for segment in transcript.segments)
    assert all(segment.end_time_seconds == segment.end_s for segment in transcript.segments)
    assert all(segment.text == segment.original_text for segment in transcript.segments)

    # Check vector embeddings were stored
    embeddings = db_session.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.media_id == media.id).all()
    assert len(embeddings) >= 3

    # Assistant RAG transcripts stay inactive while their KnowledgeVersion is a draft.
    from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk, SOURCE_TYPE_TRANSCRIPT
    from app.modules.assistant.services.indexing_service import IndexingService
    rag_source = db_session.query(KnowledgeSource).filter(
        KnowledgeSource.source_type == SOURCE_TYPE_TRANSCRIPT,
        KnowledgeSource.source_ref_id == transcript.id,
    ).first()
    assert rag_source is not None
    assert rag_source.status == "draft"
    assert not any(chunk.is_active for chunk in rag_source.chunks)

    # The existing indexer activates the same source only after publication.
    version = db_session.get(KnowledgeVersion, job.version_id)
    assert version.origin == "ai_draft"
    assert version.status == "draft"
    generated_steps = json.loads(version.steps) if isinstance(version.steps, str) else version.steps
    assert generated_steps
    assert all(step.get("needs_review") is True for step in generated_steps)
    version.status = "published"
    db_session.commit()
    IndexingService.index_transcript(transcript.id, db_session, title=media.title)
    db_session.refresh(rag_source)
    assert rag_source.status == "published"
    assert all(chunk.is_active for chunk in rag_source.chunks)

    # Test RAG Vector Search
    search_results = search_vector_knowledge(
        db=db_session,
        query="What is the chuck jaw hydraulic pressure?",
        top_k=3,
    )
    assert len(search_results) > 0
    top_result = search_results[0]
    assert "pressure" in top_result.chunk_text.lower() or "chuck" in top_result.chunk_text.lower()
    assert top_result.similarity_score > 0.0


def test_submission_blocked_with_unresolved_flags(db_session: Session):
    """Test validate_version_for_submission blocks draft with unresolved review flags."""
    # Create dummy item and version
    item = KnowledgeItem(
        title="Test Gated SOP",
        author_id="seed-user-expert-a",
        status="DRAFT",
    )
    db_session.add(item)
    db_session.flush()

    flagged_steps = [
        {
            "title": "Set chuck pressure",
            "instruction": "Set pressure to the correct value.",
            "needs_review": True,
            "note": "Value not stated in narration.",
        }
    ]

    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title="Test Gated SOP v1",
        status="draft",
        origin="ai_draft",
        steps=json.dumps(flagged_steps),
        created_by="seed-user-expert-a",
    )
    db_session.add(version)
    db_session.commit()

    # Submission must raise ValidationError
    with pytest.raises(ValidationError) as exc:
        validate_version_for_submission(db_session, version.id)
    assert "Submission blocked" in str(exc.value)


def test_vector_search_api_endpoint(client, db_session: Session):
    """Test POST /api/v1/voice/search endpoint."""
    csrf_token = get_expert_credentials(client)

    # Insert a sample embedding
    emb = KnowledgeEmbedding(
        source_type="voice_segment",
        source_id="sample-seg-1",
        chunk_text="Inspect tool holder taper for metal chip contamination before seating spindle.",
        embedding_json=json.dumps(compute_dense_embedding("Inspect tool holder taper for metal chip contamination")),
        embedding_model="dense-multi-hash-384",
        metadata_json=json.dumps({"start_s": 4.2, "end_s": 8.5, "media_title": "Spindle Inspection"}),
    )
    db_session.add(emb)
    db_session.commit()

    search_res = client.post(
        "/api/v1/voice/search",
        json={"query": "chip contamination on spindle tool holder", "top_k": 3},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert search_res.status_code == 200
    res_data = search_res.json()
    assert res_data["total"] >= 1
    assert res_data["results"][0]["start_s"] == 4.2


def test_media_transcript_and_steps_endpoints(client, db_session: Session):
    """Test GET /api/v1/voice/assets/{media_id}/transcript and /steps endpoints."""
    csrf_token = get_expert_credentials(client)

    # 1. Create MediaAsset with linked transcript and draft
    from app.models.media import MediaAsset
    from app.models.transcript import Transcript, TranscriptSegment
    from app.models.knowledge import KnowledgeItem, KnowledgeVersion
    from app.models.user import User

    expert = db_session.query(User).filter(User.email == "expert.a@demo.local").first()
    author_id = expert.id if expert else "seed-user-expert-a"

    item = KnowledgeItem(title="CNC Maintenance Voice SOP", author_id=author_id, status="DRAFT")
    db_session.add(item)
    db_session.flush()

    steps = [
        {"title": "Check Chuck Pressure", "instruction": "Check pressure gauge.", "tools": ["GAUGE"], "needs_review": False}
    ]
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title="CNC Maintenance Voice SOP",
        status="draft",
        origin="ai_draft",
        steps=json.dumps(steps),
        created_by=author_id,
    )
    db_session.add(version)
    db_session.flush()

    media = MediaAsset(
        title="CNC Audio Recording",
        version_id=version.id,
        kind="audio",
        file_path="./data/media/test_cnc.webm",
        original_name="test_cnc.webm",
        mime_type="audio/webm",
        size_bytes=1024,
        duration_seconds=12.5,
        uploaded_by=author_id,
    )
    db_session.add(media)
    db_session.flush()

    transcript = Transcript(
        media_id=media.id,
        version_id=version.id,
        language="en",
        provider="whisper_api",
        full_text="Check hydraulic chuck pressure before operating CNC lathe.",
        status="completed",
    )
    db_session.add(transcript)
    db_session.flush()

    seg = TranscriptSegment(
        transcript_id=transcript.id,
        idx=1,
        start_s=0.0,
        end_s=5.0,
        original_text="Check hydraulic chuck pressure before operating CNC lathe.",
        needs_review=False,
    )
    db_session.add(seg)
    db_session.commit()

    # Test GET transcript by media_id
    t_res = client.get(f"/api/v1/voice/assets/{media.id}/transcript")
    assert t_res.status_code == 200
    t_data = t_res.json()
    assert t_data["full_text"] == transcript.full_text
    assert len(t_data["segments"]) == 1

    # Test GET steps by media_id
    s_res = client.get(f"/api/v1/voice/assets/{media.id}/steps")
    assert s_res.status_code == 200
    s_data = s_res.json()
    assert s_data["media_id"] == media.id
    assert len(s_data["steps"]) == 1
    assert s_data["steps"][0]["title"] == "Check Chuck Pressure"

    # Test POST create-draft returns existing linked version
    d_res = client.post(
        f"/api/v1/voice/assets/{media.id}/create-draft",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert d_res.status_code == 200
    d_data = d_res.json()
    assert d_data["version_id"] == version.id
    assert d_data["steps_count"] == 1
