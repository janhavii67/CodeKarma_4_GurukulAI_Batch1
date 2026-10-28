"""Join the main platform and frontend redesign migration branches.

Revision ID: 016_merge_frontend_redesign_branches
Revises: 009_unique_transcript_per_media, 015_ai_draft_review_acknowledgment
"""
from typing import Sequence, Union

from alembic import op


revision: str = "016_merge_frontend_redesign_branches"
down_revision: Union[str, Sequence[str], None] = (
    "009_unique_transcript_per_media",
    "015_ai_draft_review_acknowledgment",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The parent branches contain independent schema changes; this revision
    # records their convergence without modifying the database.
    pass


def downgrade() -> None:
    pass
