"""Add private, user-managed learner memory for the AI Tutor.

Revision ID: 023_tutor_memory
Revises: 022_decision_tree_builder
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "023_tutor_memory"
down_revision: Union[str, None] = "022_decision_tree_builder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tutor_memories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tutor_memories_user_id"), "tutor_memories", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tutor_memories_user_id"), table_name="tutor_memories")
    op.drop_table("tutor_memories")
