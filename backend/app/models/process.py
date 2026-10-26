from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid, utc_now


class ManufacturingProcess(Base, TimestampMixin):
    """
    Standard manufacturing process reference model (e.g., CNC Turning, Swiss Machining,
    Catheter Heat Shrinking, Laser Welding, Ultrasonic Cleaning).
    Shared entity referenced by SOPs, machines, and troubleshooting decision trees.
    """
    __tablename__ = "manufacturing_processes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    troubleshooting_guides = relationship(
        "TroubleshootingGuide",
        back_populates="process",
        cascade="all, delete-orphan",
    )
