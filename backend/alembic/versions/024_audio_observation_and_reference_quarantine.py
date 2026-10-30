"""Add neutral AI audio observations and quarantine unproven audio references.

Revision ID: 024_audio_observation_and_reference_quarantine
Revises: 023_tutor_memory
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "024_audio_observation_and_reference_quarantine"
down_revision: Union[str, None] = "023_tutor_memory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_QUARANTINE_COMMENT = (
    "Temporarily quarantined: this published recording has no recording-source provenance. "
    "Before reuse, confirm it is an original real-device recording, verify its machine/model "
    "association and current source links, and complete expert review."
)


def upgrade() -> None:
    op.add_column("audio_analysis_jobs", sa.Column("audio_observation", sa.Text(), nullable=True))
    op.add_column("audio_analysis_jobs", sa.Column("processing_metadata_json", sa.Text(), nullable=True))

    bind = op.get_bind()
    if not sa.inspect(bind).has_table("audio_references"):
        return

    # Missing source provenance makes a machine-sound label unverifiable. Keep
    # the recordings and their audit information, but remove them from live RAG
    # and matching until an expert can revalidate them.
    bind.execute(
        sa.text(
            "UPDATE audio_references "
            "SET status = 'draft', is_expert_verified = 0, review_comment = :comment "
            "WHERE status = 'published' AND recording_source IS NULL"
        ),
        {"comment": _QUARANTINE_COMMENT},
    )
    bind.execute(
        sa.text(
            "UPDATE knowledge_versions SET status = 'withdrawn' "
            "WHERE id IN (SELECT knowledge_version_id FROM audio_references "
            "WHERE review_comment = :comment AND knowledge_version_id IS NOT NULL)"
        ),
        {"comment": _QUARANTINE_COMMENT},
    )
    bind.execute(
        sa.text(
            "UPDATE knowledge_items SET current_published_version_id = NULL, "
            "status = 'WITHDRAWN', is_archived = 1 "
            "WHERE current_published_version_id IN (SELECT knowledge_version_id FROM audio_references "
            "WHERE review_comment = :comment AND knowledge_version_id IS NOT NULL)"
        ),
        {"comment": _QUARANTINE_COMMENT},
    )
    bind.execute(
        sa.text(
            "UPDATE knowledge_sources SET status = 'withdrawn' "
            "WHERE knowledge_version_id IN (SELECT knowledge_version_id FROM audio_references "
            "WHERE review_comment = :comment AND knowledge_version_id IS NOT NULL)"
        ),
        {"comment": _QUARANTINE_COMMENT},
    )
    bind.execute(
        sa.text(
            "UPDATE knowledge_chunks SET is_active = 0 "
            "WHERE source_id IN (SELECT id FROM knowledge_sources "
            "WHERE knowledge_version_id IN (SELECT knowledge_version_id FROM audio_references "
            "WHERE review_comment = :comment AND knowledge_version_id IS NOT NULL))"
        ),
        {"comment": _QUARANTINE_COMMENT},
    )


def downgrade() -> None:
    # Quarantined records deliberately remain withdrawn after a schema rollback;
    # restoring their old published status would reintroduce unverified guidance.
    op.drop_column("audio_analysis_jobs", "processing_metadata_json")
    op.drop_column("audio_analysis_jobs", "audio_observation")
