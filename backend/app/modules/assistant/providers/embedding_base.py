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

    def embed(self, text: str) -> List[float]:
        """Compute embedding for a single text."""
        res = self.embed_texts(EmbeddingRequest(texts=[text]))
        return res.embeddings[0] if res.embeddings else []


def get_embedding_provider(provider_name: Optional[str] = None) -> EmbeddingProvider:
    """
    Factory function returning the configured embedding provider.
    Supports 'gemini', 'mock', 'fake'.
    """
    raw_selected = (
        provider_name
        or getattr(settings, "LLM_PROVIDER", None)
        or "fake"
    )
    selected = raw_selected.lower().strip()

    if selected in ("fake", "mock"):
        from app.modules.assistant.providers.embedding_fake import FakeEmbeddingProvider
        return FakeEmbeddingProvider()

    if selected == "gemini":
        from app.modules.assistant.providers.embedding_gemini import GeminiEmbeddingProvider
        return GeminiEmbeddingProvider()

    from app.modules.assistant.providers.embedding_fake import FakeEmbeddingProvider
    return FakeEmbeddingProvider()
