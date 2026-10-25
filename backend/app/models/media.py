from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Float,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now

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
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="Untitled Media")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("machines.id", ondelete="SET NULL"), nullable=True
    )
    version_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("knowledge_versions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        String(32),
        default=KIND_AUDIO,
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
        default=0,
        nullable=False,
    )
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Aliases for backward compatibility
    file_path = synonym("storage_key")
    mime_type = synonym("mime")

    version: Mapped[Optional["KnowledgeVersion"]] = relationship(
        "KnowledgeVersion",
        back_populates="media_assets",
        foreign_keys=[version_id],
    )
    uploader: Mapped["User"] = relationship(
        "User",
        foreign_keys=[uploaded_by],
    )
    machine = relationship("Machine", foreign_keys=[machine_id])

    jobs: Mapped[List["ProcessingJob"]] = relationship(
        "ProcessingJob", back_populates="media", cascade="all, delete-orphan"
    )
    transcripts: Mapped[List["Transcript"]] = relationship(
        "Transcript", back_populates="media", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('audio', 'video', 'image', 'document')",
            name="check_media_asset_kind",
        ),
        CheckConstraint(
            "size_bytes >= 0",
            name="check_media_asset_size_bytes_nonnegative",
        ),
        Index("idx_media_assets_version_id", "version_id"),
        Index("idx_media_assets_uploaded_by", "uploaded_by"),
    )

    def __init__(self, **kwargs):
        if "file_path" in kwargs and "storage_key" not in kwargs:
            kwargs["storage_key"] = kwargs["file_path"]
        elif "storage_key" in kwargs and "file_path" not in kwargs:
            kwargs["file_path"] = kwargs["storage_key"]
        if "mime_type" in kwargs and "mime" not in kwargs:
            kwargs["mime"] = kwargs["mime_type"]
        elif "mime" in kwargs and "mime_type" not in kwargs:
            kwargs["mime_type"] = kwargs["mime"]
        super().__init__(**kwargs)
