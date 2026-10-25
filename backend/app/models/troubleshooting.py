from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class TroubleshootingCase(Base, TimestampMixin):
    __tablename__ = "troubleshooting_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    symptom: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    nodes: Mapped[List["TroubleshootingNode"]] = relationship("TroubleshootingNode", back_populates="case", cascade="all, delete-orphan")
    edges: Mapped[List["TroubleshootingEdge"]] = relationship("TroubleshootingEdge", back_populates="case", cascade="all, delete-orphan")


class TroubleshootingNode(Base):
    __tablename__ = "troubleshooting_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_cases.id"), nullable=False)
    node_type: Mapped[str] = mapped_column(String(32), nullable=False)  # QUESTION, CHECK, ACTION, RESOLUTION, ESCALATION
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    safety_warning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_root: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    case: Mapped["TroubleshootingCase"] = relationship("TroubleshootingCase", back_populates="nodes")


class TroubleshootingEdge(Base):
    __tablename__ = "troubleshooting_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_cases.id"), nullable=False)
    from_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id"), nullable=False)
    to_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("troubleshooting_nodes.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)  # "Yes", "No", condition choice

    case: Mapped["TroubleshootingCase"] = relationship("TroubleshootingCase", back_populates="edges")
