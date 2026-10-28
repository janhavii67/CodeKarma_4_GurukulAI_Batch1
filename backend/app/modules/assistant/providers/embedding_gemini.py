import re
import time
from typing import List, Optional
from google import genai
from app.core.config import settings
from app.core.logging import logger
from app.modules.assistant.providers.embedding_base import (
    EmbeddingProvider,
    EmbeddingRequest,
    EmbeddingResponse,
)
from app.modules.assistant.providers.llm_base import (
    LLMAuthenticationError,
    LLMRateLimitError,
    LLMTimeoutError,
    LLMError,
)


class GeminiEmbeddingProvider(EmbeddingProvider):
    """
    Google Gemini Embedding provider for semantic retrieval and knowledge vectorization.
    Uses official google-genai SDK models (e.g. text-embedding-004).
    Supports multi-key fallback rotation on rate limits and quota exhaustion.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        raw_key = api_key or getattr(settings, "GEMINI_API_KEY", "")
        self.api_keys = self._parse_keys(raw_key)
        if not self.api_keys:
            raise LLMAuthenticationError(
                "GEMINI_API_KEY is not configured for Gemini embedding provider."
            )
        self.current_key_idx = 0
        self.api_key = self.api_keys[0]

        self.model_name = (
            model_name
            or getattr(settings, "GEMINI_EMBEDDING_MODEL", None)
            or "text-embedding-004"
        )
        self.provider_name = "gemini"
        self.client = genai.Client(api_key=self.api_key)

    @staticmethod
    def _parse_keys(raw_key: Optional[str]) -> List[str]:
        if not raw_key:
            return []
        keys: List[str] = []
        for part in re.split(r"[|,]", str(raw_key)):
            cleaned = part.strip()
            if cleaned and cleaned not in keys:
                keys.append(cleaned)
        return keys

    def _rotate_key(self) -> str:
        if not self.api_keys:
            return ""
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        self.api_key = self.api_keys[self.current_key_idx]
        self.client = genai.Client(api_key=self.api_key)
        logger.info(
            f"Rotated Gemini Embedding API key to slot {self.current_key_idx + 1}/{len(self.api_keys)}"
        )
        return self.api_key

    def embed_texts(self, request: EmbeddingRequest) -> EmbeddingResponse:
        """Batch compute embeddings for multiple texts with multi-key rotation and backoff."""
        model = request.model or self.model_name
        all_embeddings: List[List[float]] = []

        # Batch in chunks of 20 to respect API payload limits
        batch_size = 20
        for i in range(0, len(request.texts), batch_size):
            batch = request.texts[i : i + batch_size]
            retries = max(3, len(self.api_keys))
            backoff_s = 1.0

            while retries >= 0:
                try:
                    res = self.client.models.embed_content(
                        model=model,
                        contents=batch,
                    )
                    if res.embeddings:
                        for emb in res.embeddings:
                            all_embeddings.append(emb.values)
                    break
                except Exception as exc:
                    retries -= 1
                    err_msg = str(exc).lower()
                    if (
                        "429" in err_msg
                        or "resource_exhausted" in err_msg
                        or "rate limit" in err_msg
                        or "quota" in err_msg
                    ):
                        if len(self.api_keys) > 1:
                            self._rotate_key()
                        if retries >= 0:
                            logger.warning(
                                f"Embedding rate limit hit, rotated key, backing off {backoff_s:.1f}s..."
                            )
                            time.sleep(backoff_s)
                            backoff_s *= 1.5
                            continue
                        raise LLMRateLimitError(
                            "Gemini Embedding rate limit exceeded after retries."
                        ) from exc
                    if "api_key" in err_msg or "401" in err_msg or "403" in err_msg:
                        if len(self.api_keys) > 1 and retries >= 0:
                            self._rotate_key()
                            continue
                        raise LLMAuthenticationError(
                            "Gemini Embedding API key authentication failed."
                        ) from exc
                    if retries >= 0:
                        time.sleep(backoff_s)
                        backoff_s *= 1.5
                        continue
                    raise LLMError(f"Gemini Embedding failed: {type(exc).__name__}") from exc

        dim = len(all_embeddings[0]) if all_embeddings and all_embeddings[0] else 768
        return EmbeddingResponse(
            embeddings=all_embeddings,
            model=model,
            dimension=dim,
        )

    def embed_query(self, query: str) -> List[float]:
        """Compute embedding for a single search query."""
        resp = self.embed_texts(EmbeddingRequest(texts=[query]))
        return resp.embeddings[0] if resp.embeddings else []

    def embed(self, text: str) -> List[float]:
        """Compute embedding for a single text."""
        return self.embed_query(text)
