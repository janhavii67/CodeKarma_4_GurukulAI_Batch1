from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Float, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class AudioReference(Base, TimestampMixin):
    __tablename__ = "audio_references"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    sample_rate: Mapped[int] = mapped_column(Integer, default=22050, nullable=False)
    fault_label: Mapped[str] = mapped_column(String(128), nullable=False)  # e.g., "Normal Operation", "Bearing Wear", "Cavitation"
    is_expert_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    operating_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    features_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Spectral baseline features
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)


class AudioAnalysisJob(Base):
    __tablename__ = "audio_analysis_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", nullable=False)  # QUEUED, PROCESSING, MATCHED, NO_RELIABLE_MATCH, AMBIGUOUS_MATCH, UNSUITABLE_AUDIO, INVALID_FILE, FAILED
    matched_reference_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("audio_references.id"), nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    similarity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason_code: Mapped[str] = mapped_column(String(64), default="PENDING", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    requires_expert_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    candidate_scores_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Ranked candidate scores
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
