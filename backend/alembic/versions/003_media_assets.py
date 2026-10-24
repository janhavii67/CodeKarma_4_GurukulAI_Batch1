"""003_media_assets

Revision ID: 003_media_assets
Revises: 002_knowledge
Create Date: 2026-10-24 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "003_media_assets"
down_revision: Union[str, None] = "002_knowledge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_media_assets_storage_key"),
        sa.CheckConstraint(
            "kind IN ('audio', 'video', 'image', 'document')",
            name="check_media_asset_kind",
        ),
        sa.CheckConstraint(
            "size_bytes > 0",
            name="check_media_asset_size_bytes_positive",
        ),
    )
    op.create_index("idx_media_assets_version_id", "media_assets", ["version_id"])
    op.create_index("idx_media_assets_uploaded_by", "media_assets", ["uploaded_by"])


def downgrade() -> None:
    op.drop_index("idx_media_assets_uploaded_by", table_name="media_assets")
    op.drop_index("idx_media_assets_version_id", table_name="media_assets")
    op.drop_table("media_assets")
