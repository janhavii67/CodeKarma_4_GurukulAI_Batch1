"""Guided workflows linked to approved knowledge revisions and run progress.

Revision ID: 008_guided_workflow_publication
Revises: 007_assistant_rag
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008_guided_workflow_publication"
down_revision: Union[str, None] = "007_assistant_rag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("knowledge_versions", sa.Column("source_refs", sa.JSON(), nullable=True))
    with op.batch_alter_table("procedures") as batch_op:
        batch_op.add_column(sa.Column("knowledge_version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("source_refs", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("operating_conditions", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("operation", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("troubleshooting_guidance", sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            "fk_procedures_knowledge_version_id",
            "knowledge_versions",
            ["knowledge_version_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_procedures_knowledge_version_id", ["knowledge_version_id"], unique=True)
    op.add_column("procedure_steps", sa.Column("details", sa.JSON(), nullable=True))
    op.add_column("procedure_runs", sa.Column("current_step_order", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("procedure_runs", sa.Column("issues", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("procedure_runs", "issues")
    op.drop_column("procedure_runs", "current_step_order")
    op.drop_column("procedure_steps", "details")
    with op.batch_alter_table("procedures") as batch_op:
        batch_op.drop_index("ix_procedures_knowledge_version_id")
        batch_op.drop_constraint("fk_procedures_knowledge_version_id", type_="foreignkey")
        batch_op.drop_column("source_refs")
        batch_op.drop_column("operating_conditions")
        batch_op.drop_column("operation")
        batch_op.drop_column("troubleshooting_guidance")
        batch_op.drop_column("knowledge_version_id")
    op.drop_column("knowledge_versions", "source_refs")
