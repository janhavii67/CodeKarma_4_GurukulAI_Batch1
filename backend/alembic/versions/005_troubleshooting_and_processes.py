"""005_troubleshooting_and_processes

Revision ID: 005_troubleshooting_and_processes
Revises: 004_platform_expansion
Create Date: 2026-10-25 22:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005_troubleshooting_and_processes"
down_revision: Union[str, None] = "004_platform_expansion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. manufacturing_processes
    op.create_table(
        "manufacturing_processes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_manufacturing_processes_code"), "manufacturing_processes", ["code"], unique=True)
    op.create_index(op.f("ix_manufacturing_processes_name"), "manufacturing_processes", ["name"], unique=False)

    # 2. troubleshooting_guides
    op.create_table(
        "troubleshooting_guides",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("problem_category", sa.String(length=64), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("process_id", sa.String(length=36), nullable=True),
        sa.Column("product_family", sa.String(length=128), nullable=True),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False, server_default="MEDIUM"),
        sa.Column("current_published_version_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["process_id"], ["manufacturing_processes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_troubleshooting_guides_current_published_version_id"), "troubleshooting_guides", ["current_published_version_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_machine_id"), "troubleshooting_guides", ["machine_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_owner_id"), "troubleshooting_guides", ["owner_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_problem_category"), "troubleshooting_guides", ["problem_category"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_process_id"), "troubleshooting_guides", ["process_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_product_family"), "troubleshooting_guides", ["product_family"], unique=False)
    op.create_index(op.f("ix_troubleshooting_guides_title"), "troubleshooting_guides", ["title"], unique=False)

    # 3. troubleshooting_versions
    op.create_table(
        "troubleshooting_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("guide_id", sa.String(length=36), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("revision_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["guide_id"], ["troubleshooting_guides.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("guide_id", "version_number", name="uq_troubleshooting_guide_version"),
    )
    op.create_index(op.f("ix_troubleshooting_versions_guide_id"), "troubleshooting_versions", ["guide_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_versions_status"), "troubleshooting_versions", ["status"], unique=False)

    # 4. Update troubleshooting_nodes (add version_id and node attributes)
    with op.batch_alter_table("troubleshooting_nodes") as batch_op:
        batch_op.add_column(sa.Column("version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("instructions", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("safety_notice", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("expected_observation", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("input_type", sa.String(length=32), nullable=False, server_default="choice"))
        batch_op.add_column(sa.Column("input_rules", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("cause_status", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("source_reference", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("linked_knowledge_version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("linked_workflow_version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("is_start", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("outcome", sa.String(length=32), nullable=True))
        batch_op.alter_column("case_id", existing_type=sa.String(length=36), nullable=True)
        batch_op.create_foreign_key("fk_troubleshooting_nodes_version_id", "troubleshooting_versions", ["version_id"], ["id"], ondelete="CASCADE")
        batch_op.create_foreign_key("fk_troubleshooting_nodes_knowledge_version_id", "knowledge_versions", ["linked_knowledge_version_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index(op.f("ix_troubleshooting_nodes_version_id"), ["version_id"], unique=False)
        batch_op.create_index(op.f("ix_troubleshooting_nodes_is_start"), ["is_start"], unique=False)

    # 5. Update troubleshooting_edges (add version_id and condition)
    with op.batch_alter_table("troubleshooting_edges") as batch_op:
        batch_op.add_column(sa.Column("version_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("condition", sa.Text(), nullable=True))
        batch_op.alter_column("case_id", existing_type=sa.String(length=36), nullable=True)
        batch_op.create_foreign_key("fk_troubleshooting_edges_version_id", "troubleshooting_versions", ["version_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(op.f("ix_troubleshooting_edges_version_id"), ["version_id"], unique=False)

    # 6. troubleshooting_sessions
    op.create_table(
        "troubleshooting_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("guide_version_id", sa.String(length=36), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("reported_symptom", sa.Text(), nullable=False),
        sa.Column("current_node_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="in_progress"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["current_node_id"], ["troubleshooting_nodes.id"]),
        sa.ForeignKeyConstraint(["guide_version_id"], ["troubleshooting_versions.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_troubleshooting_sessions_guide_version_id"), "troubleshooting_sessions", ["guide_version_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_sessions_machine_id"), "troubleshooting_sessions", ["machine_id"], unique=False)
    op.create_index(op.f("ix_troubleshooting_sessions_status"), "troubleshooting_sessions", ["status"], unique=False)
    op.create_index(op.f("ix_troubleshooting_sessions_user_id"), "troubleshooting_sessions", ["user_id"], unique=False)

    # 7. troubleshooting_responses
    op.create_table(
        "troubleshooting_responses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("node_id", sa.String(length=36), nullable=False),
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

    # 8. troubleshooting_evidence
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

    # 9. troubleshooting_escalations
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
    op.drop_table("troubleshooting_escalations")
    op.drop_table("troubleshooting_evidence")
    op.drop_table("troubleshooting_responses")
    op.drop_table("troubleshooting_sessions")

    with op.batch_alter_table("troubleshooting_edges") as batch_op:
        batch_op.drop_index(op.f("ix_troubleshooting_edges_version_id"))
        batch_op.drop_constraint("fk_troubleshooting_edges_version_id", type_="foreignkey")
        batch_op.drop_column("condition")
        batch_op.drop_column("version_id")

    with op.batch_alter_table("troubleshooting_nodes") as batch_op:
        batch_op.drop_index(op.f("ix_troubleshooting_nodes_is_start"))
        batch_op.drop_index(op.f("ix_troubleshooting_nodes_version_id"))
        batch_op.drop_constraint("fk_troubleshooting_nodes_knowledge_version_id", type_="foreignkey")
        batch_op.drop_constraint("fk_troubleshooting_nodes_version_id", type_="foreignkey")
        batch_op.drop_column("outcome")
        batch_op.drop_column("is_start")
        batch_op.drop_column("linked_workflow_version_id")
        batch_op.drop_column("linked_knowledge_version_id")
        batch_op.drop_column("source_reference")
        batch_op.drop_column("cause_status")
        batch_op.drop_column("input_rules")
        batch_op.drop_column("input_type")
        batch_op.drop_column("expected_observation")
        batch_op.drop_column("safety_notice")
        batch_op.drop_column("instructions")
        batch_op.drop_column("version_id")

    op.drop_table("troubleshooting_versions")
    op.drop_table("troubleshooting_guides")
    op.drop_table("manufacturing_processes")
