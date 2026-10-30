import json
import math
import pytest
from app.core.config import settings
from app.modules.assistant.providers import (
    LLMRequest,
    LLMResponse,
    LLMExternalDisabledError,
    LLMTimeoutError,
    LLMError,
    get_llm_provider,
    FakeLLMProvider,
    EmbeddingRequest,
    get_embedding_provider,
    FakeEmbeddingProvider,
)


def test_fake_llm_provider_default_grounded_generation():
    """
    FakeLLMProvider generates deterministic answers citing chunks from the prompt.
    """
    provider = FakeLLMProvider()
    prompt = """
You are a manufacturing assistant.
[CHUNK:chk-vf2-warmup]
Run spindle warmup cycle for 15 minutes at 5000 RPM before high speed milling.
[/CHUNK]
Question: How long should I warm up the spindle?
"""
    req = LLMRequest(prompt=prompt, request_id="test-req-1")
    resp = provider.generate(req)

    assert resp.provider_name == "fake"
    assert resp.latency_ms > 0
    assert provider.call_count == 1
    assert len(provider.recorded_requests) == 1

    parsed = json.loads(resp.content)
    assert "spindle warmup" in parsed["answer"].lower()
    assert "chk-vf2-warmup" in parsed["citations"]
    assert parsed["evidence_status"] == "sufficient"


def test_fake_llm_provider_no_chunks_reports_insufficient():
    """
    When no chunks are present, default output reports insufficient evidence.
    """
    provider = FakeLLMProvider()
    req = LLMRequest(prompt="What is the torque for head bolts with no context?")
    resp = provider.generate(req)

    parsed = json.loads(resp.content)
    assert parsed["evidence_status"] == "insufficient"
    assert len(parsed["citations"]) == 0


def test_fake_llm_canned_response_and_errors():
    """
    Verify canned response and simulated error injection for testing downstream retry logic.
    """
    provider = FakeLLMProvider()
    req = LLMRequest(prompt="Test prompt")

    # Canned JSON
    provider.set_json_response({"answer": "Canned custom response", "citations": ["chk-99"]})
    resp = provider.generate(req)
    parsed = json.loads(resp.content)
    assert parsed["answer"] == "Canned custom response"
    assert parsed["citations"] == ["chk-99"]

    # Injected error
    provider.set_error(LLMTimeoutError("Simulation timeout"))
    with pytest.raises(LLMTimeoutError):
        provider.generate(req)

    # Reset
    provider.reset()
    assert provider.call_count == 0
    assert len(provider.recorded_requests) == 0


@pytest.mark.asyncio
async def test_fake_llm_async_generate():
    """
    Async generation matches sync output.
    """
    provider = FakeLLMProvider()
    req = LLMRequest(prompt="[CHUNK:chk-async] Verify async generation. [/CHUNK]")
    resp = await provider.generate_async(req)
    assert resp.provider_name == "fake"
    parsed = json.loads(resp.content)
    assert "chk-async" in parsed["citations"]


def test_safety_guard_blocks_external_llm():
    """
    Guarantees that external LLM calls cannot be initiated when ALLOW_EXTERNAL_LLM=False.
    Must raise LLMExternalDisabledError without any network traffic.
    """
    original_setting = settings.ALLOW_EXTERNAL_LLM
    try:
        settings.ALLOW_EXTERNAL_LLM = False
        with pytest.raises(LLMExternalDisabledError) as exc_info:
            get_llm_provider("anthropic")
        assert "External LLM calls are disabled" in str(exc_info.value)
    finally:
        settings.ALLOW_EXTERNAL_LLM = original_setting


def test_unknown_provider_raises_error():
    with pytest.raises(LLMError) as exc_info:
        get_llm_provider("non_existent_provider")
    assert "Unknown LLM provider" in str(exc_info.value)


def test_fake_embedding_provider_deterministic_math():
    """
    Verify FakeEmbeddingProvider produces normalized vectors with identical output
    for identical text and zero network dependency.
    """
    provider = get_embedding_provider("fake")
    assert isinstance(provider, FakeEmbeddingProvider)

    text_a = "HAAS VF-2 spindle speed 12000 RPM"
    text_b = "HAAS VF-2 spindle speed 12000 RPM"
    text_c = "Hydraulic pressure relief valve adjustment"

    v_a = provider.embed_query(text_a)
    v_b = provider.embed_query(text_b)
    v_c = provider.embed_query(text_c)

    # Identical text produces exact same vector
    assert v_a == v_b
    assert v_a != v_c
    assert len(v_a) == provider.dimension

    # Unit vector magnitude check (approx 1.0)
    mag_a = math.sqrt(sum(x * x for x in v_a))
    assert math.isclose(mag_a, 1.0, rel_tol=1e-3)

    # Batch embedding
    batch_resp = provider.embed_texts(EmbeddingRequest(texts=[text_a, text_c]))
    assert len(batch_resp.embeddings) == 2
    assert batch_resp.embeddings[0] == v_a
    assert batch_resp.embeddings[1] == v_c


def test_gemini_provider_guard_and_initialization():
    """
    Verify Gemini provider requires API key and initializes with google-genai Client.
    """
    from app.modules.assistant.providers import GeminiLLMProvider, LLMAuthenticationError

    # 1. Without API key, fails with LLMAuthenticationError
    original_key = settings.GEMINI_API_KEY
    original_allow = settings.ALLOW_EXTERNAL_LLM
    try:
        settings.GEMINI_API_KEY = ""
        settings.ALLOW_EXTERNAL_LLM = False
        with pytest.raises(LLMExternalDisabledError):
            get_llm_provider("gemini")

        settings.ALLOW_EXTERNAL_LLM = True
        with pytest.raises(LLMAuthenticationError):
            get_llm_provider("gemini")

        # 2. With mock API key, successfully instantiates GeminiLLMProvider
        settings.GEMINI_API_KEY = "mock-gemini-api-key-xyz123"
        provider = get_llm_provider("gemini")
        assert isinstance(provider, GeminiLLMProvider)
        assert provider.provider_name == "gemini"
        assert provider.model_name == settings.GEMINI_MODEL
    finally:
        settings.GEMINI_API_KEY = original_key
        settings.ALLOW_EXTERNAL_LLM = original_allow


def test_gemini_http_client_uses_configured_timeout_and_disables_nested_retries(monkeypatch):
    from app.modules.assistant.providers.llm_gemini import GeminiLLMProvider

    client_args = []

    def client_stub(**kwargs):
        client_args.append(kwargs)
        return object()

    monkeypatch.setattr("app.modules.assistant.providers.llm_gemini.genai.Client", client_stub)
    provider = GeminiLLMProvider(api_key="synthetic-test-key", model_name="synthetic-test-model")

    options = client_args[0]["http_options"]
    assert options.timeout == int(settings.AI_REQUEST_TIMEOUT_S * 1000)
    assert options.retry_options.attempts == 1

    provider._bound_client_timeout(2.5)
    shortened_options = client_args[1]["http_options"]
    assert shortened_options.timeout == 2500
    assert shortened_options.retry_options.attempts == 1


def test_gemini_embedding_rate_limit_tries_each_key_once_then_cools_down(monkeypatch):
    from types import SimpleNamespace
    from app.modules.assistant.providers import embedding_gemini
    from app.modules.assistant.providers.embedding_gemini import GeminiEmbeddingProvider
    from app.modules.assistant.providers.llm_base import LLMRateLimitError

    monkeypatch.setattr(embedding_gemini, "_RATE_LIMITED_KEYS_UNTIL", {})
    calls = []

    class Models:
        def embed_content(self, **_kwargs):
            calls.append("request")
            raise RuntimeError("429 RESOURCE_EXHAUSTED test quota")

    monkeypatch.setattr(
        embedding_gemini.genai,
        "Client",
        lambda **_kwargs: SimpleNamespace(models=Models()),
    )
    monkeypatch.setattr(embedding_gemini.time, "sleep", lambda _seconds: pytest.fail("Rate limits should not sleep per request"))

    provider = GeminiEmbeddingProvider(api_key="key-a|key-b|key-c", model_name="test-embedding-model")
    with pytest.raises(LLMRateLimitError):
        provider.embed_query("CT daily quality control")

    assert len(calls) == 3
    assert len(embedding_gemini._RATE_LIMITED_KEYS_UNTIL) == 3
    assert all(len(fingerprint) == 64 for fingerprint in embedding_gemini._RATE_LIMITED_KEYS_UNTIL)

    # A new provider instance shares cooldown state and fails without hitting the API again.
    next_provider = GeminiEmbeddingProvider(api_key="key-a|key-b|key-c", model_name="test-embedding-model")
    with pytest.raises(LLMRateLimitError):
        next_provider.embed_query("ECG lead placement")
    assert len(calls) == 3


def test_gemini_tries_next_model_when_configured_model_is_unavailable(monkeypatch):
    from types import SimpleNamespace
    from app.modules.assistant.providers.llm_gemini import GeminiLLMProvider

    calls = []

    class Models:
        def generate_content(self, *, model, **_kwargs):
            calls.append(model)
            if model == "removed-model":
                raise RuntimeError("404 model not found")
            return SimpleNamespace(text="A grounded response.", usage_metadata=None)

    client = SimpleNamespace(models=Models())
    monkeypatch.setattr("app.modules.assistant.providers.llm_gemini.genai.Client", lambda **_kwargs: client)
    provider = GeminiLLMProvider(api_key="synthetic-test-key", model_name="removed-model")
    monkeypatch.setattr(provider, "_get_candidate_models", lambda _preferred=None: ["removed-model", "working-model"])

    result = provider.generate(LLMRequest(prompt="Inspect this image", media_parts=[{"mime_type": "image/jpeg", "data": b"\xff\xd8\xffsample"}]))

    assert calls == ["removed-model", "working-model"]
    assert result.content == "A grounded response."
    assert result.model_name == "working-model"


def test_gemini_classifies_sdk_network_timeouts_as_transient():
    import httpx
    from app.modules.assistant.providers.llm_gemini import GeminiLLMProvider

    assert GeminiLLMProvider._is_transient_error(httpx.ReadTimeout(""))
    assert GeminiLLMProvider._is_transient_error(httpx.ConnectError("network unavailable"))

