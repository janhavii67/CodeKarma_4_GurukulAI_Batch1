import asyncio
import re
import time
from typing import Optional, Iterator, List
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

    Features:
    - Zero-downtime multi-key fallback rotation (pipe '|' separated keys in GEMINI_API_KEY).
    - Multi-model fallback across candidate models (e.g. gemini-flash-lite-latest, gemini-3.8-flash, etc.).
    - Robust exception handling and transient error backoff.
    """

    supports_multimodal = True

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        raw_key = api_key or getattr(settings, "GEMINI_API_KEY", "")
        self.api_keys = self._parse_keys(raw_key)
        if not self.api_keys:
            raise LLMAuthenticationError(
                "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment or .env file."
            )
        self.current_key_idx = 0
        self.api_key = self.api_keys[0]

        self.model_name = (
            model_name
            or getattr(settings, "GEMINI_MODEL", None)
            or getattr(settings, "ASSISTANT_LLM_MODEL", None)
            or "gemini-flash-lite-latest"
        )
        self.provider_name = "gemini"
        self._client_timeout_s = float(settings.AI_REQUEST_TIMEOUT_S)
        self.client = self._new_client(self.api_key, self._client_timeout_s)

    @staticmethod
    def _new_client(api_key: str, timeout_s: float):
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=max(1, int(timeout_s * 1000)),
                # Retries are bounded by the provider's overall request deadline.
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )

    def _bound_client_timeout(self, remaining_s: float) -> None:
        """Shorten the SDK timeout as fallback attempts consume the request budget."""
        timeout_s = max(0.001, min(self._client_timeout_s, remaining_s))
        if timeout_s < self._client_timeout_s:
            self._client_timeout_s = timeout_s
            self.client = self._new_client(self.api_key, timeout_s)

    def _prepare_request_timeout(self, timeout_s: float) -> float:
        timeout_s = max(0.001, timeout_s)
        if timeout_s != self._client_timeout_s:
            self._client_timeout_s = timeout_s
            self.client = self._new_client(self.api_key, timeout_s)
        return time.monotonic() + timeout_s

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

    def _rotate_key(self, remaining_s: Optional[float] = None) -> str:
        """Rotates to the next available API key and updates self.client."""
        if not self.api_keys:
            return ""
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        self.api_key = self.api_keys[self.current_key_idx]
        timeout_s = min(float(settings.AI_REQUEST_TIMEOUT_S), remaining_s) if remaining_s else float(settings.AI_REQUEST_TIMEOUT_S)
        self._client_timeout_s = timeout_s
        self.client = self._new_client(self.api_key, timeout_s)
        logger.info(
            f"Rotated Gemini API key to slot {self.current_key_idx + 1}/{len(self.api_keys)}"
        )
        return self.api_key

    def _get_candidate_models(self, preferred_model: Optional[str] = None) -> List[str]:
        """Returns ordered list of candidate models for fallback on quota limits."""
        candidates: List[str] = []
        if preferred_model:
            candidates.append(preferred_model)
        if self.model_name and self.model_name not in candidates:
            candidates.append(self.model_name)
        if hasattr(settings, "gemini_fallback_models"):
            for m in settings.gemini_fallback_models:
                if m not in candidates:
                    candidates.append(m)
        defaults = [
            "gemini-flash-lite-latest",
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
        ]
        for d in defaults:
            if d not in candidates:
                candidates.append(d)
        return candidates

    def _build_contents(self, request: LLMRequest):
        raw_media = list(getattr(request, "media_parts", None) or [])
        raw_media.extend(getattr(request, "images", None) or request.metadata.get("images") or [])
        if not raw_media:
            return request.prompt
        media = []
        seen = set()
        for item in raw_media:
            item_id = id(item)
            if item_id not in seen:
                seen.add(item_id)
                media.append(item)
        parts = [request.prompt]
        for media_part in media:
            data = media_part.get("data")
            mime = media_part.get("mime_type") or media_part.get("mimeType")
            if not isinstance(data, bytes) or not mime:
                raise LLMError("A media attachment was not prepared correctly.")
            parts.append(types.Part.from_bytes(data=data, mime_type=str(mime)))
        return parts

    @staticmethod
    def _is_rate_limit_or_quota(exc: Exception) -> bool:
        err_str = str(exc).lower()
        return any(
            term in err_str
            for term in ["429", "resource_exhausted", "quota", "rate limit", "too many requests"]
        )

    @staticmethod
    def _is_auth_error(exc: Exception) -> bool:
        err_str = str(exc).lower()
        return any(
            term in err_str
            for term in ["401", "403", "unauthenticated", "api_key_invalid", "permission_denied"]
        )

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        err_str = str(exc).lower()
        return any(
            term in err_str
            for term in ["503", "unavailable", "high demand", "deadline", "timeout", "temporarily unavailable"]
        )

    def generate(self, request: LLMRequest) -> LLMResponse:
        """Synchronously generate text using Gemini models with multi-key and model fallback."""
        start_t = time.perf_counter()
        timeout_s = max(0.001, float(request.metadata.get("timeout_s", settings.AI_REQUEST_TIMEOUT_S)))
        deadline = self._prepare_request_timeout(timeout_s)
        preferred_model = request.metadata.get("model")
        candidate_models = self._get_candidate_models(preferred_model)

        last_exc: Optional[Exception] = None
        num_keys = max(1, len(self.api_keys))

        for model in candidate_models:
            for key_attempt in range(num_keys):
                remaining_s = deadline - time.monotonic()
                if remaining_s <= 0:
                    raise LLMTimeoutError("Gemini generation exceeded the configured request timeout.")
                self._bound_client_timeout(remaining_s)
                try:
                    config = types.GenerateContentConfig(
                        system_instruction=request.system_prompt,
                        temperature=request.temperature,
                        max_output_tokens=request.max_tokens,
                    )
                    response = self.client.models.generate_content(
                        model=model,
                        contents=self._build_contents(request),
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
                    last_exc = exc
                    if self._is_rate_limit_or_quota(exc) or self._is_auth_error(exc):
                        if key_attempt < num_keys - 1:
                            logger.warning(
                                f"Gemini request failed on model '{model}' with key slot {self.current_key_idx + 1}. Rotating to next API key..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            continue
                        else:
                            logger.warning(
                                f"All {num_keys} API keys exhausted for model '{model}'. Attempting next fallback model..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            break
                    elif self._is_transient_error(exc):
                        remaining_s = deadline - time.monotonic()
                        if remaining_s <= 1.0:
                            raise LLMTimeoutError("Gemini generation exceeded the configured request timeout.") from exc
                        logger.warning(f"Gemini transient error on model '{model}'. Retrying in 1s...")
                        time.sleep(min(1.0, remaining_s))
                        continue
                    else:
                        self._handle_exception(exc)

        if last_exc:
            self._handle_exception(last_exc)
        raise LLMError("Gemini generation failed: all models and API keys exhausted.")

    async def generate_async(self, request: LLMRequest) -> LLMResponse:
        """Asynchronously generate text using Gemini models with multi-key and model fallback."""
        start_t = time.perf_counter()
        timeout_s = max(0.001, float(request.metadata.get("timeout_s", settings.AI_REQUEST_TIMEOUT_S)))
        deadline = self._prepare_request_timeout(timeout_s)
        preferred_model = request.metadata.get("model")
        candidate_models = self._get_candidate_models(preferred_model)

        last_exc: Optional[Exception] = None
        num_keys = max(1, len(self.api_keys))

        for model in candidate_models:
            for key_attempt in range(num_keys):
                remaining_s = deadline - time.monotonic()
                if remaining_s <= 0:
                    raise LLMTimeoutError("Gemini generation exceeded the configured request timeout.")
                self._bound_client_timeout(remaining_s)
                try:
                    config = types.GenerateContentConfig(
                        system_instruction=request.system_prompt,
                        temperature=request.temperature,
                        max_output_tokens=request.max_tokens,
                    )
                    response = await self.client.aio.models.generate_content(
                        model=model,
                        contents=self._build_contents(request),
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
                    last_exc = exc
                    if self._is_rate_limit_or_quota(exc) or self._is_auth_error(exc):
                        if key_attempt < num_keys - 1:
                            logger.warning(
                                f"Gemini async request failed on model '{model}' with key slot {self.current_key_idx + 1}. Rotating to next API key..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            continue
                        else:
                            logger.warning(
                                f"All {num_keys} API keys exhausted for model '{model}'. Attempting next fallback model..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            break
                    elif self._is_transient_error(exc):
                        remaining_s = deadline - time.monotonic()
                        if remaining_s <= 1.0:
                            raise LLMTimeoutError("Gemini generation exceeded the configured request timeout.") from exc
                        logger.warning(f"Gemini async transient error on model '{model}'. Retrying in 1s...")
                        await asyncio.sleep(min(1.0, remaining_s))
                        continue
                    else:
                        self._handle_exception(exc)

        if last_exc:
            self._handle_exception(last_exc)
        raise LLMError("Gemini async generation failed: all models and API keys exhausted.")

    def stream(self, request: LLMRequest) -> Iterator[str]:
        """Synchronously stream text token chunks using Gemini streaming API with multi-key and model fallback."""
        preferred_model = request.metadata.get("model")
        timeout_s = max(0.001, float(request.metadata.get("timeout_s", settings.AI_REQUEST_TIMEOUT_S)))
        deadline = self._prepare_request_timeout(timeout_s)
        candidate_models = self._get_candidate_models(preferred_model)

        last_exc: Optional[Exception] = None
        num_keys = max(1, len(self.api_keys))

        for model in candidate_models:
            for key_attempt in range(num_keys):
                remaining_s = deadline - time.monotonic()
                if remaining_s <= 0:
                    raise LLMTimeoutError("Gemini streaming exceeded the configured request timeout.")
                self._bound_client_timeout(remaining_s)
                yielded_any = False
                try:
                    config = types.GenerateContentConfig(
                        system_instruction=request.system_prompt,
                        temperature=request.temperature,
                        max_output_tokens=request.max_tokens,
                    )
                    response_stream = self.client.models.generate_content_stream(
                        model=model,
                        contents=self._build_contents(request),
                        config=config,
                    )
                    for chunk in response_stream:
                        if time.monotonic() >= deadline:
                            raise LLMTimeoutError("Gemini streaming exceeded the configured request timeout.")
                        if chunk.text:
                            yielded_any = True
                            yield chunk.text
                    return
                except Exception as exc:
                    last_exc = exc
                    # If tokens have already been emitted, we cannot restart from scratch
                    if yielded_any:
                        self._handle_exception(exc)
                        return

                    if self._is_rate_limit_or_quota(exc) or self._is_auth_error(exc):
                        if key_attempt < num_keys - 1:
                            logger.warning(
                                f"Gemini stream failed on model '{model}' with key slot {self.current_key_idx + 1} ({type(exc).__name__}). Rotating to next API key..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            continue
                        else:
                            logger.warning(
                                f"All {num_keys} API keys exhausted for model '{model}'. Attempting fallback model..."
                            )
                            self._rotate_key(deadline - time.monotonic())
                            break
                    elif self._is_transient_error(exc):
                        remaining_s = deadline - time.monotonic()
                        if remaining_s <= 1.0:
                            raise LLMTimeoutError("Gemini streaming exceeded the configured request timeout.") from exc
                        logger.warning(f"Gemini transient streaming error on model '{model}'. Waiting 1s...")
                        time.sleep(min(1.0, remaining_s))
                        continue
                    else:
                        self._handle_exception(exc)

        if last_exc:
            self._handle_exception(last_exc)
        raise LLMError("Gemini streaming failed: all models and API keys exhausted.")

    def _handle_exception(self, exc: Exception):
        """Map Gemini API exceptions to domain errors without logging secrets or keys."""
        err_type = type(exc).__name__
        msg = str(exc)
        lower_msg = msg.lower()
        logger.error(f"Gemini API error [{err_type}]: operation failed.")

        if (
            "api_key" in lower_msg
            or "unauthenticated" in lower_msg
            or "401" in lower_msg
            or "403" in lower_msg
            or "permission_denied" in lower_msg
        ):
            raise LLMAuthenticationError("Gemini API authentication failed. Check API key configuration.") from exc
        if (
            "resource_exhausted" in lower_msg
            or "429" in lower_msg
            or "rate limit" in lower_msg
            or "quota" in lower_msg
        ):
            raise LLMRateLimitError("Gemini API rate limit exceeded. Please retry after backoff.") from exc
        if "deadline" in lower_msg or "timeout" in lower_msg:
            raise LLMTimeoutError("Gemini API call timed out.") from exc
        raise LLMError(f"Gemini generation error: {err_type}") from exc


# Alias for clean replaceable provider naming
GeminiProvider = GeminiLLMProvider
