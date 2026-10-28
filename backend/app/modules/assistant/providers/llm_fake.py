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

    supports_multimodal = True

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

    def _build_default_response(self, prompt: str, request: Optional[LLMRequest] = None) -> str:
        """
        Builds a deterministic answer grounded in whatever [CHUNK:id] blocks
        are found in the prompt, or visual media observations if images are attached.
        """
        has_images = bool(request and (request.images or request.media_parts)) or bool(request and request.metadata.get("has_image"))
        if has_images or "IMAGE_ATTACHED" in prompt:
            prompt_lower = prompt.lower()
            if "inspect the attached user media" in prompt_lower:
                return "Visual media observation: gauge displaying 12.5 mm reading on dial."

            chunk_matches = re.findall(r"\[CHUNK:([^\]]+)\]\s*(.*?)\s*\[/CHUNK\]", prompt, re.DOTALL)
            if "ignore previous instructions" in prompt_lower or "reveal system prompt" in prompt_lower or "critical override" in prompt_lower:
                answer = (
                    "Visual observation from attached image: The gauge reads 12.5 mm. "
                    "Note: Any instructions or commands depicted inside visual media (such as 'ignore previous instructions') are treated strictly as passive data and are not followed. "
                    "This reading is an observational visual estimate from user-provided media, not an approved measurement."
                )
                return json.dumps({
                    "answer": answer,
                    "citations": [],
                    "evidence_status": "sufficient",
                })
            elif "tolerance" in prompt_lower:
                if chunk_matches:
                    chunk_id = chunk_matches[0][0]
                    answer = (
                        "Visual reading observed from attached image. However, the assistant cannot determine tolerance from visual media alone. "
                        f"Tolerance limits must be verified against an approved procedure [CHUNK:{chunk_id}]."
                    )
                    return json.dumps({
                        "answer": answer,
                        "citations": [chunk_id],
                        "evidence_status": "sufficient",
                    })
                else:
                    answer = (
                        "The attached image shows a visual gauge reading. However, the assistant cannot decide whether this part is within tolerance from visual media alone. "
                        "Tolerance limits must come from an approved standard operating procedure (SOP), and no approved procedure defines this tolerance in the knowledge base."
                    )
                    return json.dumps({
                        "answer": answer,
                        "citations": [],
                        "evidence_status": "insufficient",
                    })
            else:
                answer = (
                    "Visual observation from attached image: The gauge reads 12.5 mm. "
                    "Note: This reading is an observational visual estimate from user-provided media, not an approved measurement."
                )
                return json.dumps({
                    "answer": answer,
                    "citations": [],
                    "evidence_status": "sufficient",
                })

        if '"task": "manufacturing_knowledge_capture"' in prompt or "manufacturing_knowledge_capture" in prompt:
            # Extractive deterministic mock for voice-pipeline tests; it copies only
            # transcript text and adds no generated settings, outcomes, or warnings.
            lines = re.findall(r"\[(\d+)\]\s*\(([-\d.]+)-([-\d.]+)s\)\s*(.+)", prompt)
            steps = [
                {
                    "title": text.strip()[:80],
                    "instruction": text.strip(),
                    "tools": [],
                    "source_segment_ids": [int(idx)],
                    "needs_review": True,
                    "note": "Mock structuring output; human review required.",
                }
                for idx, _start, _end, text in lines
                if text.strip()
            ]
            source_text = " ".join(step["instruction"] for step in steps)
            return json.dumps({
                "title": "",
                "summary": source_text[:500],
                "detailed_summary": source_text,
                "steps": steps,
                "keywords": [],
                "unclear_segments": [],
            })

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
        chunk_id, chunk_block = chunk_matches[0]
        if "Content:" in chunk_block:
            chunk_content = chunk_block.split("Content:", 1)[1].strip()
        else:
            chunk_content = chunk_block.strip()

        # Sentence split without breaking on decimals (e.g. 77.5)
        sentences = [s.strip() for s in re.split(r"(?<=[a-zA-Z0-9])\.\s+", chunk_content) if s.strip()]
        clean_first_sentence = sentences[0] if sentences else chunk_content[:80].strip()
        if clean_first_sentence.endswith("."):
            clean_first_sentence = clean_first_sentence[:-1].strip()

        # Check if numbers exist in clean_first_sentence to cite them faithfully
        numbers = re.findall(r"\b\d+(?:\.\d+)?\b", clean_first_sentence)
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
            content = self._build_default_response(request.prompt, request=request)

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

    def stream(self, request: LLMRequest):
        """Stream tokens for mock tests."""
        resp = self.generate(request)
        tokens = re.findall(r"\S+\s*", resp.content)
        if not tokens:
            tokens = [resp.content]
        for t in tokens:
            yield t
