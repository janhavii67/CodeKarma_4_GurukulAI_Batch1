import json
from pathlib import Path
import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from app.models.user import User
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED, STATUS_DRAFT
from app.models.machine import Machine
from app.models.transcript import Transcript, TranscriptSegment
from app.core.permissions import ROLE_EXPERT, ROLE_TRAINEE, ROLE_ADMIN
from app.core.config import settings
from app.services.voice_service import create_voice_capture_job, update_transcript_segment
from app.services.job_runner import execute_voice_processing_job
from app.modules.assistant.models import (
    KnowledgeSource,
    KnowledgeChunk,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
    SOURCE_TYPE_TRANSCRIPT,
)
from app.modules.assistant.services.retrieval_service import (
    RetrievalService,
    RetrievalQuery,
)
from app.modules.assistant.services.indexing_service import IndexingService


@pytest.mark.asyncio
async def test_voice_capture_job_automatically_indexes_into_rag(db_session: Session, tmp_path: Path):
    """
    Test that voice capture audio narration automatically transcribes and indexes
    into Module 02 RAG knowledge sources and chunks with exact timestamps.
    """
    expert = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    assert expert is not None

    # 1. Create sample WAV audio file
    dummy_wav = tmp_path / "voice_capture_sample.wav"
    dummy_wav.write_bytes(
        b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    )

    media, job = create_voice_capture_job(
        db=db_session,
        user_id=expert.id,
        file_path=str(dummy_wav),
        original_name="spindle_thermal_calibration.wav",
        mime_type="audio/wav",
        size_bytes=len(dummy_wav.read_bytes()),
        title="Spindle Thermal Calibration Narration",
    )

    # 2. Execute background processing job
    await execute_voice_processing_job(job.id, db=db_session)
    db_session.refresh(job)
    assert job.status in ("completed", "needs_review")

    # 3. Verify KnowledgeSource was created for transcript
    transcript = db_session.query(Transcript).filter(Transcript.media_id == media.id).first()
    assert transcript is not None

    source = (
        db_session.query(KnowledgeSource)
        .filter(
            KnowledgeSource.source_type == SOURCE_TYPE_TRANSCRIPT,
            KnowledgeSource.source_ref_id == transcript.id,
        )
        .first()
    )
    assert source is not None
    assert source.title == media.title
    assert len(source.chunks) > 0

    # 4. Verify chunks have timestamps
    for ch in source.chunks:
        assert ch.is_active is True
        assert ch.timestamp_start is not None
        assert ch.timestamp_end is not None

    # 5. Invariant check: While the linked SOP is in draft status, RAG strictly excludes it
    query = RetrievalQuery(
        query="chuck pressure hydraulic jaw safety",
        user_id=expert.id,
        top_k=3,
        min_score=0.01,
    )
    pre_results = RetrievalService.retrieve_chunks(query, db_session)
    assert not any(r.source_id == source.id for r in pre_results)

    # 6. Once the generated draft version is approved and published, the transcript chunks become retrievable
    from app.db.base import utc_now
    gen_version = db_session.get(KnowledgeVersion, job.version_id)
    gen_version.status = STATUS_PUBLISHED
    gen_version.published_at = utc_now()
    db_session.commit()

    retrieved = RetrievalService.retrieve_chunks(query, db_session)
    assert len(retrieved) > 0
    transcript_matches = [r for r in retrieved if r.source_type == SOURCE_TYPE_TRANSCRIPT]
    assert len(transcript_matches) > 0
    top_match = transcript_matches[0]
    assert top_match.timestamp_start is not None


def test_updating_transcript_segment_refreshes_rag_chunks(db_session: Session):
    """
    Test that when an expert edits a voice transcript segment,
    the RAG knowledge chunks immediately reflect the updated instructions.
    """
    expert = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    assert expert is not None

    from app.models.media import MediaAsset
    media = MediaAsset(
        title="Spindle Runout Narration",
        kind="audio",
        file_path="audio/test.wav",
        original_name="test.wav",
        mime_type="audio/wav",
        size_bytes=1000,
        duration_seconds=10.0,
        uploaded_by=expert.id,
    )
    db_session.add(media)
    db_session.flush()

    transcript = Transcript(
        media_id=media.id,
        version_id=None,
        language="en",
        full_text="Spindle inspection recording.",
        status="completed",
    )
    db_session.add(transcript)
    db_session.flush()

    seg1 = TranscriptSegment(
        transcript_id=transcript.id,
        idx=0,
        start_s=0.0,
        end_s=4.0,
        original_text="Check spindle runout with gauge.",
    )
    db_session.add(seg1)
    db_session.commit()

    # Index initial transcript
    IndexingService.index_transcript(transcript.id, db=db_session, title="Runout Inspection Audio")

    # Update transcript segment text
    updated_text = "Ensure laser micrometer is zeroed to within 0.005mm tolerance before spindle runout check."
    update_transcript_segment(
        db=db_session,
        segment_id=seg1.id,
        user_id=expert.id,
        edited_text=updated_text,
    )

    # Verify RAG chunks contain updated text
    source = (
        db_session.query(KnowledgeSource)
        .filter(
            KnowledgeSource.source_type == SOURCE_TYPE_TRANSCRIPT,
            KnowledgeSource.source_ref_id == transcript.id,
        )
        .first()
    )
    assert source is not None
    chunk_texts = " ".join([c.text for c in source.chunks])
    assert "0.005mm tolerance" in chunk_texts

    # Test retrieval for the newly edited text
    query = RetrievalQuery(
        query="laser micrometer 0.005mm tolerance spindle runout",
        user_id=expert.id,
        top_k=3,
    )
    retrieved = RetrievalService.retrieve_chunks(query, db_session)
    assert len(retrieved) > 0
    assert any("0.005mm" in r.text for r in retrieved)


def test_knowledge_capture_article_all_fields_indexed_on_approval(client: TestClient, db_session: Session):
    """
    Verify that ALL data sent by the user during technical SOP authoring:
    - Overview (summary, description)
    - Safety Warnings & Invariants
    - Operating Conditions & Machine Parameters
    - Prerequisites & Required Tools
    - Troubleshooting (Common mistakes & corrective actions)
    - Markdown content
    - Detailed steps with parameters, tolerances, and tools
    are comprehensively chunked and indexed into the RAG knowledge base upon review approval.
    """
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    reviewer = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).first()
    machine = db_session.query(Machine).first()
    assert author is not None and reviewer is not None and author.id != reviewer.id

    # 1. Author captures full knowledge item
    steps_data = [
        {
            "order": 1,
            "title": "Clean Spindle Taper",
            "instruction": "Wipe spindle internal taper 360 degrees using lint-free cloth and isopropyl alcohol.",
            "tools": ["Lint-free cloth", "Isopropyl alcohol"],
            "safety_warning": "Ensure machine E-STOP is engaged prior to reaching into spindle cavity.",
            "expected_result": "Zero visible particulate and clean surface.",
        },
        {
            "order": 2,
            "title": "Mount Hydraulic Tool Holder",
            "instruction": "Insert BT40 tool holder into spindle and tighten retention bolt with torque wrench to 45 Nm (+/- 2 Nm).",
            "tools": ["Calibrated Torque Wrench (17mm)"],
            "safety_warning": "Wear cut-resistant safety gloves.",
            "expected_result": "Retention bolt securely fastened to target torque spec.",
        },
    ]

    item = KnowledgeItem(
        title="Comprehensive Spindle Setup SOP",
        category="OPERATING_PROCEDURE",
        machine_id=machine.id if machine else None,
        author_id=author.id,
        status="PENDING_REVIEW",
    )
    db_session.add(item)
    db_session.flush()

    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=item.title,
        machine_id=machine.id if machine else None,
        status="in_review",
        origin="expert",
        created_by=author.id,
        summary="Standard procedure for precision spindle taper prep and toolholder installation.",
        description="Crucial for preventing tool chatter, thermal taper expansion, and premature spindle bearing failure.",
        content="## Detailed Standard Operating Procedure\nExecute all steps in strict sequential order. Verify torque specs.",
        safety_warnings="MANDATORY: Lockout/Tagout (LOTO) breaker before opening electrical enclosure. Wear ANSI Z87.1 eye protection at all times.",
        operating_conditions="Ambient Room Temp: 20-22 deg C. Hydraulic Line Pressure: 180 Bar (+/- 5 Bar). Spindle Max RPM limit: 12,000.",
        prerequisites="Required PPE: Steel-toe boots, eye protection. Required Tools: Calibrated 17mm torque wrench, dial test indicator.",
        common_mistakes="Overtightening retention knob beyond 50 Nm causing taper distortion.",
        corrective_actions="Back off retention knob immediately, inspect for micro-cracks using dye penetrant.",
        steps=steps_data,
    )
    db_session.add(version)
    db_session.commit()
    db_session.refresh(item)
    db_session.refresh(version)

    # 2. Before review approval, no active RAG chunks exist
    query_pre = RetrievalQuery(query="Lockout Tagout breaker", user_id=author.id)
    results_pre = RetrievalService.retrieve_chunks(query_pre, db_session)
    assert not any("LOTO" in r.text for r in results_pre)

    # 3. Separate peer reviewer logs in and approves article via review decision endpoint
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_B_EMAIL, "password": settings.EXPERT_B_PASSWORD},
    )
    assert login_res.status_code == 200

    csrf_res = client.get("/api/v1/auth/csrf")
    csrf_token = csrf_res.json().get("csrf_token") or client.cookies.get(settings.CSRF_COOKIE_NAME)

    review_res = client.post(
        f"/api/v1/reviews/{item.id}/decision",
        json={"decision": "APPROVED", "comments": "Technically accurate and complete. Approved for shop floor."},
        headers={
            settings.CSRF_HEADER_NAME: csrf_token or "test",
        },
    )
    assert review_res.status_code == 200

    # 4. Verify RAG KnowledgeSource and KnowledgeChunks were automatically created
    source = (
        db_session.query(KnowledgeSource)
        .filter(
            KnowledgeSource.source_type == SOURCE_TYPE_KNOWLEDGE_VERSION,
            KnowledgeSource.knowledge_version_id == version.id,
        )
        .first()
    )
    assert source is not None
    assert source.status == "published"
    assert len(source.chunks) >= 6  # Overview, Safety, Operating Conditions, Prerequisites, Troubleshooting, Steps

    # Verify all chunks are active
    assert all(c.is_active is True for c in source.chunks)

    # 5. Verify ALL user data types can be retrieved through RAG:
    # 5a. Safety Warnings & Invariants
    q_safety = RetrievalQuery(query="Lockout Tagout electrical enclosure eye protection", user_id=author.id)
    res_safety = RetrievalService.retrieve_chunks(q_safety, db_session)
    assert len(res_safety) > 0
    assert any("LOTO" in r.text or "Lockout" in r.text for r in res_safety)

    # 5b. Operating Conditions & Machine Parameters
    q_params = RetrievalQuery(query="hydraulic line pressure 180 Bar spindle max rpm", user_id=author.id)
    res_params = RetrievalService.retrieve_chunks(q_params, db_session)
    assert len(res_params) > 0
    assert any("180 Bar" in r.text for r in res_params)

    # 5c. Prerequisites & Required Tools
    q_tools = RetrievalQuery(query="calibrated torque wrench dial test indicator", user_id=author.id)
    res_tools = RetrievalService.retrieve_chunks(q_tools, db_session)
    assert len(res_tools) > 0
    assert any("17mm torque wrench" in r.text for r in res_tools)

    # 5d. Troubleshooting & Corrective Actions
    q_trouble = RetrievalQuery(query="retention knob taper distortion dye penetrant", user_id=author.id)
    res_trouble = RetrievalService.retrieve_chunks(q_trouble, db_session)
    assert len(res_trouble) > 0
    assert any("dye penetrant" in r.text for r in res_trouble)

    # 5e. Specific Step Instruction with Tool & Tolerance
    q_step = RetrievalQuery(query="mount hydraulic tool holder BT40 45 Nm torque", user_id=author.id)
    res_step = RetrievalService.retrieve_chunks(q_step, db_session)
    assert len(res_step) > 0
    assert any("45 Nm" in r.text and "+/- 2 Nm" in r.text for r in res_step)


def test_superseded_version_deactivates_old_rag_chunks(client: TestClient, db_session: Session):
    """
    Test that when a revision (Version 2) is approved, Version 1's RAG chunks
    are superseded and deactivated (is_active=False).
    """
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    reviewer = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).first()
    assert author is not None and reviewer is not None and author.id != reviewer.id

    # Create item with version 1
    item = KnowledgeItem(
        title="Pneumatic Valve SOP",
        category="OPERATING_PROCEDURE",
        author_id=author.id,
        status="APPROVED",
    )
    db_session.add(item)
    db_session.flush()

    v1 = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title="Pneumatic Valve SOP v1",
        status="published",
        origin="expert",
        created_by=author.id,
        summary="Version 1 pneumatic procedure.",
        steps=[{"order": 1, "title": "Old Step", "instruction": "Turn valve to 50 PSI."}],
    )
    db_session.add(v1)
    db_session.commit()

    # Index v1 into RAG
    IndexingService.index_knowledge_version(v1.id, db_session)
    v1_source = (
        db_session.query(KnowledgeSource)
        .filter(KnowledgeSource.knowledge_version_id == v1.id)
        .first()
    )
    assert v1_source is not None
    assert all(c.is_active is True for c in v1_source.chunks)

    # Now create Version 2
    v2 = KnowledgeVersion(
        item_id=item.id,
        version_no=2,
        title="Pneumatic Valve SOP v2 Updated",
        status="in_review",
        origin="expert",
        created_by=author.id,
        summary="Version 2 updated pneumatic procedure.",
        steps=[{"order": 1, "title": "New Step", "instruction": "Turn valve to 75 PSI."}],
    )
    item.status = "PENDING_REVIEW"
    db_session.add(v2)
    db_session.commit()

    # Reviewer approves v2
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_B_EMAIL, "password": settings.EXPERT_B_PASSWORD},
    )
    assert login_res.status_code == 200

    csrf_res = client.get("/api/v1/auth/csrf")
    csrf_token = csrf_res.json().get("csrf_token") or client.cookies.get(settings.CSRF_COOKIE_NAME)

    review_res = client.post(
        f"/api/v1/reviews/{item.id}/decision",
        json={"decision": "APPROVED", "comments": "Upgraded pressure setting."},
        headers={
            settings.CSRF_HEADER_NAME: csrf_token or "test",
        },
    )
    assert review_res.status_code == 200

    # Verify v1 chunks are deactivated
    db_session.refresh(v1_source)
    assert v1_source.status == "superseded"
    assert all(c.is_active is False for c in v1_source.chunks)

    # Verify v2 chunks are active
    v2_source = (
        db_session.query(KnowledgeSource)
        .filter(KnowledgeSource.knowledge_version_id == v2.id)
        .first()
    )
    assert v2_source is not None
    assert v2_source.status == "published"
    assert all(c.is_active is True for c in v2_source.chunks)

    # Verify query for "75 PSI" matches active v2, while v1 is excluded
    q = RetrievalQuery(query="valve pressure 75 PSI", user_id=author.id)
    results = RetrievalService.retrieve_chunks(q, db_session)
    assert len(results) > 0
    assert any("75 PSI" in r.text for r in results)
    assert not any("50 PSI" in r.text for r in results)
