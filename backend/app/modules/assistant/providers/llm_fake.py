import json
import re
import time
from typing import Optional, Dict, Any, List
from app.modules.assistant.providers.llm_base import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
)


class FakeLLMProvider(LLMProvider):
    """
    Deterministic in-memory LLM provider for tests and local development.
    Requires no external network connection and produces reproducible answers.
    Supports injecting canned responses, JSON payloads, and simulated errors.
    """

    def __init__(self, model_name: str = "fake-claude-3-5"):
        self.provider_name = "fake"
        self.model_name = model_name
        self.call_count = 0
        self.recorded_requests: List[LLMRequest] = []
        self._canned_response: Optional[str] = None
        self._canned_error: Optional[Exception] = None
        self.latency_ms = 15

    def set_response(self, text: str) -> None:
        """Force a specific text output for subsequent calls."""
        self._canned_response = text

    def set_json_response(self, data: Dict[str, Any]) -> None:
        """Force a JSON response for subsequent calls."""
        self._canned_response = json.dumps(data)

    def set_error(self, exc: Exception) -> None:
        """Force an exception on subsequent calls to simulate timeouts or rate limits."""
        self._canned_error = exc

    def reset(self) -> None:
        """Clear recorded requests and overrides."""
        self.call_count = 0
        self.recorded_requests.clear()
        self._canned_response = None
        self._canned_error = None

    def _build_default_response(self, prompt: str) -> str:
        """
        Builds a deterministic answer grounded in whatever [CHUNK:id] blocks
        are found in the prompt.
        """
        # Look for [CHUNK:<id>] blocks
        chunk_matches = re.findall(r"\[CHUNK:([^\]]+)\]\s*(.*?)\s*\[/CHUNK\]", prompt, re.DOTALL)

        if not chunk_matches:
            # No chunks present in prompt
            output = {
                "answer": "No relevant technical documentation was found to answer this question.",
                "citations": [],
                "evidence_status": "insufficient",
            }
            return json.dumps(output)

        # Extract first chunk info
        chunk_id, chunk_text = chunk_matches[0]
        # First sentence of chunk text
        clean_first_sentence = chunk_text.split(".")[0].strip()
        if not clean_first_sentence:
            clean_first_sentence = chunk_text[:80].strip()

        # Check if numbers exist in the chunk to cite them faithfully
        numbers = re.findall(r"\b\d+(?:\.\d+)?\b", chunk_text)
        num_phrase = f" (Specified parameter: {numbers[0]})" if numbers else ""

        output = {
            "answer": f"According to standard procedure: {clean_first_sentence}.{num_phrase}",
            "citations": [chunk_id],
            "evidence_status": "sufficient",
        }
        return json.dumps(output)

    def generate(self, request: LLMRequest) -> LLMResponse:
        self.call_count += 1
        self.recorded_requests.append(request)

        if self._canned_error:
            err = self._canned_error
            raise err

        if self._canned_response is not None:
            content = self._canned_response
        else:
            content = self._build_default_response(request.prompt)

        return LLMResponse(
            content=content,
            provider_name=self.provider_name,
            model_name=self.model_name,
            latency_ms=self.latency_ms,
            raw_output=content,
            prompt_tokens=len(request.prompt.split()),
            completion_tokens=len(content.split()),
        )

    async def generate_async(self, request: LLMRequest) -> LLMResponse:
        return self.generate(request)
