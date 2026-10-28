from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, DateTime, JSON, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now

procedure_media_assets = Table(
    "procedure_media_assets", Base.metadata,
    Column("procedure_id", String(36), ForeignKey("procedures.id", ondelete="CASCADE"), primary_key=True),
    Column("media_id", String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), primary_key=True),
)


class Procedure(Base, TimestampMixin):
    __tablename__ = "procedures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True, default="APPROVED", nullable=False)  # DRAFT, APPROVED, ARCHIVED
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    prerequisites: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required_tools: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_warnings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operating_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    troubleshooting_guidance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    knowledge_version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="SET NULL", name="fk_procedures_knowledge_version_id"), nullable=True, unique=True, index=True)
    source_refs: Mapped[Optional[List[dict]]] = mapped_column(JSON, default=list, nullable=True)
    media_assets = relationship("MediaAsset", secondary=procedure_media_assets, lazy="selectin")

    steps: Mapped[List["ProcedureStep"]] = relationship("ProcedureStep", back_populates="procedure", cascade="all, delete-orphan", order_by="ProcedureStep.step_order")
    runs: Mapped[List["ProcedureRun"]] = relationship("ProcedureRun", back_populates="procedure")
    knowledge_version = relationship("KnowledgeVersion", foreign_keys=[knowledge_version_id])


class ProcedureStep(Base):
    __tablename__ = "procedure_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    procedure_id: Mapped[str] = mapped_column(String(36), ForeignKey("procedures.id"), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    expected_observation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    safety_warning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)

    procedure: Mapped["Procedure"] = relationship("Procedure", back_populates="steps")


class ProcedureRun(Base):
    __tablename__ = "procedure_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    procedure_id: Mapped[str] = mapped_column(String(36), ForeignKey("procedures.id"), nullable=False)
    operator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="IN_PROGRESS", nullable=False)  # IN_PROGRESS, COMPLETED, ABORTED
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    current_step_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    issues: Mapped[Optional[List[dict]]] = mapped_column(JSON, default=list, nullable=True)

    procedure: Mapped["Procedure"] = relationship("Procedure", back_populates="runs")
    step_executions: Mapped[List["ProcedureRunStep"]] = relationship("ProcedureRunStep", back_populates="run", cascade="all, delete-orphan")


class ProcedureRunStep(Base):
    __tablename__ = "procedure_run_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("procedure_runs.id"), nullable=False)
    step_id: Mapped[str] = mapped_column(String(36), ForeignKey("procedure_steps.id"), nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    operator_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped["ProcedureRun"] = relationship("ProcedureRun", back_populates="step_executions")
