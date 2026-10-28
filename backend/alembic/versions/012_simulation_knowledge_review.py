"""Link simulator revisions to the shared knowledge review lifecycle.

Revision ID: 012_simulation_knowledge_review
Revises: 011_simulation_scenario_title_index
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "012_simulation_knowledge_review"
down_revision: Union[str, None] = "011_simulation_scenario_title_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("simulation_scenario_revisions") as batch:
        batch.add_column(sa.Column("knowledge_version_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_simulation_revision_knowledge_version", "knowledge_versions", ["knowledge_version_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_simulation_scenario_revisions_knowledge_version_id", ["knowledge_version_id"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("simulation_scenario_revisions") as batch:
        batch.drop_index("ix_simulation_scenario_revisions_knowledge_version_id")
        batch.drop_constraint("fk_simulation_revision_knowledge_version", type_="foreignkey")
        batch.drop_column("knowledge_version_id")
