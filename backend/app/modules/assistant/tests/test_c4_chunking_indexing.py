import pytest
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED, STATUS_DRAFT
from app.models.media import MediaAsset
from app.models.transcript import Transcript, TranscriptSegment
from app.models.processing_job import ProcessingJob, JOB_TYPE_KNOWLEDGE_INDEX
from app.core.permissions import ROLE_EXPERT
from app.modules.assistant.chunking import (
    chunk_knowledge_version,
    chunk_transcript_segments,
    chunk_text,
)
from app.modules.assistant.services.indexing_service import IndexingService
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk


def test_chunk_knowledge_version_structure():
    """
    Verify chunking of structured knowledge version produces overview and step-specific chunks.
    """
    steps = [
        {
            "step": 1,
            "title": "Clean Spindle Taper",
            "text": "Wipe spindle taper with lint-free cloth and isopropyl alcohol.",
            "warning": "Ensure machine is in E-STOP mode.",
        },
        {
            "step": 2,
            "title": "Insert Tool Holder",
            "text": "Align drive keys and clamp tool holder into spindle with pull stud at 45 Nm.",
        },
    ]

    chunks = chunk_knowledge_version(
        title="HAAS VF-2 Tool Setup",
        summary="Standard procedure for tool loading.",
        description="Detailed steps for precision milling setup.",
        steps=steps,
        version_no=1,
    )

    assert len(chunks) == 3  # 1 overview + 2 steps
    overview = chunks[0]
    assert overview.section_label == "Overview"
    assert "HAAS VF-2 Tool Setup" in overview.text
    assert "haas" in overview.search_vector
    assert "taper" not in overview.text  # Step details not in overview

    step1 = chunks[1]
    assert "Step 1" in step1.section_label
    assert "E-STOP" in step1.text
    assert step1.metadata["has_safety_note"] is True

    step2 = chunks[2]
    assert "Step 2" in step2.section_label
    assert "45 Nm" in step2.text


def test_chunk_text_markdown_and_overlap():
    """
    Verify chunk_text splits Markdown headers and paragraph rolling window.
    """
    doc = """
# Section 1: Pre-check
Perform visual inspection of coolant level.

## Section 2: Warmup Routine
Run the spindle for 15 minutes.
Check hydraulic pressure gauge reading 35 bar.
"""
    chunks = chunk_text(doc, title="Maintenance Guide", target_words=50)
    assert len(chunks) >= 2
    assert any("Section 1" in (c.section_label or "") for c in chunks)
    assert any("Section 2" in (c.section_label or "") for c in chunks)


def test_long_knowledge_chunks_preserve_multiline_and_paragraph_boundaries():
    first_paragraph = " ".join(["calibration"] * 20) + "\n" + " ".join(["zero"] * 20)
    second_paragraph = " ".join(["component"] * 20) + "\n" + " ".join(["coil"] * 20)
    third_paragraph = " ".join(["maintenance"] * 40) + "\n" + " ".join(["reference"] * 40)
    text = "\n\n".join([first_paragraph, second_paragraph, third_paragraph])

    chunks = chunk_text(text, target_words=100, overlap_words=5)

    assert len(chunks) > 1
    assert "\n" in chunks[0].text
    assert "\n\n" in chunks[0].text
    assert "\n" in chunks[1].text


def test_knowledge_chunks_include_document_page_citations_but_not_related_knowledge_refs():
    chunks = chunk_knowledge_version(
        title="Fixture source-attribution draft",
        content="First verified fixture line.\n\nSecond verified fixture paragraph.",
        source_refs=[
            {
                "type": "document",
                "source_title": "Fixture manual",
                "revision": "R3",
                "pdf_pages": [8, 9],
                "printed_pages": [4],
                "section": "Test section",
            },
            {"type": "knowledge", "title": "Unrelated linked record", "version_no": 2},
        ],
    )

    assert chunks
    assert all("Source document: Fixture manual" in chunk.text for chunk in chunks)
    assert all("PDF page(s) 8, 9" in chunk.text for chunk in chunks)
    assert all("printed page(s) 4" in chunk.text for chunk in chunks)
    assert all("Unrelated linked record" not in chunk.text for chunk in chunks)
    assert all("Fixture manual" in (chunk.section_label or "") for chunk in chunks)


def test_indexing_service_knowledge_version_crud_and_idempotency(db_session: Session):
    """
    Verify IndexingService creates KnowledgeSource and chunks in DB,
    and re-indexing idempotently updates without duplicating chunks.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    assert user is not None

    item = KnowledgeItem(title="CNC Lathe Collet Chuck Maintenance", author_id=user.id)
    db_session.add(item)
    db_session.commit()

    v1 = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Daily maintenance routine for lathe collet.",
        description="Covers lubrication and debris removal.",
        steps=[
            {"step": 1, "title": "Blow Debris", "text": "Use low pressure air to clear chips."},
            {"step": 2, "title": "Apply Grease", "text": "Apply 5g molybdenum grease to wedge surfaces."},
        ],
        created_by=user.id,
    )
    db_session.add(v1)
    db_session.commit()

    # Index version
    source = IndexingService.index_knowledge_version(v1.id, db_session, user_id=user.id)
    assert source.id is not None
    assert source.title == item.title
    assert source.status == STATUS_PUBLISHED

    chunks = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()
    assert len(chunks) == 3
    assert all(c.is_active is True for c in chunks)

    # Re-index same version (idempotency check)
    source2 = IndexingService.index_knowledge_version(v1.id, db_session, user_id=user.id)
    assert source2.id == source.id

    chunks_after = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()
    assert len(chunks_after) == 3  # Not 6! Clean replacement


def test_indexing_service_stores_configured_embeddings(db_session: Session, monkeypatch):
    class Provider:
        def embed_texts(self, request):
            return type("EmbeddingResponse", (), {"embeddings": [[0.25, 0.75] for _ in request.texts]})()

    monkeypatch.setattr(
        "app.modules.assistant.services.indexing_service.get_embedding_provider",
        lambda: Provider(),
    )
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    item = KnowledgeItem(title="Embedding index check", author_id=user.id)
    db_session.add(item)
    db_session.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="A focused index test for embedding storage.",
        created_by=user.id,
    )
    db_session.add(version)
    db_session.commit()

    source = IndexingService.index_knowledge_version(version.id, db_session, user_id=user.id)
    chunks = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()

    assert chunks
    assert all(chunk.metadata_json["embedding"] == [0.25, 0.75] for chunk in chunks)


def test_indexing_service_deactivate_lifecycle(db_session: Session):
    """
    Verify deactivating a source sets is_active=False on all chunks immediately.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    item = KnowledgeItem(title="Withdrawn SOP", author_id=user.id)
    db_session.add(item)
    db_session.commit()

    v = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Old procedure to be withdrawn.",
        steps=[{"step": 1, "title": "Old Step", "text": "Old method."}],
        created_by=user.id,
    )
    db_session.add(v)
    db_session.commit()

    source = IndexingService.index_knowledge_version(v.id, db_session, user_id=user.id)
    chunks = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()
    assert all(c.is_active is True for c in chunks)

    # Deactivate hook
    ok = IndexingService.deactivate_source_for_version(v.id, db_session, new_status="withdrawn")
    assert ok is True

    db_session.refresh(source)
    assert source.status == "withdrawn"
    chunks_deactivated = db_session.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).all()
    assert all(c.is_active is False for c in chunks_deactivated)


def test_run_indexing_job_background_processing(db_session: Session):
    """
    Verify run_indexing_job processes a background job and transitions status cleanly.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    item = KnowledgeItem(title="Background Indexing Test", author_id=user.id)
    db_session.add(item)
    db_session.commit()

    v = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Background job test version.",
        steps=[{"step": 1, "title": "Check Pressure", "text": "Verify pressure is 10 bar."}],
        created_by=user.id,
    )
    db_session.add(v)
    db_session.commit()

    job = ProcessingJob(
        type=JOB_TYPE_KNOWLEDGE_INDEX,
        media_id=None,
        version_id=v.id,
        idempotency_key="bg-test-job-001",
        created_by=user.id,
        status="queued",
    )
    db_session.add(job)
    db_session.commit()

    # Execute job
    processed_job = IndexingService.run_indexing_job(job.id, db_session)
    assert processed_job.status == "completed"
    assert processed_job.progress == 100
    assert processed_job.error_safe is None

    # Check chunks exist
    src = db_session.query(KnowledgeSource).filter(KnowledgeSource.knowledge_version_id == v.id).first()
    assert src is not None
    assert len(src.chunks) == 2


def test_seeded_published_articles_automatically_in_knowledge_base(db_session: Session):
    """
    Verify that articles seeded in the database are automatically ingested
    into the Assistant Knowledge Base (knowledge_sources and knowledge_chunks).
    """
    # 1. Published articles must be present in knowledge_sources
    spindle_src = (
        db_session.query(KnowledgeSource)
        .filter(KnowledgeSource.title.ilike("%spindle%"))
        .first()
    )
    assert spindle_src is not None, "Seeded published spindle article must be in knowledge_sources"
    assert spindle_src.status == "published"
    assert len(spindle_src.chunks) > 0
    assert all(c.is_active is True for c in spindle_src.chunks)

    # 2. Cavitation article must be present
    cavitation_src = (
        db_session.query(KnowledgeSource)
        .filter(KnowledgeSource.title.ilike("%cavitation%"))
        .first()
    )
    assert cavitation_src is not None
    assert cavitation_src.status == "published"
    assert len(cavitation_src.chunks) > 0


def test_peer_review_approval_flow_automatically_indexes_to_knowledge_base(db_session: Session):
    """
    End-to-End Test:
    When a user authors a draft, it is NOT in the active knowledge base.
    When peer reviewer approves the article, it is AUTOMATICALLY indexed
    into knowledge_sources and knowledge_chunks with is_active=True.
    """
    expert_a = db_session.query(User).filter(User.email == "expert.a@demo.local").first()
    expert_b = db_session.query(User).filter(User.email == "expert.b@demo.local").first()
    assert expert_a is not None and expert_b is not None

    # Step 1: Expert A authors a draft article
    from app.models.knowledge import KnowledgeArticle, KnowledgeRevision
    item = KnowledgeArticle(
        title="Laser Welding Beam Offset Calibration",
        author_id=expert_a.id,
        status="PENDING_REVIEW",
        current_version=1,
    )
    db_session.add(item)
    db_session.commit()

    rev = KnowledgeRevision(
        item_id=item.id,
        article_id=item.id,
        version_no=1,
        version=1,
        title="Laser Welding Beam Offset Calibration",
        status="in_review",
        origin="expert",
        summary="Calibrate laser focal spot within 15 microns of seam centerline.",
        content="Laser welding procedure details.",
        steps=[{"order": 1, "title": "Beam Centering", "instruction": "Adjust beam alignment screws."}],
        created_by=expert_a.id,
        author_id=expert_a.id,
    )
    db_session.add(rev)
    db_session.commit()

    # Verify: While in review, NOT in the active knowledge base
    active_chunk = (
        db_session.query(KnowledgeChunk)
        .join(KnowledgeSource, KnowledgeChunk.source_id == KnowledgeSource.id)
        .filter(KnowledgeSource.knowledge_version_id == rev.id, KnowledgeChunk.is_active == True)
        .first()
    )
    assert active_chunk is None, "Draft/in-review article must NOT be in active knowledge base"

    # Step 2: Expert B approves the review decision
    from app.schemas.review import ReviewDecisionRequest
    from app.core.permissions import AuthenticatedContext
    from app.api.v1.endpoints.reviews import submit_review_decision
    from unittest.mock import MagicMock

    auth_ctx = AuthenticatedContext(user=expert_b, session=MagicMock(), permissions=["knowledge.approve"])
    submit_review_decision(
        article_id=item.id,
        payload=ReviewDecisionRequest(decision="APPROVED", comments="Verified laser alignment tolerances."),
        auth_ctx=auth_ctx,
        db=db_session,
    )

    # Step 3: Verify the approved article was AUTOMATICALLY ingested into the Assistant Knowledge Base!
    source_after = (
        db_session.query(KnowledgeSource)
        .filter(KnowledgeSource.knowledge_version_id == rev.id)
        .first()
    )
    assert source_after is not None, "Approved version must be auto-indexed into knowledge_sources"
    assert source_after.status == "published"
    assert len(source_after.chunks) >= 1
    assert all(c.is_active is True for c in source_after.chunks)
    assert any("Beam Centering" in c.text for c in source_after.chunks)
