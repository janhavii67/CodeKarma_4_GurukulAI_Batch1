"""002_expanded_schema

Revision ID: 002_expanded_schema
Revises: 001_foundation
Create Date: 2026-10-24 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002_expanded_schema"
down_revision: Union[str, None] = "001_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. machine_categories
    op.create_table(
        "machine_categories",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # 2. machines
    op.create_table(
        "machines",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("model_number", sa.String(length=64), nullable=False),
        sa.Column("serial_number", sa.String(length=64), nullable=True),
        sa.Column("manufacturer", sa.String(length=128), nullable=True),
        sa.Column("category_id", sa.String(length=64), nullable=False),
        sa.Column("location", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"),
        sa.Column("specifications", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["machine_categories.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("serial_number"),
    )
    op.create_index(op.f("ix_machines_name"), "machines", ["name"], unique=False)
    op.create_index(op.f("ix_machines_model_number"), "machines", ["model_number"], unique=False)

    # 3. tools
    op.create_table(
        "tools",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("tool_number", sa.String(length=64), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("specifications", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tools_tool_number"), "tools", ["tool_number"], unique=False)

    # 4. knowledge_articles
    op.create_table(
        "knowledge_articles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="GENERAL"),
        sa.Column("tags", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledge_articles_title"), "knowledge_articles", ["title"], unique=False)
    op.create_index(op.f("ix_knowledge_articles_category"), "knowledge_articles", ["category"], unique=False)
    op.create_index(op.f("ix_knowledge_articles_status"), "knowledge_articles", ["status"], unique=False)

    # 5. knowledge_revisions
    op.create_table(
        "knowledge_revisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("operating_conditions", sa.Text(), nullable=True),
        sa.Column("prerequisites", sa.Text(), nullable=True),
        sa.Column("safety_warnings", sa.Text(), nullable=True),
        sa.Column("common_mistakes", sa.Text(), nullable=True),
        sa.Column("corrective_actions", sa.Text(), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["knowledge_articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 6. knowledge_attachments
    op.create_table(
        "knowledge_attachments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("file_name", sa.String(length=256), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["knowledge_articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 7. review_records
    op.create_table(
        "review_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("article_id", sa.String(length=36), nullable=False),
        sa.Column("revision_id", sa.String(length=36), nullable=True),
        sa.Column("reviewer_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["knowledge_articles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revision_id"], ["knowledge_revisions.id"]),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 8. procedures
    op.create_table(
        "procedures",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="APPROVED"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("prerequisites", sa.Text(), nullable=True),
        sa.Column("required_tools", sa.Text(), nullable=True),
        sa.Column("safety_warnings", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_procedures_title"), "procedures", ["title"], unique=False)
    op.create_index(op.f("ix_procedures_status"), "procedures", ["status"], unique=False)

    # 9. procedure_steps
    op.create_table(
        "procedure_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("procedure_id", sa.String(length=36), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("expected_observation", sa.Text(), nullable=True),
        sa.Column("safety_warning", sa.Text(), nullable=True),
        sa.Column("is_critical", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 10. procedure_runs
    op.create_table(
        "procedure_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("procedure_id", sa.String(length=36), nullable=False),
        sa.Column("operator_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="IN_PROGRESS"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 11. procedure_run_steps
    op.create_table(
        "procedure_run_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("step_id", sa.String(length=36), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("operator_notes", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["procedure_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["step_id"], ["procedure_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 12. troubleshooting_cases
    op.create_table(
        "troubleshooting_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("symptom", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False, server_default="MEDIUM"),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_troubleshooting_cases_title"), "troubleshooting_cases", ["title"], unique=False)

    # 13. troubleshooting_nodes
    op.create_table(
        "troubleshooting_nodes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("node_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("safety_warning", sa.Text(), nullable=True),
        sa.Column("is_root", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["case_id"], ["troubleshooting_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 14. troubleshooting_edges
    op.create_table(
        "troubleshooting_edges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("from_node_id", sa.String(length=36), nullable=False),
        sa.Column("to_node_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["troubleshooting_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_node_id"], ["troubleshooting_nodes.id"]),
        sa.ForeignKeyConstraint(["to_node_id"], ["troubleshooting_nodes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 15. audio_references
    op.create_table(
        "audio_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="22050"),
        sa.Column("fault_label", sa.String(length=128), nullable=False),
        sa.Column("is_expert_verified", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("operating_conditions", sa.Text(), nullable=True),
        sa.Column("features_json", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 16. audio_analysis_jobs
    op.create_table(
        "audio_analysis_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="QUEUED"),
        sa.Column("matched_reference_id", sa.String(length=36), nullable=True),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("reason_code", sa.String(length=64), nullable=False, server_default="PENDING"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("requires_expert_review", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("candidate_scores_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["matched_reference_id"], ["audio_references.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 17. simulation_scenarios
    op.create_table(
        "simulation_scenarios",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("difficulty", sa.String(length=32), nullable=False, server_default="INTERMEDIATE"),
        sa.Column("initial_state_json", sa.Text(), nullable=False),
        sa.Column("scenario_tree_json", sa.Text(), nullable=False),
        sa.Column("completion_criteria", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_simulation_scenarios_title"), "simulation_scenarios", ["title"], unique=False)

    # 18. simulation_attempts
    op.create_table(
        "simulation_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scenario_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="IN_PROGRESS"),
        sa.Column("decisions_log_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("safety_violations_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["scenario_id"], ["simulation_scenarios.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 19. learning_paths
    op.create_table(
        "learning_paths",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("target_role", sa.String(length=32), nullable=False, server_default="TRAINEE"),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_learning_paths_title"), "learning_paths", ["title"], unique=False)

    # 20. learning_items
    op.create_table(
        "learning_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("path_id", sa.String(length=36), nullable=False),
        sa.Column("item_type", sa.String(length=32), nullable=False),
        sa.Column("reference_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.ForeignKeyConstraint(["path_id"], ["learning_paths.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 21. learning_assignments
    op.create_table(
        "learning_assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("path_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ASSIGNED"),
        sa.Column("progress_percentage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["path_id"], ["learning_paths.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 22. notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=256), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("learning_assignments")
    op.drop_table("learning_items")
    op.drop_table("learning_paths")
    op.drop_table("simulation_attempts")
    op.drop_table("simulation_scenarios")
    op.drop_table("audio_analysis_jobs")
    op.drop_table("audio_references")
    op.drop_table("troubleshooting_edges")
    op.drop_table("troubleshooting_nodes")
    op.drop_table("troubleshooting_cases")
    op.drop_table("procedure_run_steps")
    op.drop_table("procedure_runs")
    op.drop_table("procedure_steps")
    op.drop_table("procedures")
    op.drop_table("review_records")
    op.drop_table("knowledge_attachments")
    op.drop_table("knowledge_revisions")
    op.drop_table("knowledge_articles")
    op.drop_table("tools")
    op.drop_table("machines")
    op.drop_table("machine_categories")
