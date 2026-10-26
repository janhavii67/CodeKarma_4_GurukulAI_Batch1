"""007_assistant_rag

Revision ID: 007_assistant_rag
Revises: 006_align_voice_vector_schema
Create Date: 2026-10-26 11:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007_assistant_rag"
down_revision: Union[str, None] = "006_align_voice_vector_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Relax media_id to nullable in processing_jobs so indexing jobs can use it
    with op.batch_alter_table("processing_jobs") as batch_op:
        batch_op.alter_column(
            "media_id",
            existing_type=sa.String(length=36),
            nullable=True,
        )

    # 2. chat_conversations
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default="New Conversation"),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("process_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["process_id"], ["manufacturing_processes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_conversations_user_id"), "chat_conversations", ["user_id"], unique=False)
    op.create_index(op.f("ix_chat_conversations_machine_id"), "chat_conversations", ["machine_id"], unique=False)
    op.create_index(op.f("ix_chat_conversations_process_id"), "chat_conversations", ["process_id"], unique=False)
    op.create_index(op.f("ix_chat_conversations_status"), "chat_conversations", ["status"], unique=False)

    # 3. chat_messages
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("evidence_status", sa.String(length=32), nullable=False, server_default="n_a"),
        sa.Column("provider_name", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=64), nullable=True),
        sa.Column("prompt_version", sa.String(length=32), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["chat_conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_messages_conversation_id"), "chat_messages", ["conversation_id"], unique=False)

    # 4. knowledge_sources
    op.create_table(
        "knowledge_sources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_ref_id", sa.String(length=64), nullable=False),
        sa.Column("knowledge_version_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("process_id", sa.String(length=36), nullable=True),
        sa.Column("product_family", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="published"),
        sa.Column("access_policy_ref", sa.String(length=128), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("index_version", sa.String(length=32), nullable=False, server_default="v1"),
        sa.ForeignKeyConstraint(["knowledge_version_id"], ["knowledge_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["process_id"], ["manufacturing_processes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledge_sources_source_type"), "knowledge_sources", ["source_type"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_source_ref_id"), "knowledge_sources", ["source_ref_id"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_knowledge_version_id"), "knowledge_sources", ["knowledge_version_id"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_machine_id"), "knowledge_sources", ["machine_id"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_process_id"), "knowledge_sources", ["process_id"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_product_family"), "knowledge_sources", ["product_family"], unique=False)
    op.create_index(op.f("ix_knowledge_sources_status"), "knowledge_sources", ["status"], unique=False)

    # 5. knowledge_chunks
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("section_label", sa.String(length=255), nullable=True),
        sa.Column("timestamp_start", sa.Float(), nullable=True),
        sa.Column("timestamp_end", sa.Float(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("search_vector", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["knowledge_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "chunk_index", name="uq_knowledge_chunks_source_idx"),
    )
    op.create_index(op.f("ix_knowledge_chunks_source_id"), "knowledge_chunks", ["source_id"], unique=False)
    op.create_index(op.f("ix_knowledge_chunks_is_active"), "knowledge_chunks", ["is_active"], unique=False)

    # 6. chat_message_sources
    op.create_table(
        "chat_message_sources",
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("cited", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chunk_id"], ["knowledge_chunks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["knowledge_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("message_id", "chunk_id"),
    )
    op.create_index(op.f("ix_chat_message_sources_source_id"), "chat_message_sources", ["source_id"], unique=False)

    # 7. assistant_feedback
    op.create_table(
        "assistant_feedback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assistant_feedback_message_id"), "assistant_feedback", ["message_id"], unique=False)
    op.create_index(op.f("ix_assistant_feedback_user_id"), "assistant_feedback", ["user_id"], unique=False)
    op.create_index(op.f("ix_assistant_feedback_category"), "assistant_feedback", ["category"], unique=False)
    op.create_index(op.f("ix_assistant_feedback_status"), "assistant_feedback", ["status"], unique=False)


def downgrade() -> None:
    op.drop_table("assistant_feedback")
    op.drop_table("chat_message_sources")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_sources")
    op.drop_table("chat_messages")
    op.drop_table("chat_conversations")

    with op.batch_alter_table("processing_jobs") as batch_op:
        batch_op.alter_column(
            "media_id",
            existing_type=sa.String(length=36),
            nullable=False,
        )
