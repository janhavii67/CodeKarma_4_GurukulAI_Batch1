from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid


# Status constants
STATUS_DRAFT = "draft"
STATUS_IN_REVIEW = "in_review"
STATUS_CHANGES_REQUESTED = "changes_requested"
STATUS_REJECTED = "rejected"
STATUS_APPROVED = "approved"
STATUS_PUBLISHED = "published"
STATUS_SUPERSEDED = "superseded"
STATUS_WITHDRAWN = "withdrawn"

ALL_STATUSES = {
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_CHANGES_REQUESTED,
    STATUS_REJECTED,
    STATUS_APPROVED,
    STATUS_PUBLISHED,
    STATUS_SUPERSEDED,
    STATUS_WITHDRAWN,
}

# Open draft statuses: at most one version in these statuses per item
OPEN_DRAFT_STATUSES = {
    STATUS_DRAFT,
    STATUS_CHANGES_REQUESTED,
    STATUS_IN_REVIEW,
    STATUS_APPROVED,
}

# Editable statuses: version can only be edited by author in these states
EDITABLE_STATUSES = {
    STATUS_DRAFT,
    STATUS_CHANGES_REQUESTED,
}

# Origin constants
ORIGIN_EXPERT = "expert"
ORIGIN_AI_DRAFT = "ai_draft"
ORIGIN_AI_DRAFT_EDITED = "ai_draft_edited"

ALL_ORIGINS = {
    ORIGIN_EXPERT,
    ORIGIN_AI_DRAFT,
    ORIGIN_AI_DRAFT_EDITED,
}


class KnowledgeItem(Base, TimestampMixin):
    __tablename__ = "knowledge_items"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    machine_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("machines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    current_published_version_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey(
            "knowledge_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_knowledge_items_current_published_version",
        ),
        nullable=True,
        index=True,
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    machine: Mapped[Optional["Machine"]] = relationship(
        "Machine",
        back_populates="knowledge_items",
    )
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
    versions: Mapped[List["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion",
        back_populates="item",
        foreign_keys="[KnowledgeVersion.item_id]",
        cascade="all, delete-orphan",
        order_by="KnowledgeVersion.version_no.desc()",
    )
    current_published_version: Mapped[Optional["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion",
        foreign_keys=[current_published_version_id],
        post_update=True,
    )


class KnowledgeVersion(Base, TimestampMixin):
    __tablename__ = "knowledge_versions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
    )
    item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        default=STATUS_DRAFT,
        nullable=False,
        index=True,
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    steps: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    origin: Mapped[str] = mapped_column(
        String(32),
        default=ORIGIN_EXPERT,
        nullable=False,
    )
    revision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    item: Mapped["KnowledgeItem"] = relationship(
        "KnowledgeItem",
        back_populates="versions",
        foreign_keys=[item_id],
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    media_assets: Mapped[List["MediaAsset"]] = relationship(
        "MediaAsset",
        back_populates="version",
        order_by="MediaAsset.created_at.asc()",
    )


    __table_args__ = (
        UniqueConstraint("item_id", "version_no", name="uq_knowledge_version_item_no"),
        Index(
            "uq_open_draft_per_item",
            "item_id",
            unique=True,
            postgresql_where=text("status IN ('draft', 'changes_requested', 'in_review', 'approved')"),
            sqlite_where=text("status IN ('draft', 'changes_requested', 'in_review', 'approved')"),
        ),
    )
