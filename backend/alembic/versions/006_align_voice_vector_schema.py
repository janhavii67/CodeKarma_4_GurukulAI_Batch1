"""006_align_voice_vector_schema

Revision ID: 006_align_voice_vector_schema
Revises: 005_troubleshooting_and_processes
Create Date: 2026-10-25 23:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_align_voice_vector_schema"
down_revision: Union[str, None] = "005_troubleshooting_and_processes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely drop existing tables in dependency order if they exist
    for tbl in ["knowledge_embeddings", "transcript_segments", "transcripts", "processing_jobs"]:
        try:
            op.drop_table(tbl)
        except Exception:
            pass

    # 1. processing_jobs aligned with ProcessingJob model
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False, server_default="voice_to_knowledge"),
        sa.Column("media_id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("error_safe", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_processing_jobs_idempotency_key"),
    )
    op.create_index(op.f("ix_processing_jobs_media_id"), "processing_jobs", ["media_id"], unique=False)
    op.create_index(op.f("ix_processing_jobs_status"), "processing_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_processing_jobs_created_by"), "processing_jobs", ["created_by"], unique=False)

    # 2. transcripts aligned with Transcript model
    op.create_table(
        "transcripts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="en"),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="whisper_api"),
        sa.Column("full_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcripts_media_id"), "transcripts", ["media_id"], unique=False)

    # 3. transcript_segments aligned with TranscriptSegment model
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("transcript_id", sa.String(length=36), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("edited_text", sa.Text(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcript_segments_transcript_id"), "transcript_segments", ["transcript_id"], unique=False)

    # 4. knowledge_embeddings aligned with KnowledgeEmbedding model
    op.create_table(
        "knowledge_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=True),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding_json", sa.Text(), nullable=False),
        sa.Column("embedding_model", sa.String(length=64), nullable=False, server_default="default-vector-v1"),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledge_embeddings_source_id"), "knowledge_embeddings", ["source_id"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_media_id"), "knowledge_embeddings", ["media_id"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_version_id"), "knowledge_embeddings", ["version_id"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_machine_id"), "knowledge_embeddings", ["machine_id"], unique=False)


def downgrade() -> None:
    for tbl in ["knowledge_embeddings", "transcript_segments", "transcripts", "processing_jobs"]:
        op.drop_table(tbl)
