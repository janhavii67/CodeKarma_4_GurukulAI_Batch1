import time
from typing import Optional
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.logging import logger
from app.modules.assistant.providers.llm_base import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMError,
    LLMAuthenticationError,
    LLMTimeoutError,
    LLMRateLimitError,
)


class GeminiLLMProvider(LLMProvider):
    """
    Google Gemini LLM provider for the Industrial Knowledge Assistant.
    Powers Explainable AI (XAI) with transparent rationale, verified citations,
    and technical grounding for manufacturing shopfloors.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self.api_key = api_key or settings.GEMINI_API_KEY
        if not self.api_key:
            raise LLMAuthenticationError(
                "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment or .env file."
            )
        self.model_name = model_name or settings.ASSISTANT_LLM_MODEL or "gemini-2.5-flash"
        self.provider_name = "gemini"
        self.client = genai.Client(api_key=self.api_key)

    def generate(self, request: LLMRequest) -> LLMResponse:
        """Synchronously generate text using Gemini models."""
        start_t = time.perf_counter()
        model = request.metadata.get("model") or self.model_name
        try:
            config = types.GenerateContentConfig(
                system_instruction=request.system_prompt,
                temperature=request.temperature,
                max_output_tokens=request.max_tokens,
            )
            response = self.client.models.generate_content(
                model=model,
                contents=request.prompt,
                config=config,
            )
            latency_ms = int((time.perf_counter() - start_t) * 1000)
            text = response.text or ""

            prompt_tokens = None
            completion_tokens = None
            if response.usage_metadata:
                prompt_tokens = response.usage_metadata.prompt_token_count
                completion_tokens = response.usage_metadata.candidates_token_count

            return LLMResponse(
                content=text,
                provider_name=self.provider_name,
                model_name=model,
                latency_ms=latency_ms,
                raw_output=text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except Exception as exc:
            self._handle_exception(exc)

    async def generate_async(self, request: LLMRequest) -> LLMResponse:
        """Asynchronously generate text using Gemini models."""
        start_t = time.perf_counter()
        model = request.metadata.get("model") or self.model_name
        try:
            config = types.GenerateContentConfig(
                system_instruction=request.system_prompt,
                temperature=request.temperature,
                max_output_tokens=request.max_tokens,
            )
            response = await self.client.aio.models.generate_content(
                model=model,
                contents=request.prompt,
                config=config,
            )
            latency_ms = int((time.perf_counter() - start_t) * 1000)
            text = response.text or ""

            prompt_tokens = None
            completion_tokens = None
            if response.usage_metadata:
                prompt_tokens = response.usage_metadata.prompt_token_count
                completion_tokens = response.usage_metadata.candidates_token_count

            return LLMResponse(
                content=text,
                provider_name=self.provider_name,
                model_name=model,
                latency_ms=latency_ms,
                raw_output=text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except Exception as exc:
            self._handle_exception(exc)

    def _handle_exception(self, exc: Exception):
        """Map Gemini API exceptions to domain errors."""
        msg = str(exc)
        lower_msg = msg.lower()
        if (
            "api_key" in lower_msg
            or "unauthenticated" in lower_msg
            or "401" in lower_msg
            or "403" in lower_msg
            or "permission_denied" in lower_msg
        ):
            raise LLMAuthenticationError(f"Gemini API authentication failed: {msg}") from exc
        if "resource_exhausted" in lower_msg or "429" in lower_msg or "rate limit" in lower_msg:
            raise LLMRateLimitError(f"Gemini API rate limit exceeded: {msg}") from exc
        if "deadline" in lower_msg or "timeout" in lower_msg:
            raise LLMTimeoutError(f"Gemini API call timed out: {msg}") from exc
        raise LLMError(f"Gemini generation error: {msg}") from exc
