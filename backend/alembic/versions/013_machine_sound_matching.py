"""Replace simulated sound baselines with reviewed, versioned audio references.

Revision ID: 013_machine_sound_matching
Revises: 012_simulation_knowledge_review
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013_machine_sound_matching"
down_revision: Union[str, None] = "012_simulation_knowledge_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("audio_references") as batch:
        batch.alter_column("fault_label", existing_type=sa.String(128), nullable=True)
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("status", sa.String(32), nullable=False, server_default="draft"))
        batch.add_column(sa.Column("feature_version", sa.String(64), nullable=True))
        batch.add_column(sa.Column("knowledge_version_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("media_asset_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("model_name", sa.String(256), nullable=True))
        batch.add_column(sa.Column("component", sa.String(256), nullable=True))
        batch.add_column(sa.Column("operation", sa.String(256), nullable=True))
        batch.add_column(sa.Column("recording_source", sa.String(256), nullable=True))
        batch.add_column(sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("related_links_json", sa.Text(), nullable=True))
        batch.add_column(sa.Column("reviewer_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("review_comment", sa.Text(), nullable=True))
        batch.create_foreign_key("fk_audio_reference_knowledge_version", "knowledge_versions", ["knowledge_version_id"], ["id"], ondelete="SET NULL")
        batch.create_foreign_key("fk_audio_reference_media_asset", "media_assets", ["media_asset_id"], ["id"], ondelete="SET NULL")
        batch.create_foreign_key("fk_audio_reference_reviewer", "users", ["reviewer_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_audio_references_knowledge_version_id", ["knowledge_version_id"], unique=True)
        batch.create_index("ix_audio_references_media_asset_id", ["media_asset_id"], unique=True)
        batch.create_index("ix_audio_reference_status_machine", ["status", "machine_id"])

    # Earlier seeded rows were synthetic metadata with no decodable recordings.
    # Retain their records for audit, but make them ineligible for matching.
    op.execute("UPDATE audio_references SET is_expert_verified = 0, status = 'legacy_unreviewed', features_json = NULL")

    with op.batch_alter_table("audio_analysis_jobs") as batch:
        batch.alter_column("file_path", existing_type=sa.String(512), nullable=True)
        batch.add_column(sa.Column("audio_sha256", sa.String(64), nullable=True))
        batch.add_column(sa.Column("submission_media_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("review_status", sa.String(32), nullable=True))
        batch.add_column(sa.Column("reviewer_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("review_note", sa.Text(), nullable=True))
        batch.create_foreign_key("fk_audio_job_submission_media", "media_assets", ["submission_media_id"], ["id"], ondelete="SET NULL")
        batch.create_foreign_key("fk_audio_job_reviewer", "users", ["reviewer_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_audio_analysis_jobs_submission_media_id", ["submission_media_id"])


def downgrade() -> None:
    op.execute("UPDATE audio_references SET fault_label = 'Unreviewed' WHERE fault_label IS NULL")
    with op.batch_alter_table("audio_analysis_jobs") as batch:
        batch.drop_index("ix_audio_analysis_jobs_submission_media_id")
        batch.drop_constraint("fk_audio_job_reviewer", type_="foreignkey")
        batch.drop_constraint("fk_audio_job_submission_media", type_="foreignkey")
        batch.drop_column("review_note")
        batch.drop_column("reviewed_at")
        batch.drop_column("reviewer_id")
        batch.drop_column("review_status")
        batch.drop_column("submission_media_id")
        batch.drop_column("audio_sha256")
        batch.alter_column("file_path", existing_type=sa.String(512), nullable=False)
    with op.batch_alter_table("audio_references") as batch:
        batch.drop_index("ix_audio_reference_status_machine")
        batch.drop_index("ix_audio_references_media_asset_id")
        batch.drop_index("ix_audio_references_knowledge_version_id")
        batch.drop_constraint("fk_audio_reference_reviewer", type_="foreignkey")
        batch.drop_constraint("fk_audio_reference_media_asset", type_="foreignkey")
        batch.drop_constraint("fk_audio_reference_knowledge_version", type_="foreignkey")
        batch.drop_column("review_comment")
        batch.drop_column("reviewed_at")
        batch.drop_column("reviewer_id")
        batch.drop_column("related_links_json")
        batch.drop_column("recorded_at")
        batch.drop_column("recording_source")
        batch.drop_column("operation")
        batch.drop_column("component")
        batch.drop_column("model_name")
        batch.drop_column("media_asset_id")
        batch.drop_column("knowledge_version_id")
        batch.drop_column("feature_version")
        batch.drop_column("status")
        batch.drop_column("description")
        batch.alter_column("fault_label", existing_type=sa.String(128), nullable=False)
