from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class MachineCategory(Base):
    __tablename__ = "machine_categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    machines: Mapped[List["Machine"]] = relationship("Machine", back_populates="category")


class Machine(Base, TimestampMixin):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    model_number: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category_id: Mapped[str] = mapped_column(String(64), ForeignKey("machine_categories.id"), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)  # ACTIVE, MAINTENANCE, OFFLINE
    specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    category: Mapped["MachineCategory"] = relationship("MachineCategory", back_populates="machines")
    tools: Mapped[List["Tool"]] = relationship("Tool", back_populates="machine")


class Tool(Base, TimestampMixin):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    tool_number: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    machine: Mapped[Optional["Machine"]] = relationship("Machine", back_populates="tools")
