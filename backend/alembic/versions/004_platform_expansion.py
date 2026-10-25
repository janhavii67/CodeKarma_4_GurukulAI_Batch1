"""004_platform_expansion

Revision ID: 004_platform_expansion
Revises: 003_media_assets
Create Date: 2026-10-25 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "004_platform_expansion"
down_revision: Union[str, None] = "003_media_assets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # 1. machine_categories
    op.create_table(
        "machine_categories",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # 2. Add columns to machines
    with op.batch_alter_table("machines") as batch_op:
        batch_op.add_column(sa.Column("model_number", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("serial_number", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("manufacturer", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("category_id", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("location", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"))
        batch_op.add_column(sa.Column("specifications", sa.Text(), nullable=True))

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

    # 4. Add columns to knowledge_items
    with op.batch_alter_table("knowledge_items") as batch_op:
        batch_op.add_column(sa.Column("category", sa.String(length=64), nullable=False, server_default="GENERAL"))
        batch_op.add_column(sa.Column("tags", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"))
        batch_op.add_column(sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"))

    # 5. Add columns to knowledge_versions
    with op.batch_alter_table("knowledge_versions") as batch_op:
        batch_op.add_column(sa.Column("article_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("title", sa.String(length=256), nullable=True))
        batch_op.add_column(sa.Column("machine_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("content", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("operating_conditions", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("prerequisites", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("safety_warnings", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("common_mistakes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("corrective_actions", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("changelog", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("author_id", sa.String(length=36), nullable=True))

    # Populate title & machine_id from knowledge_items for existing records
    bind.execute(text("UPDATE knowledge_versions SET title = (SELECT title FROM knowledge_items WHERE knowledge_items.id = knowledge_versions.item_id) WHERE title IS NULL"))
    bind.execute(text("UPDATE knowledge_versions SET machine_id = (SELECT machine_id FROM knowledge_items WHERE knowledge_items.id = knowledge_versions.item_id) WHERE machine_id IS NULL"))

    # 6. Add columns to media_assets
    with op.batch_alter_table("media_assets") as batch_op:
        batch_op.add_column(sa.Column("title", sa.String(length=256), nullable=False, server_default="Untitled Media"))
        batch_op.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("machine_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("duration_seconds", sa.Float(), nullable=True))

    # 7. knowledge_attachments
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
        sa.ForeignKeyConstraint(["article_id"], ["knowledge_items.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 8. approval_records
    op.create_table(
        "approval_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("item_id", sa.String(length=36), nullable=True),
        sa.Column("article_id", sa.String(length=36), nullable=True),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("revision_id", sa.String(length=36), nullable=True),
        sa.Column("reviewer_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("decision IN ('approved', 'changes_requested', 'rejected', 'withdrawn')", name="ck_approval_decision"),
        sa.CheckConstraint("decision = 'approved' OR length(trim(coalesce(comment, ''))) > 0", name="ck_approval_comment_required"),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["item_id"], ["knowledge_items.id"]),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 9. review_comments
    op.create_table(
        "review_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(trim(body)) BETWEEN 1 AND 4000", name="ck_review_comment_body"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 10. procedures & steps & runs
    op.create_table(
        "procedures",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
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

    op.create_table(
        "procedure_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("procedure_id", sa.String(length=36), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("expected_observation", sa.Text(), nullable=True),
        sa.Column("safety_warning", sa.Text(), nullable=True),
        sa.Column("is_critical", sa.Boolean(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "procedure_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("procedure_id", sa.String(length=36), nullable=False),
        sa.Column("operator_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="IN_PROGRESS"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["operator_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "procedure_run_steps",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("step_id", sa.String(length=36), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("operator_notes", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["procedure_runs.id"]),
        sa.ForeignKeyConstraint(["step_id"], ["procedure_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 11. troubleshooting
    op.create_table(
        "troubleshooting_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("symptom", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False, server_default="MEDIUM"),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "troubleshooting_nodes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("node_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("safety_warning", sa.Text(), nullable=True),
        sa.Column("is_root", sa.Boolean(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["case_id"], ["troubleshooting_cases.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "troubleshooting_edges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("from_node_id", sa.String(length=36), nullable=False),
        sa.Column("to_node_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["troubleshooting_cases.id"]),
        sa.ForeignKeyConstraint(["from_node_id"], ["troubleshooting_nodes.id"]),
        sa.ForeignKeyConstraint(["to_node_id"], ["troubleshooting_nodes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 12. audio references & jobs
    op.create_table(
        "audio_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="22050"),
        sa.Column("fault_label", sa.String(length=128), nullable=False),
        sa.Column("is_expert_verified", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("operating_conditions", sa.Text(), nullable=True),
        sa.Column("features_json", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

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
        sa.Column("requires_expert_review", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("candidate_scores_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["matched_reference_id"], ["audio_references.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 13. simulation scenarios
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

    # 14. learning curriculum
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

    op.create_table(
        "learning_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("path_id", sa.String(length=36), nullable=False),
        sa.Column("item_type", sa.String(length=32), nullable=False),
        sa.Column("reference_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.ForeignKeyConstraint(["path_id"], ["learning_paths.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

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

    # 15. notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=256), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # 16. processing_jobs
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("stage", sa.String(length=64), nullable=True),
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("result_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_processing_jobs_media_id"), "processing_jobs", ["media_id"], unique=False)
    op.create_index(op.f("ix_processing_jobs_status"), "processing_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_processing_jobs_user_id"), "processing_jobs", ["user_id"], unique=False)

    # 17. transcripts & segments
    op.create_table(
        "transcripts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="en"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["media_id"], ["media_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcripts_media_id"), "transcripts", ["media_id"], unique=False)

    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("transcript_id", sa.String(length=36), nullable=False),
        sa.Column("segment_order", sa.Integer(), nullable=False),
        sa.Column("start_time_seconds", sa.Float(), nullable=False),
        sa.Column("end_time_seconds", sa.Float(), nullable=False),
        sa.Column("speaker_label", sa.String(length=64), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcript_segments_transcript_id"), "transcript_segments", ["transcript_id"], unique=False)

    # 18. knowledge_embeddings
    op.create_table(
        "knowledge_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("knowledge_item_id", sa.String(length=36), nullable=True),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_type", sa.String(length=32), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("embedding_vector", sa.JSON(), nullable=False),
        sa.Column("embedding_dim", sa.Integer(), nullable=False),
        sa.Column("model_name", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["knowledge_item_id"], ["knowledge_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledge_embeddings_item_id"), "knowledge_embeddings", ["knowledge_item_id"], unique=False)
    op.create_index(op.f("ix_knowledge_embeddings_version_id"), "knowledge_embeddings", ["version_id"], unique=False)

    # 19. Governance partial unique indexes
    op.create_index(
        "uq_versions_one_published_per_item",
        "knowledge_versions",
        ["item_id"],
        unique=True,
        sqlite_where=text("status = 'published'"),
        postgresql_where=text("status = 'published'"),
    )

    op.create_index(
        "uq_versions_one_open_per_item",
        "knowledge_versions",
        ["item_id"],
        unique=True,
        sqlite_where=text("status IN ('draft', 'changes_requested', 'in_review')"),
        postgresql_where=text("status IN ('draft', 'changes_requested', 'in_review')"),
    )

    # Triggers for SQLite
    if dialect_name == "sqlite":
        bind.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_versions_freeze_content
            BEFORE UPDATE ON knowledge_versions
            FOR EACH ROW
            WHEN OLD.status NOT IN ('draft', 'changes_requested') AND (
                NEW.title != OLD.title OR (NEW.title IS NULL AND OLD.title IS NOT NULL) OR (NEW.title IS NOT NULL AND OLD.title IS NULL) OR
                NEW.machine_id != OLD.machine_id OR (NEW.machine_id IS NULL AND OLD.machine_id IS NOT NULL) OR (NEW.machine_id IS NOT NULL AND OLD.machine_id IS NULL) OR
                NEW.summary != OLD.summary OR (NEW.summary IS NULL AND OLD.summary IS NOT NULL) OR (NEW.summary IS NOT NULL AND OLD.summary IS NULL) OR
                NEW.steps != OLD.steps OR (NEW.steps IS NULL AND OLD.steps IS NOT NULL) OR (NEW.steps IS NOT NULL AND OLD.steps IS NULL) OR
                NEW.item_id != OLD.item_id OR
                NEW.version_no != OLD.version_no OR
                NEW.created_by != OLD.created_by
            )
            BEGIN
                SELECT RAISE(ABORT, 'version content is frozen');
            END;
        """))

        bind.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_approval_records_no_update
            BEFORE UPDATE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
        bind.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_approval_records_no_delete
            BEFORE DELETE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
        bind.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_review_comments_no_update
            BEFORE UPDATE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
        bind.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_review_comments_no_delete
            BEFORE DELETE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))


def downgrade() -> None:
    pass
