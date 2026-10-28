"""Record reviewer acknowledgment for AI-generated knowledge drafts.

Revision ID: 015_ai_draft_review_acknowledgment
Revises: 014_chat_audio_analysis_link
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015_ai_draft_review_acknowledgment"
down_revision: Union[str, None] = "014_chat_audio_analysis_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("approval_records") as batch:
        batch.add_column(
            sa.Column(
                "acknowledged_ai_draft",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("approval_records") as batch:
        batch.drop_column("acknowledged_ai_draft")
