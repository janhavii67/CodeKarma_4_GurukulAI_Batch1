from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class LearningPath(Base, TimestampMixin):
    __tablename__ = "learning_paths"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    target_role: Mapped[str] = mapped_column(String(32), default="TRAINEE", nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    items: Mapped[List["LearningItem"]] = relationship("LearningItem", back_populates="path", cascade="all, delete-orphan", order_by="LearningItem.order_index")
    assignments: Mapped[List["LearningAssignment"]] = relationship("LearningAssignment", back_populates="path")


class LearningItem(Base):
    __tablename__ = "learning_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    path_id: Mapped[str] = mapped_column(String(36), ForeignKey("learning_paths.id"), nullable=False)
    item_type: Mapped[str] = mapped_column(String(32), nullable=False)  # ARTICLE, PROCEDURE, SIMULATION
    reference_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)

    path: Mapped["LearningPath"] = relationship("LearningPath", back_populates="items")


class LearningAssignment(Base):
    __tablename__ = "learning_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    path_id: Mapped[str] = mapped_column(String(36), ForeignKey("learning_paths.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ASSIGNED", nullable=False)  # ASSIGNED, IN_PROGRESS, COMPLETED
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    path: Mapped["LearningPath"] = relationship("LearningPath", back_populates="assignments")
