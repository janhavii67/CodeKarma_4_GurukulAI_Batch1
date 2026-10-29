"""merge_audio_and_inventory_heads

Revision ID: 9f968eeceadb
Revises: 018_audio_reference_enriched_metadata, 021_relax_legacy_processing_job_user_id
Create Date: 2026-10-29 18:12:00.915716+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f968eeceadb'
down_revision: Union[str, None] = ('018_audio_reference_enriched_metadata', '021_relax_legacy_processing_job_user_id')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
