from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Float, Integer, Boolean, ForeignKey, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class AudioReference(Base, TimestampMixin):
    __tablename__ = "audio_references"
    __table_args__ = (
        Index("ix_audio_reference_status_machine", "status", "machine_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    sample_rate: Mapped[int] = mapped_column(Integer, default=22050, nullable=False)
    # Retained for old database compatibility. New references use approved knowledge text.
    fault_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_expert_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    operating_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    features_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    feature_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    knowledge_version_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL"), nullable=True, unique=True, index=True
    )
    media_asset_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, unique=True, index=True
    )
    model_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    component: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    operation: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    recording_source: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    recorded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    related_links_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AudioAnalysisJob(Base):
    __tablename__ = "audio_analysis_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    file_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
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
    audio_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    submission_media_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    review_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
