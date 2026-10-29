from datetime import datetime
from typing import Optional, List
from sqlalchemy import Boolean, String, Text, ForeignKey, DateTime, true
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class MachineCategory(Base):
    __tablename__ = "machine_categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default=true())

    machines: Mapped[List["Machine"]] = relationship("Machine", back_populates="category_obj")


class Machine(Base, TimestampMixin):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(String(64), ForeignKey("machine_categories.id"), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default=true())
    specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    category_obj: Mapped[Optional["MachineCategory"]] = relationship("MachineCategory", back_populates="machines", foreign_keys=[category_id])
    tools: Mapped[List["Tool"]] = relationship("Tool", back_populates="machine")
    knowledge_items: Mapped[List["KnowledgeItem"]] = relationship("KnowledgeItem", back_populates="machine")

    @property
    def category_name(self) -> Optional[str]:
        if self.category_obj:
            return self.category_obj.name
        return self.category

    def __init__(self, **kwargs):
        if "code" in kwargs and "model_number" not in kwargs:
            kwargs["model_number"] = kwargs["code"]
        elif "model_number" in kwargs and "code" not in kwargs:
            kwargs["code"] = kwargs["model_number"]
        # `category` is the persisted display name for older records;
        # `category_id` is a foreign key into the category catalog. They are
        # separate fields and must never be copied into one another.
        super().__init__(**kwargs)



class Tool(Base, TimestampMixin):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    tool_number: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id"), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    machine: Mapped[Optional["Machine"]] = relationship("Machine", back_populates="tools")
