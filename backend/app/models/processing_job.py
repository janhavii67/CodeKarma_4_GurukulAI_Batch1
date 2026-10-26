from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.db.base import Base, generate_uuid, utc_now

# Job type constants
JOB_TYPE_VOICE = "voice_to_knowledge"
JOB_TYPE_KNOWLEDGE_INDEX = "knowledge_index"


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    type: Mapped[str] = mapped_column(String(64), default="voice_to_knowledge", nullable=False)
    # media_id is nullable: voice jobs set it; assistant knowledge-index jobs do not
    media_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=True)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)  # queued, processing, needs_review, completed, failed, cancelled
    progress: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)
    error_safe: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Backward compatibility synonyms
    user_id = synonym("created_by")
    stage = synonym("type")
    progress_percent = synonym("progress")
    error_message = synonym("error_safe")

    media = relationship("MediaAsset", back_populates="jobs", foreign_keys=[media_id])
    version = relationship("KnowledgeVersion", foreign_keys=[version_id])
    creator = relationship("User", foreign_keys=[created_by])
