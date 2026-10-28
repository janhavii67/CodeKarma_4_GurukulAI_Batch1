"""Add tags to standalone machine knowledge media."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005_machine_knowledge_media"
down_revision: Union[str, None] = "004_platform_expansion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("media_assets") as batch_op:
        batch_op.add_column(sa.Column("tags", sa.Text(), nullable=True))
        batch_op.alter_column("version_id", existing_type=sa.String(length=36), nullable=True)
        batch_op.drop_constraint("check_media_asset_kind", type_="check")
        batch_op.create_check_constraint(
            "check_media_asset_kind",
            "kind IN ('audio', 'video', 'image', 'document', 'notes')",
        )
    op.create_table(
        "procedure_media_assets",
        sa.Column("procedure_id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("procedure_id", "media_id"),
    )


def downgrade() -> None:
    op.drop_table("procedure_media_assets")
    with op.batch_alter_table("media_assets") as batch_op:
        batch_op.drop_constraint("check_media_asset_kind", type_="check")
        batch_op.create_check_constraint(
            "check_media_asset_kind",
            "kind IN ('audio', 'video', 'image', 'document')",
        )
        batch_op.alter_column("version_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.drop_column("tags")
