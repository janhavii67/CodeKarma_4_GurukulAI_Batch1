"""Backfill machine IDs for legacy version-attached media."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_backfill_machine_media"
down_revision: Union[str, None] = "005_machine_knowledge_media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE media_assets SET machine_id = (SELECT machine_id FROM knowledge_versions "
        "WHERE knowledge_versions.id = media_assets.version_id) "
        "WHERE machine_id IS NULL AND version_id IS NOT NULL"
    ))


def downgrade() -> None:
    # Backfilled values are intentionally retained; clearing them could erase
    # explicit machine ownership added after the migration.
    pass
