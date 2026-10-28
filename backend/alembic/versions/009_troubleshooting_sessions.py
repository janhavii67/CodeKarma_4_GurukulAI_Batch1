"""Persist evidence-grounded troubleshooting sessions and workflow links.

Revision ID: 009_troubleshooting_sessions
Revises: 008_guided_workflow_publication
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "009_troubleshooting_sessions"
down_revision: Union[str, None] = "008_guided_workflow_publication"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "_alembic_tmp_troubleshooting_edges" in tables:
        op.drop_table("_alembic_tmp_troubleshooting_edges")
        tables.remove("_alembic_tmp_troubleshooting_edges")

    if "troubleshooting_sessions" not in tables:
        op.create_table(
            "troubleshooting_sessions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("guide_version_id", sa.String(length=36), nullable=True),
            sa.Column("machine_id", sa.String(length=36), nullable=True),
            sa.Column("process_id", sa.String(length=36), nullable=True),
            sa.Column("workflow_run_id", sa.String(length=36), nullable=True),
            sa.Column("workflow_issue_id", sa.String(length=36), nullable=True),
            sa.Column("problem_category", sa.String(length=64), nullable=True),
            sa.Column("reported_symptom", sa.Text(), nullable=False),
            sa.Column("current_node_id", sa.String(length=36), nullable=True),
            sa.Column("current_check_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("context", sa.JSON(), nullable=True),
            sa.Column("checks_snapshot", sa.JSON(), nullable=True),
            sa.Column("source_refs", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="in_progress"),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["current_node_id"], ["troubleshooting_nodes.id"]),
            sa.ForeignKeyConstraint(["guide_version_id"], ["troubleshooting_versions.id"]),
            sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["process_id"], ["manufacturing_processes.id"]),
            sa.ForeignKeyConstraint(["workflow_run_id"], ["procedure_runs.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_troubleshooting_sessions_guide_version_id"), "troubleshooting_sessions", ["guide_version_id"], unique=False)
        op.create_index(op.f("ix_troubleshooting_sessions_machine_id"), "troubleshooting_sessions", ["machine_id"], unique=False)
        op.create_index(op.f("ix_troubleshooting_sessions_status"), "troubleshooting_sessions", ["status"], unique=False)
        op.create_index(op.f("ix_troubleshooting_sessions_user_id"), "troubleshooting_sessions", ["user_id"], unique=False)
        op.create_index("ix_troubleshooting_sessions_process_id", "troubleshooting_sessions", ["process_id"], unique=False)
        op.create_index("ix_troubleshooting_sessions_workflow_run_id", "troubleshooting_sessions", ["workflow_run_id"], unique=False)
        op.create_index("ix_troubleshooting_sessions_workflow_issue_id", "troubleshooting_sessions", ["workflow_issue_id"], unique=False)
        op.create_index("ix_troubleshooting_sessions_problem_category", "troubleshooting_sessions", ["problem_category"], unique=False)
    else:
        with op.batch_alter_table("troubleshooting_sessions") as batch_op:
            batch_op.alter_column("guide_version_id", existing_type=sa.String(length=36), nullable=True)
            batch_op.add_column(sa.Column("process_id", sa.String(length=36), nullable=True))
            batch_op.add_column(sa.Column("workflow_run_id", sa.String(length=36), nullable=True))
            batch_op.add_column(sa.Column("workflow_issue_id", sa.String(length=36), nullable=True))
            batch_op.add_column(sa.Column("problem_category", sa.String(length=64), nullable=True))
            batch_op.add_column(sa.Column("current_check_index", sa.Integer(), nullable=False, server_default="0"))
            batch_op.add_column(sa.Column("context", sa.JSON(), nullable=True))
            batch_op.add_column(sa.Column("checks_snapshot", sa.JSON(), nullable=True))
            batch_op.add_column(sa.Column("source_refs", sa.JSON(), nullable=True))
            batch_op.create_foreign_key("fk_troubleshooting_sessions_process", "manufacturing_processes", ["process_id"], ["id"])
            batch_op.create_foreign_key("fk_troubleshooting_sessions_workflow_run", "procedure_runs", ["workflow_run_id"], ["id"], ondelete="SET NULL")
            batch_op.create_index("ix_troubleshooting_sessions_process_id", ["process_id"])
            batch_op.create_index("ix_troubleshooting_sessions_workflow_run_id", ["workflow_run_id"])
            batch_op.create_index("ix_troubleshooting_sessions_workflow_issue_id", ["workflow_issue_id"])
            batch_op.create_index("ix_troubleshooting_sessions_problem_category", ["problem_category"])

    if "troubleshooting_responses" not in tables:
        op.create_table(
            "troubleshooting_responses",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=False),
            sa.Column("node_id", sa.String(length=36), nullable=True),
            sa.Column("check_index", sa.Integer(), nullable=True),
            sa.Column("outcome", sa.String(length=32), nullable=True),
            sa.Column("answer", sa.Text(), nullable=False),
            sa.Column("server_timestamp", sa.DateTime(timezone=True), nullable=False),
            sa.Column("edge_taken_id", sa.String(length=36), nullable=True),
            sa.ForeignKeyConstraint(["edge_taken_id"], ["troubleshooting_edges.id"]),
            sa.ForeignKeyConstraint(["node_id"], ["troubleshooting_nodes.id"]),
            sa.ForeignKeyConstraint(["session_id"], ["troubleshooting_sessions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_troubleshooting_responses_node_id"), "troubleshooting_responses", ["node_id"], unique=False)
        op.create_index(op.f("ix_troubleshooting_responses_session_id"), "troubleshooting_responses", ["session_id"], unique=False)
    else:
        with op.batch_alter_table("troubleshooting_responses") as batch_op:
            batch_op.alter_column("node_id", existing_type=sa.String(length=36), nullable=True)
            batch_op.add_column(sa.Column("check_index", sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column("outcome", sa.String(length=32), nullable=True))

    if "troubleshooting_evidence" not in tables:
        op.create_table(
            "troubleshooting_evidence",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=False),
            sa.Column("media_asset_id", sa.String(length=36), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["media_asset_id"], ["media_assets.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["session_id"], ["troubleshooting_sessions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_troubleshooting_evidence_media_asset_id"), "troubleshooting_evidence", ["media_asset_id"], unique=False)
        op.create_index(op.f("ix_troubleshooting_evidence_session_id"), "troubleshooting_evidence", ["session_id"], unique=False)

    if "troubleshooting_escalations" not in tables:
        op.create_table(
            "troubleshooting_escalations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("assigned_expert_id", sa.String(length=36), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["assigned_expert_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["session_id"], ["troubleshooting_sessions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("session_id"),
        )
        op.create_index(op.f("ix_troubleshooting_escalations_assigned_expert_id"), "troubleshooting_escalations", ["assigned_expert_id"], unique=False)
        op.create_index(op.f("ix_troubleshooting_escalations_session_id"), "troubleshooting_escalations", ["session_id"], unique=True)
        op.create_index(op.f("ix_troubleshooting_escalations_status"), "troubleshooting_escalations", ["status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "troubleshooting_escalations" in tables:
        op.drop_table("troubleshooting_escalations")
    if "troubleshooting_evidence" in tables:
        op.drop_table("troubleshooting_evidence")
    if "troubleshooting_responses" in tables:
        op.drop_table("troubleshooting_responses")
    if "troubleshooting_sessions" in tables:
        op.drop_table("troubleshooting_sessions")
