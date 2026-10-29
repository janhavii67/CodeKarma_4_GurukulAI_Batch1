"""Persist user-scoped Tutor attachment references on chat turns.

Revision ID: 017_tutor_attachment_continuity
Revises: 016_merge_frontend_redesign_branches
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "017_tutor_attachment_continuity"
down_revision: Union[str, None] = "016_merge_frontend_redesign_branches"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.add_column(sa.Column("attachment_media_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key(
            "fk_chat_messages_attachment_media_id_media_assets",
            "media_assets",
            ["attachment_media_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_chat_messages_attachment_media_id", ["attachment_media_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.drop_index("ix_chat_messages_attachment_media_id")
        batch.drop_constraint("fk_chat_messages_attachment_media_id_media_assets", type_="foreignkey")
        batch.drop_column("attachment_media_id")
