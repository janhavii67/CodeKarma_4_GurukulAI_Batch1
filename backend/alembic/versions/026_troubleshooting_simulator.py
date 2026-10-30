"""Troubleshooting simulator: mission settings on trees, trainee attempts and achievements.

Trees gain a ``simulation`` JSON column (briefing, objective, XP, skills, availability).
Scenario truth lives on the existing graph: answer outcomes in ``troubleshooting_edges.condition``
and clues/readings/zones in ``troubleshooting_nodes.details`` — no separate trainee copy of the tree.

Revision ID: 026_troubleshooting_simulator
Revises: 025_decision_tree_engine
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "026_troubleshooting_simulator"
down_revision: Union[str, None] = "025_decision_tree_engine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "simulation" not in {c["name"] for c in insp.get_columns("troubleshooting_guides")}:
        op.add_column("troubleshooting_guides", sa.Column("simulation", sa.JSON(), nullable=True))
    tables = set(insp.get_table_names())
    if "mission_attempts" not in tables:
        op.create_table(
            "mission_attempts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("guide_id", sa.String(36), sa.ForeignKey("troubleshooting_guides.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("troubleshooting_versions.id"), nullable=False, index=True),
            sa.Column("status", sa.String(16), nullable=False, index=True),
            sa.Column("stage", sa.String(16), nullable=False),
            sa.Column("current_node_id", sa.String(36), nullable=True),
            sa.Column("state", sa.JSON(), nullable=True),
            sa.Column("score", sa.JSON(), nullable=True),
            sa.Column("total_score", sa.Integer(), nullable=True),
            sa.Column("xp_awarded", sa.Integer(), server_default="0", nullable=False),
            sa.Column("active_seconds", sa.Integer(), server_default="0", nullable=False),
            sa.Column("resumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "mission_achievements" not in tables:
        op.create_table(
            "mission_achievements",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("code", sa.String(48), nullable=False),
            sa.Column("attempt_id", sa.String(36), sa.ForeignKey("mission_attempts.id", ondelete="SET NULL"), nullable=True),
            sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("user_id", "code", name="uq_mission_achievement_user_code"),
        )


def downgrade() -> None:
    op.drop_table("mission_achievements")
    op.drop_table("mission_attempts")
    op.drop_column("troubleshooting_guides", "simulation")
