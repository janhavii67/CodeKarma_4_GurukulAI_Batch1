from typing import Optional
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid


KIND_AUDIO = "audio"
KIND_VIDEO = "video"
KIND_IMAGE = "image"
KIND_DOCUMENT = "document"

ALL_KINDS = {
    KIND_AUDIO,
    KIND_VIDEO,
    KIND_IMAGE,
    KIND_DOCUMENT,
}


class MediaAsset(Base, TimestampMixin):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=generate_uuid,
    )
    version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("knowledge_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )
    original_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    mime: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    size_bytes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    uploaded_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    version: Mapped["KnowledgeVersion"] = relationship(
        "KnowledgeVersion",
        back_populates="media_assets",
    )
    uploader: Mapped["User"] = relationship(
        "User",
        foreign_keys=[uploaded_by],
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('audio', 'video', 'image', 'document')",
            name="check_media_asset_kind",
        ),
        CheckConstraint(
            "size_bytes > 0",
            name="check_media_asset_size_bytes_positive",
        ),
        Index("idx_media_assets_version_id", "version_id"),
        Index("idx_media_assets_uploaded_by", "uploaded_by"),
    )
