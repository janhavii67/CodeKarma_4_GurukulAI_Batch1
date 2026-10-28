import pytest

from app.modules.assistant.providers.llm_base import LLMError, LLMRequest, LLMResponse
from app.services.ai_orchestrator import AIRequest, AICapability, AIOrchestrator


class StubLLM:
    provider_name = "stub"
    model_name = "stub-model"

    def __init__(self, error=None):
        self.error = error
        self.calls = 0

    def generate(self, request):
        self.calls += 1
        if self.error:
            raise self.error
        return LLMResponse("answer", "stub", "stub-model", 2)

    def stream(self, request):
        self.calls += 1
        if self.error:
            raise self.error
        yield "first "
        yield "second"


def test_text_response_is_standardized():
    provider = StubLLM()
    service = AIOrchestrator(lambda name: provider)
    response = service.execute(AIRequest(AICapability.TEXT_GENERATION, LLMRequest("prompt")))
    assert response.status == "succeeded"
    assert response.result == "answer"
    assert response.provider == "stub"
    assert response.request_id


def test_rag_uses_configured_text_provider_and_preserves_request_id():
    provider = StubLLM()
    service = AIOrchestrator(lambda name: provider)
    response = service.execute(AIRequest(AICapability.RAG_ANSWER, LLMRequest("prompt"), request_id="trace-1"))
    assert response.request_id == "trace-1"
    assert response.capability == AICapability.RAG_ANSWER
    assert provider.calls == 1


def test_rag_stream_uses_configured_provider_and_exposes_metadata():
    provider = StubLLM()
    service = AIOrchestrator(lambda name: provider)
    streamed = service.stream(AIRequest(AICapability.RAG_ANSWER, LLMRequest("prompt")))
    assert streamed.provider == "stub"
    assert streamed.model == "stub-model"
    assert "".join(streamed.chunks) == "first second"
    assert provider.calls == 1


def test_audio_capability_requires_dedicated_handler():
    provider = StubLLM()
    service = AIOrchestrator(lambda name: provider)
    response = service.execute(AIRequest(AICapability.AUDIO_SIMILARITY, {"audio": "payload"}))
    assert response.status == "failed"
    assert response.error_code == "LLMError"
    assert provider.calls == 0


def test_audio_capability_uses_registered_handler():
    provider = StubLLM()
    service = AIOrchestrator(lambda name: provider)
    service.register(AICapability.AUDIO_SIMILARITY, lambda req: __import__(
        "app.services.ai_orchestrator", fromlist=["AIResponse"]
    ).AIResponse(req.request_id, req.capability, "succeeded", result={"similarity": 0.9}, similarity=0.9))
    response = service.execute(AIRequest(AICapability.AUDIO_SIMILARITY, {"clip": "x"}))
    assert response.similarity == 0.9
    assert provider.calls == 0


def test_provider_failure_is_returned_as_failure_without_fake_content():
    service = AIOrchestrator(lambda name: StubLLM(LLMError("offline")))
    response = service.execute(AIRequest(AICapability.TEXT_GENERATION, LLMRequest("prompt")))
    assert response.status == "failed"
    assert response.result is None
    assert response.warnings
