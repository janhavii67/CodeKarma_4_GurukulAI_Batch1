from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class SimulationScenario(Base, TimestampMixin):
    __tablename__ = "simulation_scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(32), default="INTERMEDIATE", nullable=False)  # BEGINNER, INTERMEDIATE, ADVANCED
    initial_state_json: Mapped[str] = mapped_column(Text, nullable=False)  # Symptoms, parameters, observations
    scenario_tree_json: Mapped[str] = mapped_column(Text, nullable=False)  # Decision steps, consequences, hints
    completion_criteria: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)


class SimulationAttempt(Base):
    __tablename__ = "simulation_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    scenario_id: Mapped[str] = mapped_column(String(36), ForeignKey("simulation_scenarios.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="IN_PROGRESS", nullable=False)  # PASSED, FAILED, IN_PROGRESS
    decisions_log_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    safety_violations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
