"""Allow current processing job inserts to omit the legacy user_id column.

Revision ID: 021_relax_legacy_processing_job_user_id
Revises: 020_archive_knowledge_on_machine_delete
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "021_relax_legacy_processing_job_user_id"
down_revision: Union[str, None] = "020_archive_knowledge_on_machine_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> dict[str, dict]:
    return {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns("processing_jobs")}


def upgrade() -> None:
    columns = _columns()
    legacy_user_id = columns.get("user_id")
    if legacy_user_id and not legacy_user_id["nullable"]:
        # The current ORM persists created_by. Older installations still have
        # a required user_id column that is no longer mapped as a DB column.
        # Keep legacy values but allow new ORM inserts to omit that column.
        with op.batch_alter_table("processing_jobs") as batch:
            batch.alter_column("user_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    columns = _columns()
    legacy_user_id = columns.get("user_id")
    if legacy_user_id and legacy_user_id["nullable"]:
        if "created_by" in columns:
            op.execute(sa.text("UPDATE processing_jobs SET user_id = created_by WHERE user_id IS NULL"))
        with op.batch_alter_table("processing_jobs") as batch:
            batch.alter_column("user_id", existing_type=sa.String(36), nullable=False)
