from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
from app.core.config import settings


@dataclass
class EmbeddingRequest:
    texts: List[str]
    model: Optional[str] = None


@dataclass
class EmbeddingResponse:
    embeddings: List[List[float]]
    model: str
    dimension: int


class EmbeddingProvider(ABC):
    """Abstract interface for text embedding providers."""

    @abstractmethod
    def embed_texts(self, request: EmbeddingRequest) -> EmbeddingResponse:
        """Batch compute embeddings for multiple texts."""
        pass

    @abstractmethod
    def embed_query(self, query: str) -> List[float]:
        """Compute embedding for a single search query."""
        pass


def get_embedding_provider(provider_name: Optional[str] = None) -> EmbeddingProvider:
    """
    Factory function returning the configured embedding provider.
    Defaults to FakeEmbeddingProvider.
    """
    selected = (provider_name or "fake").lower().strip()
    if selected == "fake":
        from app.modules.assistant.providers.embedding_fake import FakeEmbeddingProvider
        return FakeEmbeddingProvider()

    raise ValueError(f"Unknown embedding provider: '{selected}'. Supported: 'fake'")
