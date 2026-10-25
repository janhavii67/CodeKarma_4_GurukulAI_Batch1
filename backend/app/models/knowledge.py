from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String,
    Text,
    Integer,
    ForeignKey,
    DateTime,
    Index,
    CheckConstraint,
    text,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class KnowledgeItem(Base, TimestampMixin):
    __tablename__ = "knowledge_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    # Mirror of the current published version (or initial v1 draft until published)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(64), index=True, default="GENERAL")
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="DRAFT", nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_published_version_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("knowledge_versions.id", use_alter=True, name="fk_items_published_ver"),
        nullable=True,
    )
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    versions: Mapped[List["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion",
        back_populates="item",
        foreign_keys="[KnowledgeVersion.item_id]",
        cascade="all, delete-orphan",
    )
    revisions = synonym("versions")

    attachments: Mapped[List["KnowledgeAttachment"]] = relationship(
        "KnowledgeAttachment",
        back_populates="item",
        cascade="all, delete-orphan",
    )
    reviews: Mapped[List["ApprovalRecord"]] = relationship(
        "ApprovalRecord",
        back_populates="item",
        foreign_keys="[ApprovalRecord.item_id]",
        cascade="all, delete-orphan",
    )
    current_published_version: Mapped[Optional["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion",
        foreign_keys=[current_published_version_id],
        post_update=True,
    )


# Backward compatibility alias
KnowledgeArticle = KnowledgeItem


class KnowledgeVersion(Base):
    __tablename__ = "knowledge_versions"

    __table_args__ = (
        Index(
            "uq_versions_one_published_per_item",
            "item_id",
            unique=True,
            sqlite_where=text("status = 'published'"),
            postgresql_where=text("status = 'published'"),
        ),
        Index(
            "uq_versions_one_open_per_item",
            "item_id",
            unique=True,
            sqlite_where=text("status = 'draft' OR status = 'changes_requested' OR status = 'in_review'"),
            postgresql_where=text("status IN ('draft', 'changes_requested', 'in_review')"),
        ),
        Index("ix_versions_status_submitted", "status", "submitted_at"),
        CheckConstraint(
            "status IN ('draft', 'in_review', 'changes_requested', 'rejected', 'approved', 'published', 'superseded', 'withdrawn')",
            name="ck_versions_status",
        ),
        CheckConstraint(
            "origin IN ('expert', 'ai_draft', 'ai_draft_edited')",
            name="ck_versions_origin",
        ),
        CheckConstraint(
            "status <> 'published' OR published_at IS NOT NULL",
            name="ck_published_has_date",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_items.id"), nullable=False)
    article_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    version_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Snapshots of title and machine for this specific version
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    origin: Mapped[str] = mapped_column(String(32), default="expert", nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    steps: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operating_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prerequisites: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_warnings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    common_mistakes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrective_actions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    author_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changelog: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    item: Mapped["KnowledgeItem"] = relationship(
        "KnowledgeItem",
        back_populates="versions",
        foreign_keys=[item_id],
    )
    article = synonym("item")
    machine = relationship("Machine", foreign_keys=[machine_id])
    author = relationship("User", foreign_keys=[created_by])

    approval_records: Mapped[List["ApprovalRecord"]] = relationship(
        "ApprovalRecord",
        back_populates="version",
        foreign_keys="[ApprovalRecord.version_id]",
        cascade="all, delete-orphan",
    )
    comments: Mapped[List["ReviewComment"]] = relationship(
        "ReviewComment",
        back_populates="version",
        cascade="all, delete-orphan",
    )

    def __init__(self, **kwargs):
        if "article_id" in kwargs and "item_id" not in kwargs:
            kwargs["item_id"] = kwargs["article_id"]
        elif "item_id" in kwargs and "article_id" not in kwargs:
            kwargs["article_id"] = kwargs["item_id"]

        if "version" in kwargs and "version_no" not in kwargs:
            kwargs["version_no"] = kwargs["version"]
        elif "version_no" in kwargs and "version" not in kwargs:
            kwargs["version"] = kwargs["version_no"]

        if "author_id" in kwargs and "created_by" not in kwargs:
            kwargs["created_by"] = kwargs["author_id"]
        elif "created_by" in kwargs and "author_id" not in kwargs:
            kwargs["author_id"] = kwargs["created_by"]

        if "changelog" in kwargs and "revision_reason" not in kwargs:
            kwargs["revision_reason"] = kwargs["changelog"]
        elif "revision_reason" in kwargs and "changelog" not in kwargs:
            kwargs["changelog"] = kwargs["revision_reason"]

        if "content" in kwargs and "summary" not in kwargs:
            kwargs["summary"] = kwargs["content"]
        elif "summary" in kwargs and "content" not in kwargs:
            kwargs["content"] = kwargs["summary"]

        super().__init__(**kwargs)


# Backward compatibility alias
KnowledgeRevision = KnowledgeVersion


class KnowledgeAttachment(Base):
    __tablename__ = "knowledge_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_id: Mapped[str] = mapped_column(
        "article_id", String(36), ForeignKey("knowledge_items.id"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(256), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    item: Mapped["KnowledgeItem"] = relationship("KnowledgeItem", back_populates="attachments")
    article = synonym("item")
    article_id = synonym("item_id")


class ApprovalRecord(Base):
    __tablename__ = "approval_records"

    __table_args__ = (
        CheckConstraint(
            "decision IN ('approved', 'changes_requested', 'rejected', 'withdrawn')",
            name="ck_approval_decision",
        ),
        CheckConstraint(
            "decision = 'approved' OR length(trim(coalesce(comment, ''))) > 0",
            name="ck_approval_comment_required",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_items.id"), nullable=True)
    article_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id"), nullable=True)
    revision_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reviewer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)  # approved, changes_requested, rejected, withdrawn
    status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    item: Mapped[Optional["KnowledgeItem"]] = relationship(
        "KnowledgeItem", back_populates="reviews", foreign_keys=[item_id]
    )
    version: Mapped[Optional["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion", back_populates="approval_records", foreign_keys=[version_id]
    )

    def __init__(self, **kwargs):
        if "article_id" in kwargs and "item_id" not in kwargs:
            kwargs["item_id"] = kwargs["article_id"]
        elif "item_id" in kwargs and "article_id" not in kwargs:
            kwargs["article_id"] = kwargs["item_id"]

        if "revision_id" in kwargs and "version_id" not in kwargs:
            kwargs["version_id"] = kwargs["revision_id"]
        elif "version_id" in kwargs and "revision_id" not in kwargs:
            kwargs["revision_id"] = kwargs["version_id"]

        if "status" in kwargs and "decision" not in kwargs:
            kwargs["decision"] = kwargs["status"].lower()
            kwargs["status"] = kwargs["decision"]
        elif "decision" in kwargs and "status" not in kwargs:
            kwargs["status"] = kwargs["decision"]

        if "comments" in kwargs and "comment" not in kwargs:
            kwargs["comment"] = kwargs["comments"]
        elif "comment" in kwargs and "comments" not in kwargs:
            kwargs["comments"] = kwargs["comment"]

        super().__init__(**kwargs)


# Backward compatibility alias
ReviewRecord = ApprovalRecord


class ReviewComment(Base):
    __tablename__ = "review_comments"

    __table_args__ = (
        CheckConstraint(
            "length(trim(body)) BETWEEN 1 AND 4000",
            name="ck_review_comment_body",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("knowledge_versions.id"), nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    step_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    version: Mapped["KnowledgeVersion"] = relationship("KnowledgeVersion", back_populates="comments")


# Attach database triggers automatically whenever tables are created
@event.listens_for(KnowledgeVersion.__table__, "after_create")
def _create_version_triggers(target, connection, **kw):
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.execute(text("""
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


@event.listens_for(ApprovalRecord.__table__, "after_create")
def _create_approval_triggers(target, connection, **kw):
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_approval_records_no_update
            BEFORE UPDATE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_approval_records_no_delete
            BEFORE DELETE ON approval_records
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))


@event.listens_for(ReviewComment.__table__, "after_create")
def _create_comment_triggers(target, connection, **kw):
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_review_comments_no_update
            BEFORE UPDATE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
        connection.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_review_comments_no_delete
            BEFORE DELETE ON review_comments
            BEGIN
                SELECT RAISE(ABORT, 'Historical records are append-only and cannot be modified or deleted');
            END;
        """))
