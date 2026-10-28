"""Ensure one transcript is associated with each recording."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009_unique_transcript_per_media"
down_revision: Union[str, None] = "008_reconcile_job_embedding_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    duplicates = op.get_bind().execute(
        sa.text(
            "SELECT media_id FROM transcripts GROUP BY media_id "
            "HAVING COUNT(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicates:
        raise RuntimeError(
            "Cannot enforce one transcript per recording: duplicate transcripts exist. "
            "Review and reconcile them before applying this migration."
        )

    op.create_index("uq_transcripts_media_id", "transcripts", ["media_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_transcripts_media_id", table_name="transcripts")
