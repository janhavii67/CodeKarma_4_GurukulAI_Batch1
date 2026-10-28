"""Revisioned deterministic failure simulator scenarios and sessions.

Revision ID: 010_failure_simulator
Revises: 009_troubleshooting_sessions
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "010_failure_simulator"
down_revision: Union[str, None] = "009_troubleshooting_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "simulation_scenario_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scenario_id", sa.String(36), sa.ForeignKey("simulation_scenarios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("source_refs", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_simulation_scenario_revisions_scenario_id", "simulation_scenario_revisions", ["scenario_id"])
    op.create_index("ix_simulation_scenario_revisions_status", "simulation_scenario_revisions", ["status"])
    op.create_index("ix_simulation_revision_scenario_status", "simulation_scenario_revisions", ["scenario_id", "status"])
    with op.batch_alter_table("simulation_attempts") as batch:
        batch.add_column(sa.Column("revision_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("current_decision_id", sa.String(100), nullable=True))
        batch.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("report_json", sa.JSON(), nullable=True))
        batch.create_foreign_key("fk_simulation_attempt_revision", "simulation_scenario_revisions", ["revision_id"], ["id"])
        batch.create_index("ix_simulation_attempts_revision_id", ["revision_id"])
        batch.alter_column("decisions_log_json", existing_type=sa.Text(), type_=sa.JSON(), nullable=False)
    op.create_table(
        "simulation_scenario_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("attempt_id", sa.String(36), sa.ForeignKey("simulation_attempts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_id", sa.String(36), sa.ForeignKey("simulation_scenario_revisions.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decision_id", sa.String(100), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_simulation_scenario_reports_attempt_id", "simulation_scenario_reports", ["attempt_id"])
    op.create_index("ix_simulation_scenario_reports_revision_id", "simulation_scenario_reports", ["revision_id"])
    op.create_index("ix_simulation_scenario_reports_user_id", "simulation_scenario_reports", ["user_id"])
    op.create_index("ix_simulation_scenario_reports_status", "simulation_scenario_reports", ["status"])
    op.execute("UPDATE simulation_attempts SET updated_at = started_at WHERE updated_at IS NULL")
    with op.batch_alter_table("simulation_attempts") as batch:
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    op.drop_index("ix_simulation_scenario_reports_status", table_name="simulation_scenario_reports")
    op.drop_index("ix_simulation_scenario_reports_user_id", table_name="simulation_scenario_reports")
    op.drop_index("ix_simulation_scenario_reports_revision_id", table_name="simulation_scenario_reports")
    op.drop_index("ix_simulation_scenario_reports_attempt_id", table_name="simulation_scenario_reports")
    op.drop_table("simulation_scenario_reports")
    with op.batch_alter_table("simulation_attempts") as batch:
        batch.alter_column("decisions_log_json", existing_type=sa.JSON(), type_=sa.Text(), nullable=False)
        batch.drop_column("report_json")
        batch.drop_column("updated_at")
        batch.drop_column("current_decision_id")
        batch.drop_index("ix_simulation_attempts_revision_id")
        batch.drop_constraint("fk_simulation_attempt_revision", type_="foreignkey")
        batch.drop_column("revision_id")
    op.drop_index("ix_simulation_revision_scenario_status", table_name="simulation_scenario_revisions")
    op.drop_index("ix_simulation_scenario_revisions_status", table_name="simulation_scenario_revisions")
    op.drop_index("ix_simulation_scenario_revisions_scenario_id", table_name="simulation_scenario_revisions")
    op.drop_table("simulation_scenario_revisions")
