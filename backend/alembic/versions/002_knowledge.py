"""002_knowledge

Revision ID: 002_knowledge
Revises: 001_foundation
Create Date: 2026-10-24 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "002_knowledge"
down_revision: Union[str, None] = "001_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. machines
    op.create_table(
        "machines",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_machines_code"),
    )
    op.create_index("idx_machines_code", "machines", ["code"])

    # 2. knowledge_items
    op.create_table(
        "knowledge_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("machine_id", sa.String(length=36), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("current_published_version_id", sa.String(length=36), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_knowledge_items_title", "knowledge_items", ["title"])
    op.create_index("idx_knowledge_items_machine_id", "knowledge_items", ["machine_id"])
    op.create_index("idx_knowledge_items_author_id", "knowledge_items", ["author_id"])

    # 3. knowledge_versions
    op.create_table(
        "knowledge_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("item_id", sa.String(length=36), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("origin", sa.String(length=32), nullable=False, server_default="expert"),
        sa.Column("revision_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["knowledge_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", "version_no", name="uq_knowledge_version_item_no"),
    )
    op.create_index("idx_knowledge_versions_status", "knowledge_versions", ["status"])
    op.create_index("idx_knowledge_versions_created_by", "knowledge_versions", ["created_by"])
    op.create_index("idx_knowledge_versions_item_id", "knowledge_versions", ["item_id"])

    # Partial unique index for open drafts: at most one open version per item
    op.create_index(
        "uq_open_draft_per_item",
        "knowledge_versions",
        ["item_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('draft', 'changes_requested', 'in_review', 'approved')"),
        sqlite_where=sa.text("status IN ('draft', 'changes_requested', 'in_review', 'approved')"),
    )

    # 4. Circular FK from knowledge_items to knowledge_versions
    with op.batch_alter_table("knowledge_items") as batch_op:
        batch_op.create_foreign_key(
            "fk_knowledge_items_current_published_version",
            "knowledge_versions",
            ["current_published_version_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "idx_knowledge_items_current_published_version",
        "knowledge_items",
        ["current_published_version_id"],
    )


def downgrade() -> None:
    # Drop circular FK and index
    op.drop_index("idx_knowledge_items_current_published_version", table_name="knowledge_items")
    with op.batch_alter_table("knowledge_items") as batch_op:
        batch_op.drop_constraint("fk_knowledge_items_current_published_version", type_="foreignkey")


    # Drop knowledge_versions (including partial index)
    op.drop_index("uq_open_draft_per_item", table_name="knowledge_versions")
    op.drop_table("knowledge_versions")

    # Drop knowledge_items
    op.drop_table("knowledge_items")

    # Drop machines
    op.drop_table("machines")
