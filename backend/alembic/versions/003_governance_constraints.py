"""003_governance_constraints

Revision ID: 003_governance_constraints
Revises: 002_expanded_schema
Create Date: 2026-10-24 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003_governance_constraints"
down_revision: Union[str, None] = "002_expanded_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # 1. Rename tables to canonical governance names if existing
    # knowledge_articles -> knowledge_items
    # knowledge_revisions -> knowledge_versions
    # review_records -> approval_records
    op.rename_table("knowledge_articles", "knowledge_items")
    op.rename_table("knowledge_revisions", "knowledge_versions")
    op.rename_table("review_records", "approval_records")

    # 2. Add canonical columns to knowledge_versions
    op.add_column("knowledge_versions", sa.Column("item_id", sa.String(length=36), nullable=True))
    op.add_column("knowledge_versions", sa.Column("version_no", sa.Integer(), nullable=True))
    op.add_column("knowledge_versions", sa.Column("machine_id", sa.String(length=36), nullable=True))
    op.add_column("knowledge_versions", sa.Column("status", sa.String(length=32), nullable=True, server_default="draft"))
    op.add_column("knowledge_versions", sa.Column("origin", sa.String(length=32), nullable=True, server_default="expert"))
    op.add_column("knowledge_versions", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("knowledge_versions", sa.Column("steps", sa.Text(), nullable=True))
    op.add_column("knowledge_versions", sa.Column("created_by", sa.String(length=36), nullable=True))
    op.add_column("knowledge_versions", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("knowledge_versions", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("knowledge_versions", sa.Column("revision_reason", sa.Text(), nullable=True))

    # Add canonical column to knowledge_items
    op.add_column("knowledge_items", sa.Column("current_published_version_id", sa.String(length=36), nullable=True))

    # Add canonical columns to approval_records
    op.add_column("approval_records", sa.Column("item_id", sa.String(length=36), nullable=True))
    op.add_column("approval_records", sa.Column("version_id", sa.String(length=36), nullable=True))
    op.add_column("approval_records", sa.Column("decision", sa.String(length=32), nullable=True))
    op.add_column("approval_records", sa.Column("comment", sa.Text(), nullable=True))


    # 3. Create review_comments table
    op.create_table(
        "review_comments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["version_id"], ["knowledge_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_review_comments_version_id"), "review_comments", ["version_id"], unique=False)

    # 4. Data Backfill
    # Sync item_id from article_id, version_no from version, created_by from author_id, revision_reason from changelog
    op.execute("UPDATE knowledge_versions SET item_id = article_id WHERE item_id IS NULL AND article_id IS NOT NULL")
    op.execute("UPDATE knowledge_versions SET version_no = version WHERE version_no IS NULL AND version IS NOT NULL")
    op.execute("UPDATE knowledge_versions SET created_by = author_id WHERE created_by IS NULL AND author_id IS NOT NULL")
    op.execute("UPDATE knowledge_versions SET summary = content WHERE summary IS NULL AND content IS NOT NULL")
    op.execute("UPDATE knowledge_versions SET steps = content WHERE steps IS NULL AND content IS NOT NULL")
    op.execute("UPDATE knowledge_versions SET revision_reason = changelog WHERE revision_reason IS NULL AND changelog IS NOT NULL")

    # Backfill title and machine_id from knowledge_items
    op.execute("""
        UPDATE knowledge_versions
        SET machine_id = (SELECT machine_id FROM knowledge_items WHERE knowledge_items.id = knowledge_versions.item_id)
        WHERE machine_id IS NULL
    """)

    # Backfill status based on knowledge_items.status
    op.execute("""
        UPDATE knowledge_versions
        SET status = 'published', published_at = CURRENT_TIMESTAMP
        WHERE status IS NULL OR status = 'draft' AND EXISTS (
            SELECT 1 FROM knowledge_items WHERE knowledge_items.id = knowledge_versions.item_id AND knowledge_items.status = 'APPROVED'
        )
    """)
    op.execute("""
        UPDATE knowledge_versions
        SET status = 'in_review', submitted_at = CURRENT_TIMESTAMP
        WHERE status IS NULL OR status = 'draft' AND EXISTS (
            SELECT 1 FROM knowledge_items WHERE knowledge_items.id = knowledge_versions.item_id AND knowledge_items.status = 'PENDING_REVIEW'
        )
    """)
    op.execute("UPDATE knowledge_versions SET status = 'draft' WHERE status IS NULL")
    op.execute("UPDATE knowledge_versions SET origin = 'expert' WHERE origin IS NULL")

    # Backfill knowledge_items.current_published_version_id
    op.execute("""
        UPDATE knowledge_items
        SET current_published_version_id = (
            SELECT id FROM knowledge_versions
            WHERE knowledge_versions.item_id = knowledge_items.id AND knowledge_versions.status = 'published'
            ORDER BY version_no DESC LIMIT 1
        )
        WHERE current_published_version_id IS NULL
    """)

    # Backfill approval_records item_id, version_id, decision and comment
    op.execute("UPDATE approval_records SET item_id = article_id WHERE item_id IS NULL AND article_id IS NOT NULL")
    op.execute("UPDATE approval_records SET version_id = revision_id WHERE version_id IS NULL AND revision_id IS NOT NULL")
    op.execute("""
        UPDATE approval_records
        SET decision = LOWER(status)
        WHERE decision IS NULL AND status IS NOT NULL
    """)
    op.execute("""
        UPDATE approval_records
        SET comment = comments
        WHERE comment IS NULL AND comments IS NOT NULL
    """)


    # 5. Create backward-compatibility views
    op.execute("CREATE VIEW IF NOT EXISTS knowledge_articles AS SELECT * FROM knowledge_items")
    op.execute("CREATE VIEW IF NOT EXISTS knowledge_revisions AS SELECT * FROM knowledge_versions")
    op.execute("CREATE VIEW IF NOT EXISTS review_records AS SELECT * FROM approval_records")

    # 6. Indexes
    op.create_index(
        "uq_versions_one_published_per_item",
        "knowledge_versions",
        ["item_id"],
        unique=True,
        sqlite_where=sa.text("status = 'published'"),
        postgresql_where=sa.text("status = 'published'"),
    )
    op.create_index(
        "uq_versions_one_open_per_item",
        "knowledge_versions",
        ["item_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('draft', 'changes_requested', 'in_review')"),
        postgresql_where=sa.text("status IN ('draft', 'changes_requested', 'in_review')"),
    )
    op.create_index(
        "ix_versions_status_submitted",
        "knowledge_versions",
        ["status", "submitted_at"],
    )

    # 7. Check Constraints & Triggers by dialect
    if dialect_name == "postgresql":
        op.create_check_constraint(
            "ck_versions_status",
            "knowledge_versions",
            "status IN ('draft', 'in_review', 'changes_requested', 'rejected', 'approved', 'published', 'superseded', 'withdrawn')",
        )
        op.create_check_constraint(
            "ck_versions_origin",
            "knowledge_versions",
            "origin IN ('expert', 'ai_draft', 'ai_draft_edited')",
        )
        op.create_check_constraint(
            "ck_approval_decision",
            "approval_records",
            "decision IN ('approved', 'changes_requested', 'rejected', 'withdrawn')",
        )
        op.create_check_constraint(
            "ck_approval_comment_required",
            "approval_records",
            "decision = 'approved' OR length(trim(coalesce(comment, ''))) > 0",
        )
        op.create_check_constraint(
            "ck_review_comment_body",
            "review_comments",
            "length(trim(body)) BETWEEN 1 AND 4000",
        )
        op.create_check_constraint(
            "ck_published_has_date",
            "knowledge_versions",
            "status <> 'published' OR published_at IS NOT NULL",
        )

        # Deferrable pointer FK
        op.execute("""
            ALTER TABLE knowledge_items
            ADD CONSTRAINT fk_items_current_published_version
            FOREIGN KEY (current_published_version_id)
            REFERENCES knowledge_versions(id)
            DEFERRABLE INITIALLY DEFERRED
        """)

        # Trigger function for version freeze
        op.execute("""
            CREATE OR REPLACE FUNCTION fn_versions_freeze_content()
            RETURNS TRIGGER AS $$
            BEGIN
              IF OLD.status NOT IN ('draft', 'changes_requested') AND (
                NEW.title, NEW.machine_id, NEW.summary, NEW.steps, NEW.item_id, NEW.version_no, NEW.created_by
              ) IS DISTINCT FROM (
                OLD.title, OLD.machine_id, OLD.summary, OLD.steps, OLD.item_id, OLD.version_no, OLD.created_by
              ) THEN
                RAISE EXCEPTION 'version content is frozen' USING ERRCODE = 'check_violation';
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute("""
            CREATE TRIGGER trg_versions_freeze_content
            BEFORE UPDATE ON knowledge_versions
            FOR EACH ROW
            EXECUTE FUNCTION fn_versions_freeze_content();
        """)

        # Append-only trigger function
        op.execute("""
            CREATE OR REPLACE FUNCTION fn_append_only_records()
            RETURNS TRIGGER AS $$
            BEGIN
              RAISE EXCEPTION 'Historical records are append-only and cannot be modified or deleted' USING ERRCODE = 'check_violation';
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute("""
            CREATE TRIGGER trg_approval_records_append_only
            BEFORE UPDATE OR DELETE ON approval_records
            FOR EACH ROW
            EXECUTE FUNCTION fn_append_only_records();
        """)
        op.execute("""
            CREATE TRIGGER trg_review_comments_append_only
            BEFORE UPDATE OR DELETE ON review_comments
            FOR EACH ROW
            EXECUTE FUNCTION fn_append_only_records();
        """)

    else:
        # SQLite dialect
        # Triggers for version content freeze
        op.execute("""
            CREATE TRIGGER trg_versions_freeze_content
            BEFORE UPDATE ON knowledge_versions
            FOR EACH ROW
            WHEN OLD.status NOT IN ('draft', 'changes_requested') AND (
                NEW.title IS NOT OLD.title OR
                NEW.machine_id IS NOT OLD.machine_id OR
                NEW.summary IS NOT OLD.summary OR
                NEW.steps IS NOT OLD.steps OR
                NEW.item_id IS NOT OLD.item_id OR
                NEW.version_no IS NOT OLD.version_no OR
                NEW.created_by IS NOT OLD.created_by
            )
            BEGIN
                SELECT RAISE(ABORT, 'version content is frozen');
            END;
        """)

        # SQLite Append-Only Triggers
        op.execute("""
            CREATE TRIGGER trg_approval_records_no_update
            BEFORE UPDATE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_approval_records_no_delete
            BEFORE DELETE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_review_comments_no_update
            BEFORE UPDATE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_review_comments_no_delete
            BEFORE DELETE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """)

        # SQLite Check constraints via Triggers (status, comments, comment_required, published_has_date)
        op.execute("""
            CREATE TRIGGER trg_approval_records_check_insert
            BEFORE INSERT ON approval_records
            BEGIN
                SELECT CASE
                    WHEN NEW.decision NOT IN ('approved', 'changes_requested', 'rejected', 'withdrawn')
                        THEN RAISE(ABORT, 'ck_approval_decision constraint violated')
                    WHEN NEW.decision != 'approved' AND length(trim(coalesce(NEW.comment, ''))) = 0
                        THEN RAISE(ABORT, 'ck_approval_comment_required constraint violated')
                END;
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_review_comments_check_insert
            BEFORE INSERT ON review_comments
            BEGIN
                SELECT CASE
                    WHEN length(trim(NEW.body)) < 1 OR length(trim(NEW.body)) > 4000
                        THEN RAISE(ABORT, 'ck_review_comment_body constraint violated')
                END;
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_versions_check_insert
            BEFORE INSERT ON knowledge_versions
            BEGIN
                SELECT CASE
                    WHEN NEW.status NOT IN ('draft', 'in_review', 'changes_requested', 'rejected', 'approved', 'published', 'superseded', 'withdrawn')
                        THEN RAISE(ABORT, 'ck_versions_status constraint violated')
                    WHEN NEW.origin NOT IN ('expert', 'ai_draft', 'ai_draft_edited')
                        THEN RAISE(ABORT, 'ck_versions_origin constraint violated')
                    WHEN NEW.status = 'published' AND NEW.published_at IS NULL
                        THEN RAISE(ABORT, 'ck_published_has_date constraint violated')
                END;
            END;
        """)
        op.execute("""
            CREATE TRIGGER trg_versions_check_update
            BEFORE UPDATE ON knowledge_versions
            BEGIN
                SELECT CASE
                    WHEN NEW.status NOT IN ('draft', 'in_review', 'changes_requested', 'rejected', 'approved', 'published', 'superseded', 'withdrawn')
                        THEN RAISE(ABORT, 'ck_versions_status constraint violated')
                    WHEN NEW.origin NOT IN ('expert', 'ai_draft', 'ai_draft_edited')
                        THEN RAISE(ABORT, 'ck_versions_origin constraint violated')
                    WHEN NEW.status = 'published' AND NEW.published_at IS NULL
                        THEN RAISE(ABORT, 'ck_published_has_date constraint violated')
                END;
            END;
        """)


def downgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    if dialect_name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_versions_freeze_content ON knowledge_versions")
        op.execute("DROP FUNCTION IF EXISTS fn_versions_freeze_content()")
        op.execute("DROP TRIGGER IF EXISTS trg_approval_records_append_only ON approval_records")
        op.execute("DROP TRIGGER IF EXISTS trg_review_comments_append_only ON review_comments")
        op.execute("DROP FUNCTION IF EXISTS fn_append_only_records()")
        op.drop_constraint("ck_published_has_date", "knowledge_versions", type_="check")
        op.drop_constraint("ck_review_comment_body", "review_comments", type_="check")
        op.drop_constraint("ck_approval_comment_required", "approval_records", type_="check")
        op.drop_constraint("ck_approval_decision", "approval_records", type_="check")
        op.drop_constraint("ck_versions_origin", "knowledge_versions", type_="check")
        op.drop_constraint("ck_versions_status", "knowledge_versions", type_="check")
        op.drop_constraint("fk_items_current_published_version", "knowledge_items", type_="foreignkey")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_versions_freeze_content")
        op.execute("DROP TRIGGER IF EXISTS trg_approval_records_no_update")
        op.execute("DROP TRIGGER IF EXISTS trg_approval_records_no_delete")
        op.execute("DROP TRIGGER IF EXISTS trg_review_comments_no_update")
        op.execute("DROP TRIGGER IF EXISTS trg_review_comments_no_delete")
        op.execute("DROP TRIGGER IF EXISTS trg_approval_records_check_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_review_comments_check_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_versions_check_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_versions_check_update")

    op.drop_index("ix_versions_status_submitted", table_name="knowledge_versions")
    op.drop_index("uq_versions_one_open_per_item", table_name="knowledge_versions")
    op.drop_index("uq_versions_one_published_per_item", table_name="knowledge_versions")

    op.execute("DROP VIEW IF EXISTS review_records")
    op.execute("DROP VIEW IF EXISTS knowledge_revisions")
    op.execute("DROP VIEW IF EXISTS knowledge_articles")

    op.drop_table("review_comments")

    op.drop_column("approval_records", "comment")
    op.drop_column("approval_records", "decision")
    op.drop_column("approval_records", "version_id")
    op.drop_column("approval_records", "item_id")

    op.drop_column("knowledge_items", "current_published_version_id")
    op.drop_column("knowledge_versions", "revision_reason")
    op.drop_column("knowledge_versions", "published_at")
    op.drop_column("knowledge_versions", "submitted_at")
    op.drop_column("knowledge_versions", "created_by")
    op.drop_column("knowledge_versions", "steps")
    op.drop_column("knowledge_versions", "summary")
    op.drop_column("knowledge_versions", "origin")
    op.drop_column("knowledge_versions", "status")
    op.drop_column("knowledge_versions", "machine_id")
    op.drop_column("knowledge_versions", "version_no")
    op.drop_column("knowledge_versions", "item_id")

    op.rename_table("approval_records", "review_records")
    op.rename_table("knowledge_versions", "knowledge_revisions")
    op.rename_table("knowledge_items", "knowledge_articles")
