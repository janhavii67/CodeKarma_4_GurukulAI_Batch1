from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Float, Integer, Boolean, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, generate_uuid, utc_now


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_id: Mapped[str] = mapped_column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL"), nullable=True)
    # Kept for compatibility with the original 004 schema; `full_text` was
    # added later, but the legacy column remains NOT NULL in existing databases.
    raw_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    language: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    provider: Mapped[str] = mapped_column(String(64), default="whisper_api", nullable=False)
    full_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    media = relationship("MediaAsset", back_populates="transcripts", foreign_keys=[media_id])
    version = relationship("KnowledgeVersion", foreign_keys=[version_id])
    segments: Mapped[List["TranscriptSegment"]] = relationship(
        "TranscriptSegment", back_populates="transcript", cascade="all, delete-orphan", order_by="TranscriptSegment.idx"
    )

    __table_args__ = (Index("uq_transcripts_media_id", "media_id", unique=True),)


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    transcript_id: Mapped[str] = mapped_column(String(36), ForeignKey("transcripts.id", ondelete="CASCADE"), nullable=False)
    # Legacy 004 columns remain required in existing databases after 007 added
    # the current names. Keep both sets populated for schema compatibility.
    segment_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_time_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_time_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    start_s: Mapped[float] = mapped_column(Float, nullable=False)
    end_s: Mapped[float] = mapped_column(Float, nullable=False)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    edited_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    transcript = relationship("Transcript", back_populates="segments", foreign_keys=[transcript_id])
