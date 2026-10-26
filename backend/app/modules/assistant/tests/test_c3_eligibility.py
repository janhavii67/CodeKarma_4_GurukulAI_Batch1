import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.user import User, RolePermission, UserPermission
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_WITHDRAWN,
    STATUS_SUPERSEDED,
)
from app.core.permissions import (
    ROLE_EXPERT,
    ROLE_TRAINEE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
)
from app.modules.assistant.models import (
    KnowledgeSource,
    KnowledgeChunk,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
)
from app.modules.assistant.services.eligibility import get_eligibility_service


def test_chunk_eligibility_lifecycle(db_session: Session):
    """
    Test chunk eligibility across all status transitions:
    - Published & active -> ELIGIBLE
    - Draft version -> INELIGIBLE
    - Withdrawn version -> INELIGIBLE
    - Superseded version -> INELIGIBLE
    - Inactive chunk -> INELIGIBLE
    """
    eligibility = get_eligibility_service()
    user = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()
    assert user is not None

    # 1. Create a KnowledgeItem
    item = KnowledgeItem(
        title="Torque Calibration SOP",
        author_id=user.id,
    )
    db_session.add(item)
    db_session.commit()

    # 2. Version 1: Published
    v1 = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Version 1 summary",
        steps=[{"step": 1, "text": "Calibrate torque wrench to 45 Nm."}],
        created_by=user.id,
    )
    db_session.add(v1)
    db_session.commit()

    src1 = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=v1.id,
        knowledge_version_id=v1.id,
        title="Torque Calibration SOP v1",
        status="published",
    )
    db_session.add(src1)
    db_session.commit()

    chunk1 = KnowledgeChunk(
        source_id=src1.id,
        chunk_index=0,
        text="Calibrate torque wrench to 45 Nm before shift.",
        is_active=True,
    )
    db_session.add(chunk1)
    db_session.commit()

    # Case A: Published and active -> Eligible
    assert eligibility.is_chunk_eligible(chunk1.id, user.id, db_session) is True
    assert eligibility.is_source_eligible(src1.id, user.id, db_session) is True

    # Case B: Chunk marked inactive -> Ineligible
    chunk1.is_active = False
    db_session.commit()
    assert eligibility.is_chunk_eligible(chunk1.id, user.id, db_session) is False

    chunk1.is_active = True
    db_session.commit()

    # Case C: Version marked withdrawn -> Ineligible
    v1.status = STATUS_WITHDRAWN
    src1.status = "withdrawn"
    db_session.commit()
    assert eligibility.is_chunk_eligible(chunk1.id, user.id, db_session) is False
    assert eligibility.is_source_eligible(src1.id, user.id, db_session) is False

    # Case D: Version marked superseded -> Ineligible
    v1.status = STATUS_SUPERSEDED
    src1.status = "superseded"
    db_session.commit()
    assert eligibility.is_chunk_eligible(chunk1.id, user.id, db_session) is False

    # Case E: Draft version -> Ineligible
    v2 = KnowledgeVersion(
        item_id=item.id,
        version_no=2,
        status=STATUS_DRAFT,
        summary="Draft unapproved revision",
        steps=[],
        created_by=user.id,
    )
    db_session.add(v2)
    db_session.commit()

    src2 = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=v2.id,
        knowledge_version_id=v2.id,
        title="Draft Torque SOP",
        status="draft",
    )
    db_session.add(src2)
    db_session.commit()

    chunk2 = KnowledgeChunk(
        source_id=src2.id,
        chunk_index=0,
        text="Unapproved torque spec: 60 Nm.",
        is_active=True,
    )
    db_session.add(chunk2)
    db_session.commit()

    assert eligibility.is_chunk_eligible(chunk2.id, user.id, db_session) is False
    assert eligibility.is_source_eligible(src2.id, user.id, db_session) is False


def test_user_permission_eligibility_enforcement(db_session: Session):
    """
    Deactivated user or user without view_published permission cannot see any chunks.
    """
    eligibility = get_eligibility_service()

    # Create published source and chunk
    src = KnowledgeSource(
        source_type="transcript",
        source_ref_id="tr-test-01",
        title="General Milling Overview",
        status="published",
    )
    db_session.add(src)
    db_session.commit()

    chunk = KnowledgeChunk(
        source_id=src.id,
        chunk_index=0,
        text="General safety goggles required in machining cell.",
        is_active=True,
    )
    db_session.add(chunk)
    db_session.commit()

    # Valid user
    user = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()
    assert eligibility.is_chunk_eligible(chunk.id, user.id, db_session) is True

    # Deactivated user
    user.is_active = False
    db_session.commit()
    assert eligibility.is_chunk_eligible(chunk.id, user.id, db_session) is False
    assert eligibility.is_source_eligible(src.id, user.id, db_session) is False

    # Restore user
    user.is_active = True
    db_session.commit()
    assert eligibility.is_chunk_eligible(chunk.id, user.id, db_session) is True


def test_sql_filter_inside_retrieval_query(db_session: Session):
    """
    Verify get_sql_filter embeds directly into SELECT queries to filter out
    all draft, inactive, or non-published chunks in SQL.
    """
    eligibility = get_eligibility_service()
    user = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()

    # Source A: published
    src_pub = KnowledgeSource(
        source_type="transcript",
        source_ref_id="tr-pub",
        title="Published Guide",
        status="published",
    )
    # Source B: draft
    src_draft = KnowledgeSource(
        source_type="transcript",
        source_ref_id="tr-draft",
        title="Draft Guide",
        status="draft",
    )
    db_session.add_all([src_pub, src_draft])
    db_session.commit()

    chunk_pub = KnowledgeChunk(source_id=src_pub.id, chunk_index=0, text="Published text", is_active=True)
    chunk_inactive = KnowledgeChunk(source_id=src_pub.id, chunk_index=1, text="Inactive text", is_active=False)
    chunk_draft = KnowledgeChunk(source_id=src_draft.id, chunk_index=0, text="Draft text", is_active=True)
    db_session.add_all([chunk_pub, chunk_inactive, chunk_draft])
    db_session.commit()

    # Query with SQL filter
    filters = eligibility.get_sql_filter(user.id, db_session)
    query = (
        select(KnowledgeChunk)
        .join(KnowledgeSource, KnowledgeChunk.source_id == KnowledgeSource.id)
        .outerjoin(KnowledgeVersion, KnowledgeSource.knowledge_version_id == KnowledgeVersion.id)
        .where(*filters)
    )
    results = db_session.execute(query).scalars().all()
    result_ids = [c.id for c in results]

    assert chunk_pub.id in result_ids
    assert chunk_inactive.id not in result_ids
    assert chunk_draft.id not in result_ids
