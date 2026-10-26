from typing import Protocol, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.user import User
from app.models.knowledge import KnowledgeVersion, STATUS_PUBLISHED, STATUS_WITHDRAWN, STATUS_SUPERSEDED
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk
from app.repositories.user_repo import UserRepository
from app.core.permissions import PERM_KNOWLEDGE_VIEW_PUBLISHED


class KnowledgeEligibilityPort(Protocol):
    """
    Interface for determining whether a knowledge source or chunk is eligible
    to be retrieved and presented to a user.
    Enforces that only approved, published, non-withdrawn, active knowledge
    is ever surfaced by the RAG assistant.
    """

    def is_chunk_eligible(self, chunk_id: str, user_id: str, db: Session) -> bool:
        """Single-chunk eligibility verification."""
        ...

    def is_source_eligible(self, source_id: str, user_id: str, db: Session) -> bool:
        """Single-source eligibility verification."""
        ...

    def get_sql_filter(self, user_id: str, db: Session) -> List[Any]:
        """SQL filter expressions to embed directly into SELECT queries."""
        ...


class DefaultKnowledgeEligibilityService:
    """
    Default implementation of KnowledgeEligibilityPort.
    Evaluates eligibility against knowledge_versions status, knowledge_sources,
    and user permissions.
    """

    def _user_can_view(self, user_id: str, db: Session) -> bool:
        """Verify requesting user is active and has permission to view published knowledge."""
        user = UserRepository.get_by_id(db, user_id)
        if not user or not user.is_active:
            return False
        perms = UserRepository.get_user_permissions(db, user)
        return PERM_KNOWLEDGE_VIEW_PUBLISHED in perms

    def is_chunk_eligible(self, chunk_id: str, user_id: str, db: Session) -> bool:
        """
        Verify an individual chunk is active, belongs to a published source,
        and the requesting user is permitted to view it.
        """
        if not self._user_can_view(user_id, db):
            return False

        chunk = db.get(KnowledgeChunk, chunk_id)
        if not chunk or not chunk.is_active:
            return False

        source = db.get(KnowledgeSource, chunk.source_id)
        if not source or source.status != "published":
            return False

        if source.knowledge_version_id:
            kv = db.get(KnowledgeVersion, source.knowledge_version_id)
            if not kv or kv.status != STATUS_PUBLISHED:
                return False

        return True

    def is_source_eligible(self, source_id: str, user_id: str, db: Session) -> bool:
        """
        Verify a source is published and its underlying version is published.
        """
        if not self._user_can_view(user_id, db):
            return False

        source = db.get(KnowledgeSource, source_id)
        if not source or source.status != "published":
            return False

        if source.knowledge_version_id:
            kv = db.get(KnowledgeVersion, source.knowledge_version_id)
            if not kv or kv.status != STATUS_PUBLISHED:
                return False

        return True

    def get_sql_filter(self, user_id: str, db: Session) -> List[Any]:
        """
        Generate SQLAlchemy expressions to apply directly in the retrieval query WHERE clause.
        Filters out drafts, review items, superseded items, withdrawn items, and inactive chunks.
        """
        if not self._user_can_view(user_id, db):
            # User has no permission; return impossible condition
            return [KnowledgeChunk.id == "__NO_ACCESS__"]

        return [
            KnowledgeChunk.is_active == True,
            KnowledgeSource.status == "published",
            or_(
                KnowledgeSource.knowledge_version_id.is_(None),
                KnowledgeVersion.status == STATUS_PUBLISHED,
            ),
        ]


_default_eligibility_service = DefaultKnowledgeEligibilityService()


def get_eligibility_service() -> KnowledgeEligibilityPort:
    """Dependency / accessor for the knowledge eligibility service."""
    return _default_eligibility_service
