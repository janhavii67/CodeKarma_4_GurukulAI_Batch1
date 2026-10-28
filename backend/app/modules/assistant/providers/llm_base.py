from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Iterator
from app.core.config import settings


class LLMError(Exception):
    """Base error for LLM provider operations."""
    pass


class LLMExternalDisabledError(LLMError):
    """Raised when an external LLM call is attempted while ALLOW_EXTERNAL_LLM=False."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when LLM call exceeds configured timeout."""
    pass


class LLMAuthenticationError(LLMError):
    """Raised when provider API key or authentication fails."""
    pass


class LLMRateLimitError(LLMError):
    """Raised when provider rate limit is exceeded."""
    pass


@dataclass
class LLMRequest:
    prompt: str
    system_prompt: Optional[str] = None
    temperature: float = 0.0
    max_tokens: int = 1024
    request_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    images: List[Dict[str, Any]] = field(default_factory=list)
    media_parts: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class LLMResponse:
    content: str
    provider_name: str
    model_name: str
    latency_ms: int
    raw_output: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None


class LLMProvider(ABC):
    """Abstract interface for LLM providers."""

    supports_multimodal = False

    @abstractmethod
    def generate(self, request: LLMRequest) -> LLMResponse:
        """Synchronously generate text response."""
        pass

    @abstractmethod
    async def generate_async(self, request: LLMRequest) -> LLMResponse:
        """Asynchronously generate text response."""
        pass

    @abstractmethod
    def stream(self, request: LLMRequest) -> Iterator[str]:
        """Synchronously stream text token chunks."""
        pass


def get_llm_provider(provider_name: Optional[str] = None) -> LLMProvider:
    """
    Factory function returning the configured LLM provider.
    Enforces ALLOW_EXTERNAL_LLM guard: external providers cannot be instantiated
    unless explicitly allowed by configuration.
    """
    raw_selected = (
        provider_name
        or getattr(settings, "LLM_PROVIDER", None)
        or getattr(settings, "ASSISTANT_LLM_PROVIDER", None)
        or "gemini"
    )
    selected = raw_selected.lower().strip()

    if selected in ("fake", "mock"):
        from app.modules.assistant.providers.llm_fake import FakeLLMProvider
        return FakeLLMProvider()

    if selected == "gemini":
        if not settings.ALLOW_EXTERNAL_LLM and not settings.GEMINI_API_KEY:
            raise LLMExternalDisabledError(
                "External LLM calls are disabled. "
                "Set ALLOW_EXTERNAL_LLM=true and GEMINI_API_KEY in your .env."
            )
        if not settings.GEMINI_API_KEY:
            raise LLMAuthenticationError("GEMINI_API_KEY is not configured.")

        from app.modules.assistant.providers.llm_gemini import GeminiLLMProvider
        return GeminiLLMProvider()

    if selected == "anthropic":
        if not settings.ALLOW_EXTERNAL_LLM:
            raise LLMExternalDisabledError(
                "External LLM calls are disabled. "
                "Set ALLOW_EXTERNAL_LLM=true only after reviewing confidential data policy."
            )
        if not settings.ANTHROPIC_API_KEY:
            raise LLMAuthenticationError("ANTHROPIC_API_KEY is not configured.")

        from app.modules.assistant.providers.llm_anthropic import AnthropicLLMProvider
        return AnthropicLLMProvider()

    raise LLMError(f"Unknown LLM provider: '{selected}'. Supported: 'gemini', 'mock', 'fake', 'anthropic'")
