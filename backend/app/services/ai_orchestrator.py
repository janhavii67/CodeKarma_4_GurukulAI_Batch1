"""Capability-based entry point for AI work in the modular backend."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Iterator, Optional

from app.core.config import settings
from app.core.logging import logger
from app.modules.assistant.providers.llm_base import (
    LLMError, LLMProvider, LLMRequest, LLMResponse, get_llm_provider,
)


class AICapability(str, Enum):
    TEXT_GENERATION = "text_generation"
    RAG_ANSWER = "rag_answer"
    DOCUMENT_SUMMARY = "document_summary"
    STRUCTURED_EXTRACTION = "structured_extraction"
    SPEECH_TRANSCRIPTION = "speech_transcription"
    TRANSCRIPT_SUMMARY = "transcript_summary"
    AUDIO_SIMILARITY = "audio_similarity"
    SOUND_CLASSIFICATION = "sound_classification"
    IMAGE_UNDERSTANDING = "image_understanding"
    OCR = "ocr"
    VIDEO_ANALYSIS = "video_analysis"
    STRUCTURED_DATA_ANALYSIS = "structured_data_analysis"


@dataclass
class AIRequest:
    capability: AICapability
    payload: Any
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    provider: Optional[str] = None
    timeout_s: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AIResponse:
    request_id: str
    capability: AICapability
    status: str
    result: Any = None
    provider: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: int = 0
    sources: list[Any] = field(default_factory=list)
    similarity: Optional[float] = None
    warnings: list[str] = field(default_factory=list)
    error_code: Optional[str] = None


@dataclass
class AIStream:
    """Provider stream metadata and lazy text chunks for streaming callers."""
    provider: str
    model: str
    chunks: Iterator[str]


Handler = Callable[[AIRequest], AIResponse]


class AIOrchestrator:
    """Dispatches by capability; specialized work never falls through to an LLM."""

    def __init__(self, llm_factory: Callable[[Optional[str]], LLMProvider] = get_llm_provider):
        self._llm_factory = llm_factory
        self._handlers: Dict[AICapability, Handler] = {}

    def register(self, capability: AICapability, handler: Handler) -> None:
        self._handlers[capability] = handler

    def execute(self, request: AIRequest) -> AIResponse:
        started = time.perf_counter()
        timeout = request.timeout_s or settings.AI_REQUEST_TIMEOUT_S
        try:
            if request.capability in self._handlers:
                response = self._handlers[request.capability](request)
                response.request_id = request.request_id
                response.capability = request.capability
                response.status = "succeeded"
            elif request.capability in {
                AICapability.TEXT_GENERATION,
                AICapability.RAG_ANSWER,
                AICapability.DOCUMENT_SUMMARY,
                AICapability.STRUCTURED_EXTRACTION,
                AICapability.TRANSCRIPT_SUMMARY,
                AICapability.STRUCTURED_DATA_ANALYSIS,
            }:
                response = self._generate(request, timeout)
            else:
                raise LLMError(f"No service is configured for capability '{request.capability.value}'.")
        except Exception as exc:
            logger.warning("AI request %s failed for %s: %s", request.request_id, request.capability.value, type(exc).__name__)
            return AIResponse(
                request_id=request.request_id,
                capability=request.capability,
                status="failed",
                processing_time_ms=int((time.perf_counter() - started) * 1000),
                error_code=type(exc).__name__,
                warnings=["The requested AI capability is temporarily unavailable."],
            )
        response.processing_time_ms = int((time.perf_counter() - started) * 1000)
        return response

    def stream(self, request: AIRequest) -> AIStream:
        """Create a stream through the same capability/provider selection as execute()."""
        if request.capability not in {
            AICapability.TEXT_GENERATION,
            AICapability.RAG_ANSWER,
            AICapability.DOCUMENT_SUMMARY,
            AICapability.STRUCTURED_EXTRACTION,
            AICapability.TRANSCRIPT_SUMMARY,
            AICapability.STRUCTURED_DATA_ANALYSIS,
        }:
            raise LLMError(f"No streaming service is configured for capability '{request.capability.value}'.")
        if not isinstance(request.payload, LLMRequest):
            raise ValueError("Text capabilities require an LLMRequest payload.")
        request.payload.metadata["timeout_s"] = request.timeout_s or settings.AI_REQUEST_TIMEOUT_S
        provider = self._llm_factory(request.provider)
        if (request.payload.media_parts or request.payload.images) and not getattr(provider, "supports_multimodal", False):
            raise LLMError("The configured AI provider does not support attached media.")
        return AIStream(
            provider=str(getattr(provider, "provider_name", "unknown")),
            model=str(getattr(provider, "model_name", "unknown")),
            chunks=iter(provider.stream(request.payload)),
        )

    def _generate(self, request: AIRequest, timeout_s: float) -> AIResponse:
        if not isinstance(request.payload, LLMRequest):
            raise ValueError("Text capabilities require an LLMRequest payload.")
        provider = self._llm_factory(request.provider)
        if (request.payload.media_parts or request.payload.images) and not getattr(provider, "supports_multimodal", False):
            raise LLMError("The configured AI provider does not support attached media.")
        retries = max(0, min(settings.AI_MAX_RETRIES, 3))
        deadline = time.monotonic() + timeout_s
        for attempt in range(retries + 1):
            remaining_s = deadline - time.monotonic()
            if remaining_s <= 0:
                raise TimeoutError("AI provider exceeded the configured request timeout.")
            request.payload.metadata["timeout_s"] = remaining_s
            started = time.monotonic()
            try:
                result: LLMResponse = provider.generate(request.payload)
                if time.monotonic() - started > remaining_s:
                    raise TimeoutError("AI provider exceeded the configured request timeout.")
                return AIResponse(
                    request_id=request.request_id,
                    capability=request.capability,
                    status="succeeded",
                    result=result.content,
                    provider=result.provider_name,
                    model=result.model_name,
                    processing_time_ms=result.latency_ms,
                )
            except (TimeoutError, LLMError):
                if attempt >= retries:
                    raise
        raise LLMError("AI provider did not return a result.")


ai_orchestrator = AIOrchestrator()
