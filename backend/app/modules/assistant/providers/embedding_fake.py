from typing import List
from app.modules.assistant.providers.embedding_base import (
    EmbeddingProvider,
    EmbeddingRequest,
    EmbeddingResponse,
)
from app.services.vector_service import compute_dense_embedding, EMBEDDING_DIM


class FakeEmbeddingProvider(EmbeddingProvider):
    """
    Deterministic offline embedding provider using hash-based unit vectors.
    Produces repeatable semantic vectors without external API calls or GPU overhead.
    """

    def __init__(self, model_name: str = "fake-dense-v1", dimension: int = EMBEDDING_DIM):
        self.model_name = model_name
        self.dimension = dimension

    def embed_texts(self, request: EmbeddingRequest) -> EmbeddingResponse:
        vectors = [
            compute_dense_embedding(t, dim=self.dimension)
            for t in request.texts
        ]
        return EmbeddingResponse(
            embeddings=vectors,
            model=self.model_name,
            dimension=self.dimension,
        )

    def embed_query(self, query: str) -> List[float]:
        return compute_dense_embedding(query, dim=self.dimension)
