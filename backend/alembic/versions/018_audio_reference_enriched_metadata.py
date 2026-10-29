"""Add manufacturer, sound_label, annotation_notes to audio_references;
add user-scoped analysis-job history index.

Revision ID: 018_audio_reference_enriched_metadata
Revises: 017_tutor_attachment_continuity
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "018_audio_reference_enriched_metadata"
down_revision: Union[str, None] = "017_tutor_attachment_continuity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("audio_references") as batch:
        batch.add_column(sa.Column("manufacturer", sa.String(256), nullable=True))
        batch.add_column(sa.Column("sound_label", sa.String(128), nullable=True))
        batch.add_column(sa.Column("annotation_notes", sa.Text, nullable=True))

    with op.batch_alter_table("audio_analysis_jobs") as batch:
        batch.create_index(
            "ix_audio_analysis_jobs_uploaded_by_created",
            ["uploaded_by", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("audio_analysis_jobs") as batch:
        batch.drop_index("ix_audio_analysis_jobs_uploaded_by_created")

    with op.batch_alter_table("audio_references") as batch:
        batch.drop_column("annotation_notes")
        batch.drop_column("sound_label")
        batch.drop_column("manufacturer")
