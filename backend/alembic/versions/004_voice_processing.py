"""004_voice_processing

Revision ID: 004_voice_processing
Revises: 003_governance_constraints
Create Date: 2026-10-25 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004_voice_processing"
down_revision: Union[str, None] = "003_governance_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. media_assets
    op.create_table(
        "media_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False, server_default="Untitled Media"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="audio"),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("original_name", sa.String(length=256), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_media_assets_version_id"), "media_assets", ["version_id"], unique=False)
    op.create_index(op.f("ix_media_assets_machine_id"), "media_assets", ["machine_id"], unique=False)

    # 2. processing_jobs
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
        sa.UniqueConstraint("idempotency_key", name="uq_processing_jobs_idempotency"),
    )
    op.create_index(op.f("ix_processing_jobs_status"), "processing_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_processing_jobs_version_id"), "processing_jobs", ["version_id"], unique=False)

    # 3. transcripts
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
    op.create_index(op.f("ix_transcripts_version_id"), "transcripts", ["version_id"], unique=False)

    # 4. transcript_segments
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("transcript_id", sa.String(length=36), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=False),
        sa.Column("original_text", sa.Text(), nullable=False),
        sa.Column("edited_text", sa.Text(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcript_segments_transcript_id"), "transcript_segments", ["transcript_id"], unique=False)

    # 5. knowledge_embeddings (Vector store table for RAG similarity search)
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
    op.create_index(op.f("ix_knowledge_embeddings_source_type"), "knowledge_embeddings", ["source_type"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_source_id"), "knowledge_embeddings", ["source_id"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_machine_id"), "knowledge_embeddings", ["machine_id"], unique=False)


def downgrade() -> None:
    op.drop_table("knowledge_embeddings")
    op.drop_table("transcript_segments")
    op.drop_table("transcripts")
    op.drop_table("processing_jobs")
    op.drop_table("media_assets")
