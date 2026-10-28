"""Persist an owner-scoped audio analysis link on grounded chat answers.

Revision ID: 014_chat_audio_analysis_link
Revises: 013_machine_sound_matching
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "014_chat_audio_analysis_link"
down_revision: Union[str, None] = "013_machine_sound_matching"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.add_column(sa.Column("audio_analysis_job_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.drop_column("audio_analysis_job_id")
