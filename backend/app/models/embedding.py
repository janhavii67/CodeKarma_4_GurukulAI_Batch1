import json
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, generate_uuid, utc_now


class KnowledgeEmbedding(Base):
    __tablename__ = "knowledge_embeddings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # voice_transcript, voice_segment, knowledge_step, procedure_step
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)  # ID of segment, transcript, or version
    media_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=True)
    version_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("knowledge_versions.id", ondelete="CASCADE"), nullable=True)
    machine_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("machines.id", ondelete="SET NULL"), nullable=True)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-serialized list of floats
    embedding_model: Mapped[str] = mapped_column(String(64), default="default-vector-v1", nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    media = relationship("MediaAsset", foreign_keys=[media_id])
    version = relationship("KnowledgeVersion", foreign_keys=[version_id])
    machine = relationship("Machine", foreign_keys=[machine_id])

    @property
    def vector(self) -> List[float]:
        try:
            return json.loads(self.embedding_json)
        except Exception:
            return []

    @vector.setter
    def vector(self, vec: List[float]) -> None:
        self.embedding_json = json.dumps(vec)

    @property
    def metadata_dict(self) -> dict:
        if not self.metadata_json:
            return {}
        try:
            return json.loads(self.metadata_json)
        except Exception:
            return {}
