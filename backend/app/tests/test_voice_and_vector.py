import io
import json
import pytest
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.media import MediaAsset
from app.models.processing_job import ProcessingJob
from app.models.transcript import Transcript, TranscriptSegment
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
from app.services.job_runner import execute_voice_processing_job
from app.core.exceptions import ValidationError
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

    # Create dummy audio file
    fake_audio = b"\x00" * 4096

    response = client.post(
        "/api/v1/voice/upload",
        files={"file": ("lathe_demo.webm", fake_audio, "audio/webm")},
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

    # Poll job status
    poll_res = client.get(f"/api/v1/processing-jobs/{job_id}")
    assert poll_res.status_code == 200
    job_data = poll_res.json()
    assert job_data["id"] == job_id

    # Clean up uploaded test file
    uploaded_path = Path(data["media"]["file_path"])
    if uploaded_path.exists():
        uploaded_path.unlink()


@pytest.mark.asyncio
async def test_job_runner_vector_indexing_and_rag(db_session: Session, tmp_path, monkeypatch):
    """Test background runner executes transcription, vector indexing, and RAG search."""
    # The sample provider is an explicit test double; real requests must never
    # silently receive its canned transcript when STT is unconfigured.
    monkeypatch.setattr(settings, "STT_PROVIDER", "mock")
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    # Create sample media file
    dummy_wav = tmp_path / "test_narration.wav"
    dummy_wav.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00")

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
    assert job.status in ("completed", "needs_review")
    assert job.progress == 100

    # Check transcript and segments were created
    transcript = db_session.query(Transcript).filter(Transcript.media_id == media.id).first()
    assert transcript is not None
    assert len(transcript.segments) >= 3

    # Check vector embeddings were stored
    embeddings = db_session.query(KnowledgeEmbedding).filter(KnowledgeEmbedding.media_id == media.id).all()
    assert len(embeddings) >= 3

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
    assert "contamination" in res_data["results"][0]["chunk_text"].lower()
    assert res_data["results"][0]["start_s"] == 4.2
