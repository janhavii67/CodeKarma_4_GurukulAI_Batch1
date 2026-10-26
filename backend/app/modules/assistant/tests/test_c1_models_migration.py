import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.user import User, RolePermission, UserPermission, Permission
from app.models.machine import Machine
from app.models.process import ManufacturingProcess
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.processing_job import ProcessingJob, JOB_TYPE_KNOWLEDGE_INDEX
from app.core.permissions import (
    ROLE_ADMIN,
    ROLE_EXPERT,
    ROLE_OPERATOR,
    ROLE_TRAINEE,
    PERM_ASSISTANT_USE,
    PERM_ASSISTANT_INDEX,
    PERM_ASSISTANT_REVIEW_FEEDBACK,
)
from app.repositories.user_repo import UserRepository
from app.modules.assistant.models import (
    ChatConversation,
    ChatMessage,
    KnowledgeSource,
    KnowledgeChunk,
    ChatMessageSource,
    AssistantFeedback,
    CONVERSATION_STATUS_ACTIVE,
    MESSAGE_ROLE_USER,
    MESSAGE_ROLE_ASSISTANT,
    EVIDENCE_STATUS_SUFFICIENT,
    FEEDBACK_CATEGORY_HELPFUL,
    FEEDBACK_STATUS_NEW,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
)


def test_permission_seeding_and_role_isolation(db_session: Session):
    """
    Verify assistant permissions are properly seeded.
    assistant.index and assistant.review_feedback must NOT be granted by default
    to EXPERT, OPERATOR, or TRAINEE roles, but granted to ADMIN or via UserPermission.
    """
    # 1. Check permissions exist
    perm_use = db_session.get(Permission, PERM_ASSISTANT_USE)
    perm_idx = db_session.get(Permission, PERM_ASSISTANT_INDEX)
    perm_fb = db_session.get(Permission, PERM_ASSISTANT_REVIEW_FEEDBACK)
    assert perm_use is not None
    assert perm_idx is not None
    assert perm_fb is not None

    # 2. Check role permissions
    for role_id in [ROLE_EXPERT, ROLE_OPERATOR, ROLE_TRAINEE]:
        role_perm_idx = db_session.get(RolePermission, (role_id, PERM_ASSISTANT_INDEX))
        role_perm_fb = db_session.get(RolePermission, (role_id, PERM_ASSISTANT_REVIEW_FEEDBACK))
        assert role_perm_idx is None, f"{role_id} should not have {PERM_ASSISTANT_INDEX}"
        assert role_perm_fb is None, f"{role_id} should not have {PERM_ASSISTANT_REVIEW_FEEDBACK}"

    # 3. Check admin role permission
    admin_perm_idx = db_session.get(RolePermission, (ROLE_ADMIN, PERM_ASSISTANT_INDEX))
    admin_perm_fb = db_session.get(RolePermission, (ROLE_ADMIN, PERM_ASSISTANT_REVIEW_FEEDBACK))
    assert admin_perm_idx is not None
    assert admin_perm_fb is not None

    # 4. Check expert_a has per-user permissions
    expert_a = db_session.query(User).filter(User.email == "expert.a@demo.local").first()
    assert expert_a is not None
    perms = UserRepository.get_user_permissions(db_session, expert_a)
    assert PERM_ASSISTANT_USE in perms
    assert PERM_ASSISTANT_INDEX in perms
    assert PERM_ASSISTANT_REVIEW_FEEDBACK in perms

    # 5. Check expert_b does NOT have the per-user index/feedback permissions
    expert_b = db_session.query(User).filter(User.email == "expert.b@demo.local").first()
    assert expert_b is not None
    perms_b = UserRepository.get_user_permissions(db_session, expert_b)
    assert PERM_ASSISTANT_USE in perms_b
    assert PERM_ASSISTANT_INDEX not in perms_b
    assert PERM_ASSISTANT_REVIEW_FEEDBACK not in perms_b


def test_processing_job_nullable_media_id(db_session: Session):
    """
    Assistant indexing jobs have no media_id.
    Verify ProcessingJob can be created with media_id=None and type=knowledge_index.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    assert user is not None

    job = ProcessingJob(
        type=JOB_TYPE_KNOWLEDGE_INDEX,
        media_id=None,
        version_id=None,
        idempotency_key="test-assistant-index-job-001",
        created_by=user.id,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    assert job.id is not None
    assert job.media_id is None
    assert job.type == JOB_TYPE_KNOWLEDGE_INDEX
    assert job.status == "queued"


def test_assistant_models_crud_and_relationships(db_session: Session):
    """
    Verify complete lifecycle and foreign key relationships across all 6 assistant models.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    assert user is not None
    machine = db_session.query(Machine).first()

    # 1. ChatConversation
    conv = ChatConversation(
        user_id=user.id,
        title="Troubleshooting HAAS Milling",
        machine_id=machine.id if machine else None,
        status=CONVERSATION_STATUS_ACTIVE,
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    assert conv.id is not None
    assert conv.user_id == user.id
    assert conv.user.name == user.name

    # 2. ChatMessage (User)
    msg_user = ChatMessage(
        conversation_id=conv.id,
        role=MESSAGE_ROLE_USER,
        content="What is the recommended spindle warmup routine?",
        is_ai_generated=False,
    )
    db_session.add(msg_user)

    # 3. KnowledgeSource
    src = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id="kv-test-ref-001",
        title="HAAS VF-2 Standard Operating Procedure",
        machine_id=machine.id if machine else None,
        status="published",
        index_version="v1",
    )
    db_session.add(src)
    db_session.commit()
    db_session.refresh(src)

    assert src.id is not None
    assert src.title == "HAAS VF-2 Standard Operating Procedure"

    # 4. KnowledgeChunk
    chunk = KnowledgeChunk(
        source_id=src.id,
        chunk_index=0,
        text="Before high speed cutting, run spindle warmup cycle for 15 minutes at 5000 RPM.",
        section_label="Pre-operation Checks",
        token_count=18,
        search_vector="spindle warmup 5000 rpm high speed",
        metadata_json={"page": 1, "warning": False},
        is_active=True,
    )
    db_session.add(chunk)
    db_session.commit()
    db_session.refresh(chunk)

    assert chunk.id is not None
    assert chunk.source.title == src.title
    assert len(src.chunks) == 1

    # 5. ChatMessage (Assistant with evidence metadata)
    msg_ai = ChatMessage(
        conversation_id=conv.id,
        role=MESSAGE_ROLE_ASSISTANT,
        content="Run the spindle warmup cycle for 15 minutes at 5000 RPM before machining.",
        is_ai_generated=True,
        evidence_status=EVIDENCE_STATUS_SUFFICIENT,
        provider_name="fake",
        model_name="fake-llm-v1",
        prompt_version="v1",
        latency_ms=120,
        request_id="req-test-1234",
    )
    db_session.add(msg_ai)
    db_session.commit()
    db_session.refresh(msg_ai)

    assert msg_ai.id is not None
    assert msg_ai.is_ai_generated is True
    assert msg_ai.latency_ms == 120

    # 6. ChatMessageSource (link citation)
    citation = ChatMessageSource(
        message_id=msg_ai.id,
        chunk_id=chunk.id,
        source_id=src.id,
        rank=1,
        score=0.95,
        cited=True,
    )
    db_session.add(citation)
    db_session.commit()
    db_session.refresh(msg_ai)

    assert len(msg_ai.message_sources) == 1
    assert msg_ai.message_sources[0].chunk.text == chunk.text
    assert msg_ai.message_sources[0].cited is True

    # 7. AssistantFeedback
    fb = AssistantFeedback(
        message_id=msg_ai.id,
        user_id=user.id,
        rating=5,
        category=FEEDBACK_CATEGORY_HELPFUL,
        comment="Exact guidance needed for morning shift setup.",
        status=FEEDBACK_STATUS_NEW,
    )
    db_session.add(fb)
    db_session.commit()
    db_session.refresh(fb)

    assert fb.id is not None
    assert len(msg_ai.feedback) == 1
    assert msg_ai.feedback[0].rating == 5


def test_knowledge_chunk_unique_constraint(db_session: Session):
    """
    Verify unique constraint on (source_id, chunk_index).
    Duplicate chunk_index for the same source must raise IntegrityError.
    """
    src = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id="kv-dup-test-001",
        title="Duplicate Test Source",
        status="published",
    )
    db_session.add(src)
    db_session.commit()

    chunk1 = KnowledgeChunk(
        source_id=src.id,
        chunk_index=0,
        text="First chunk text.",
    )
    db_session.add(chunk1)
    db_session.commit()

    chunk2 = KnowledgeChunk(
        source_id=src.id,
        chunk_index=0,  # Duplicate index
        text="Duplicate chunk text.",
    )
    db_session.add(chunk2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_cascade_delete_conversation(db_session: Session):
    """
    Deleting a ChatConversation should cascade delete its messages,
    citations, and feedback.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    conv = ChatConversation(user_id=user.id, title="Cascade Test")
    db_session.add(conv)
    db_session.commit()

    msg = ChatMessage(conversation_id=conv.id, role=MESSAGE_ROLE_USER, content="Hello")
    db_session.add(msg)
    db_session.commit()

    fb = AssistantFeedback(message_id=msg.id, user_id=user.id, category="helpful")
    db_session.add(fb)
    db_session.commit()

    msg_id = msg.id
    fb_id = fb.id

    # Delete conversation
    db_session.delete(conv)
    db_session.commit()

    assert db_session.get(ChatMessage, msg_id) is None
    assert db_session.get(AssistantFeedback, fb_id) is None


def test_alembic_migration_upgrade_and_downgrade():
    """
    Verify Alembic migration 007_assistant_rag applies cleanly to head
    and can downgrade back to 006 without syntax or schema errors.
    """
    import os
    import tempfile
    from alembic.config import Config
    from alembic import command

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
        # Run all migrations up to head (including 007)
        command.upgrade(alembic_cfg, "head")

        # Downgrade 007 back to 006
        command.downgrade(alembic_cfg, "006_align_voice_vector_schema")

        # Upgrade back to head
        command.upgrade(alembic_cfg, "head")
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
