"""Add decision tree builder support: node canvas position and node media attachments.

Revision ID: 022_decision_tree_builder
Revises: 9f968eeceadb
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "022_decision_tree_builder"
down_revision: Union[str, None] = "9f968eeceadb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    # Add canvas position columns to troubleshooting_nodes
    existing_cols = {col["name"] for col in insp.get_columns("troubleshooting_nodes")}
    if "position_x" not in existing_cols:
        op.add_column("troubleshooting_nodes", sa.Column("position_x", sa.Float(), nullable=True))
    if "position_y" not in existing_cols:
        op.add_column("troubleshooting_nodes", sa.Column("position_y", sa.Float(), nullable=True))
    if "help_text" not in existing_cols:
        op.add_column("troubleshooting_nodes", sa.Column("help_text", sa.Text(), nullable=True))

    # Node ↔ MediaAsset join table
    if "decision_tree_node_media" not in tables:
        op.create_table(
            "decision_tree_node_media",
            sa.Column("node_id", sa.String(36), sa.ForeignKey("troubleshooting_nodes.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("media_id", sa.String(36), sa.ForeignKey("media_assets.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        )


def downgrade() -> None:
    op.drop_table("decision_tree_node_media")
    op.drop_column("troubleshooting_nodes", "help_text")
    op.drop_column("troubleshooting_nodes", "position_y")
    op.drop_column("troubleshooting_nodes", "position_x")
