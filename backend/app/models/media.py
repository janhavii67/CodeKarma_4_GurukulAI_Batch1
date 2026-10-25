from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Float, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, generate_uuid, utc_now


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="Untitled Media")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id", ondelete="SET NULL"), nullable=True)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), default="audio", nullable=False)  # audio, video
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_name: Mapped[str] = mapped_column(String(256), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    machine = relationship("Machine", foreign_keys=[machine_id])
    version = relationship("KnowledgeVersion", foreign_keys=[version_id])
    uploader = relationship("User", foreign_keys=[uploaded_by])

    jobs: Mapped[List["ProcessingJob"]] = relationship(
        "ProcessingJob", back_populates="media", cascade="all, delete-orphan"
    )
    transcripts: Mapped[List["Transcript"]] = relationship(
        "Transcript", back_populates="media", cascade="all, delete-orphan"
    )
