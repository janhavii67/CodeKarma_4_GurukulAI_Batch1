"""Add a reversible archive flag for knowledge hidden by machine deletion.

Revision ID: 020_archive_knowledge_on_machine_delete
Revises: 019_medical_machine_inventory
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "020_archive_knowledge_on_machine_delete"
down_revision: Union[str, None] = "019_medical_machine_inventory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_items",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("knowledge_items", "is_archived")
