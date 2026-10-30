"""Decision tree engine: tree metadata, typed node details, answer ordering, AI draft log.

- troubleshooting_guides: description, difficulty, tags, cover image, estimate, archive flag.
- troubleshooting_nodes: ``details`` JSON for type-specific fields and ``origin``
  (expert / ai_draft / ai_reviewed) so AI-drafted steps must be reviewed before publishing.
- troubleshooting_edges: answers are ordered (``sort_order``) and may exist before the
  expert picks a destination, so ``to_node_id`` becomes nullable. Validation blocks
  submission while any answer has no destination.
- decision_tree_ai_drafts: audit of every AI generation / review request.

Revision ID: 025_decision_tree_engine
Revises: 024_audio_observation_and_reference_quarantine
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "025_decision_tree_engine"
down_revision: Union[str, None] = "024_audio_observation_and_reference_quarantine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(insp, table: str) -> dict:
    return {col["name"]: col for col in insp.get_columns(table)}


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())

    guide_cols = _columns(insp, "troubleshooting_guides")
    for name, column in (
        ("description", sa.Column("description", sa.Text(), nullable=True)),
        ("difficulty", sa.Column("difficulty", sa.String(16), server_default="INTERMEDIATE", nullable=False)),
        ("tags", sa.Column("tags", sa.Text(), nullable=True)),
        ("cover_media_id", sa.Column("cover_media_id", sa.String(36), nullable=True)),
        ("estimated_minutes", sa.Column("estimated_minutes", sa.Integer(), nullable=True)),
        ("is_archived", sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False)),
    ):
        if name not in guide_cols:
            op.add_column("troubleshooting_guides", column)

    node_cols = _columns(insp, "troubleshooting_nodes")
    if "details" not in node_cols:
        op.add_column("troubleshooting_nodes", sa.Column("details", sa.JSON(), nullable=True))
    if "origin" not in node_cols:
        op.add_column("troubleshooting_nodes", sa.Column("origin", sa.String(16), server_default="expert", nullable=False))

    edge_cols = _columns(insp, "troubleshooting_edges")
    with op.batch_alter_table("troubleshooting_edges") as batch:
        if "sort_order" not in edge_cols:
            batch.add_column(sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False))
        if not edge_cols["to_node_id"]["nullable"]:
            batch.alter_column("to_node_id", existing_type=sa.String(36), nullable=True)

    if "decision_tree_ai_drafts" not in insp.get_table_names():
        op.create_table(
            "decision_tree_ai_drafts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("guide_id", sa.String(36), sa.ForeignKey("troubleshooting_guides.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("troubleshooting_versions.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("requested_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("prompt", sa.Text(), nullable=True),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("provider", sa.String(64), nullable=True),
            sa.Column("model", sa.String(128), nullable=True),
            sa.Column("source_refs", sa.JSON(), nullable=True),
            sa.Column("result", sa.JSON(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("decision_tree_ai_drafts")
    op.execute("DELETE FROM troubleshooting_edges WHERE to_node_id IS NULL")
    with op.batch_alter_table("troubleshooting_edges") as batch:
        batch.alter_column("to_node_id", existing_type=sa.String(36), nullable=False)
        batch.drop_column("sort_order")
    op.drop_column("troubleshooting_nodes", "origin")
    op.drop_column("troubleshooting_nodes", "details")
    for name in ("is_archived", "estimated_minutes", "cover_media_id", "tags", "difficulty", "description"):
        op.drop_column("troubleshooting_guides", name)
