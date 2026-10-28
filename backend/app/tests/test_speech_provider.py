import asyncio
import sys
import wave
import struct
from types import ModuleType, SimpleNamespace
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.integrations.speech import openai_provider
from app.integrations.speech.factory import get_speech_provider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider
from app.integrations.speech import local_whisper_provider
from app.integrations.speech.local_whisper_provider import LocalWhisperProvider


def test_transcription_provider_requires_credentials_when_selected(monkeypatch):
    monkeypatch.setattr(settings, "STT_PROVIDER", "whisper_api")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    with pytest.raises(ValidationError) as error:
        get_speech_provider()

    assert error.value.code == "transcription_not_configured"


def test_mock_provider_only_available_in_test_environment(monkeypatch):
    monkeypatch.setattr(settings, "STT_PROVIDER", "mock")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    assert get_speech_provider().__class__.__name__ == "MockSpeechProvider"

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(ValidationError) as error:
        get_speech_provider()
    assert error.value.code == "transcription_not_configured"


def test_local_provider_is_explicit_and_never_falls_back_to_openai(monkeypatch):
    monkeypatch.setattr(settings, "STT_PROVIDER", "local_whisper")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "configured-but-not-used")
    monkeypatch.setattr(settings, "LOCAL_WHISPER_LANGUAGE", "en")
    monkeypatch.setattr(
        "app.integrations.speech.factory.OpenAIWhisperProvider",
        lambda **kwargs: pytest.fail("Local selection must never initialize OpenAI"),
    )

    provider = get_speech_provider()

    assert isinstance(provider, LocalWhisperProvider)
    assert provider.model_name == "base"
    assert provider.device == "cpu"
    assert provider.compute_type == "int8"
    assert provider.language == "en"


def test_unknown_provider_does_not_fall_back_to_openai(monkeypatch):
    monkeypatch.setattr(settings, "STT_PROVIDER", "typo_provider")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "configured-but-not-used")
    monkeypatch.setattr(
        "app.integrations.speech.factory.OpenAIWhisperProvider",
        lambda **kwargs: pytest.fail("Unknown selection must never initialize OpenAI"),
    )

    with pytest.raises(ValidationError) as error:
        get_speech_provider()
    assert error.value.code == "transcription_provider_invalid"


def test_local_whisper_loads_and_reuses_a_single_model(monkeypatch):
    constructions = []

    class FakeWhisperModel:
        def __init__(self, *args, **kwargs):
            constructions.append((args, kwargs))

    fake_module = ModuleType("faster_whisper")
    fake_module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_module)
    local_whisper_provider._clear_model_cache()
    try:
        first = local_whisper_provider._load_model("base", "cpu", "int8", 4)
        second = local_whisper_provider._load_model("base", "cpu", "int8", 4)
        assert first is second
        assert len(constructions) == 1
        assert constructions[0][1] == {
            "device": "cpu", "compute_type": "int8", "cpu_threads": 4, "num_workers": 1,
        }
    finally:
        local_whisper_provider._clear_model_cache()


def test_local_whisper_uses_english_for_short_english_transcription(monkeypatch, tmp_path):
    audio = tmp_path / "recording.wav"
    audio.write_bytes(b"local audio fixture")
    captured = {}

    class FakeModel:
        def transcribe(self, path, **kwargs):
            captured.update(path=path, kwargs=kwargs)
            return iter([
                SimpleNamespace(start=0.25, end=1.5, text="  Check the chuck pressure. "),
                SimpleNamespace(start=1.6, end=2.2, text="  "),
                SimpleNamespace(start=2.3, end=3.1, text="Stop the spindle."),
            ]), SimpleNamespace(language="en", language_probability=0.99)

    monkeypatch.setattr(local_whisper_provider, "_load_model", lambda *args: FakeModel())
    provider = LocalWhisperProvider(model="base", device="cpu", compute_type="int8", cpu_threads=4)
    # Test the synchronous inference core directly. Python 3.14's Proactor loop
    # cannot initialize in the restricted Windows test runner; the API worker
    # still exercises the async wrapper in integration environments.
    segments = provider._transcribe_sync(audio)

    assert [(part.idx, part.start_s, part.end_s, part.text) for part in segments] == [
        (1, 0.25, 1.5, "Check the chuck pressure."),
        (3, 2.3, 3.1, "Stop the spindle."),
    ]
    assert captured["path"] == str(audio)
    assert captured["kwargs"] == {"beam_size": 3, "vad_filter": True, "language": "en"}
    assert provider.model == "local_whisper:base"
    assert provider.detected_language == "en"


def test_local_whisper_language_auto_preserves_detection_option(monkeypatch, tmp_path):
    audio = tmp_path / "recording.wav"
    audio.write_bytes(b"local audio fixture")
    captured = {}

    class FakeModel:
        def transcribe(self, path, **kwargs):
            captured.update(path=path, kwargs=kwargs)
            return iter([SimpleNamespace(start=0, end=1, text="A short phrase.")]), SimpleNamespace(
                language="en", language_probability=0.7
            )

    monkeypatch.setattr(local_whisper_provider, "_load_model", lambda *args: FakeModel())
    provider = LocalWhisperProvider(language="auto")
    provider._transcribe_sync(audio)

    assert provider.language is None
    assert captured["kwargs"] == {"beam_size": 3, "vad_filter": True}
    assert provider.detected_language == "en"


def test_local_whisper_failure_is_sanitized_and_keeps_original_audio(monkeypatch, tmp_path):
    audio = tmp_path / "recording.wav"
    original_audio = b"original audio bytes"
    audio.write_bytes(original_audio)

    def unavailable(*_args):
        raise ValidationError(
            code="local_whisper_model_unavailable",
            message="The local Whisper model could not be loaded. The original recording is still saved.",
        )

    monkeypatch.setattr(local_whisper_provider, "_load_model", unavailable)
    with pytest.raises(ValidationError) as error:
        asyncio.run(asyncio.wait_for(LocalWhisperProvider().transcribe(audio), timeout=5))

    assert error.value.code == "local_whisper_model_unavailable"
    assert "original recording is still saved" in error.value.message
    assert "secret" not in error.value.message.lower()
    assert audio.read_bytes() == original_audio


def test_local_whisper_maps_pyav19_decoder_mismatch_to_actionable_error(monkeypatch, tmp_path):
    audio = tmp_path / "recording.webm"
    original_audio = b"original audio bytes"
    audio.write_bytes(original_audio)

    def incompatible_decoder(_path):
        raise TypeError("open() got an unexpected keyword argument 'metadata_errors'")

    monkeypatch.setattr(local_whisper_provider.LocalWhisperProvider, "_transcribe_sync", lambda self, path: incompatible_decoder(path))
    with pytest.raises(ValidationError) as error:
        asyncio.run(asyncio.wait_for(LocalWhisperProvider().transcribe(audio), timeout=5))

    assert error.value.code == "local_whisper_dependency_incompatible"
    assert "Reinstall backend requirements" in error.value.message
    assert "metadata_errors" not in error.value.message
    assert audio.read_bytes() == original_audio


def test_faster_whisper_audio_decoder_accepts_audio_with_pinned_pyav(tmp_path):
    av = pytest.importorskip("av")
    from faster_whisper.audio import decode_audio

    audio = tmp_path / "decoder-fixture.wav"
    with wave.open(str(audio), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(struct.pack("<16000h", *([0] * 16000)))

    decoded = decode_audio(str(audio))
    assert int(av.__version__.split(".")[0]) < 19
    assert len(decoded) == 16000


def test_openai_provider_parses_segments_without_exposing_credentials(monkeypatch, tmp_path):
    audio = tmp_path / "recording.wav"
    audio.write_bytes(b"audio bytes")
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"text": "Check the chuck pressure.", "segments": [{"start": 0.2, "end": 1.4, "text": " Check the chuck pressure. "}]}

    class FakeClient:
        def __init__(self, **kwargs):
            captured["timeout"] = kwargs["timeout"]

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, files, data):
            captured.update(url=url, headers=headers, filename=files["file"][0], mime=files["file"][2], data=data)
            return FakeResponse()

    monkeypatch.setattr(openai_provider.httpx, "AsyncClient", FakeClient)
    provider = OpenAIWhisperProvider(api_key="test-only-secret", model="whisper-1")
    segments = asyncio.run(asyncio.wait_for(provider.transcribe(audio), timeout=3))

    assert [(segment.idx, segment.start_s, segment.end_s, segment.text) for segment in segments] == [
        (1, 0.2, 1.4, "Check the chuck pressure.")
    ]
    assert captured["url"].endswith("/audio/transcriptions")
    assert captured["headers"]["Authorization"] == "Bearer test-only-secret"
    assert captured["data"]["model"] == "whisper-1"
    assert captured["mime"] == "audio/wav"


def test_openai_provider_returns_empty_for_silent_result(monkeypatch, tmp_path):
    audio = tmp_path / "silent.wav"
    audio.write_bytes(b"audio bytes")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"text": "   ", "segments": []}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(openai_provider.httpx, "AsyncClient", FakeClient)
    assert asyncio.run(asyncio.wait_for(OpenAIWhisperProvider(api_key="test-only-secret").transcribe(audio), timeout=3)) == []


def test_openai_provider_maps_timeout_to_safe_error(monkeypatch, tmp_path):
    audio = tmp_path / "recording.wav"
    audio.write_bytes(b"audio bytes")

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            raise httpx.ReadTimeout("simulated timeout")

    monkeypatch.setattr(openai_provider.httpx, "AsyncClient", FakeClient)
    with pytest.raises(ValidationError) as error:
        asyncio.run(asyncio.wait_for(OpenAIWhisperProvider(api_key="test-only-secret").transcribe(audio), timeout=3))

    assert error.value.code == "transcription_timeout"
    assert "test-only-secret" not in error.value.message


@pytest.mark.parametrize(
    ("provider_error", "expected_code"),
    [
        ({"code": "insufficient_quota", "type": "insufficient_quota"}, "transcription_quota_exceeded"),
        ({"code": "rate_limit_exceeded", "type": "requests"}, "transcription_rate_limited"),
        ({"code": "opaque", "type": "unknown", "message": "private-provider-detail"}, "transcription_provider_limited"),
    ],
)
def test_openai_provider_classifies_429_without_returning_provider_body(monkeypatch, tmp_path, provider_error, expected_code):
    audio = tmp_path / "recording.wav"
    audio.write_bytes(b"audio bytes")

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            request = httpx.Request("POST", "https://provider.invalid/audio/transcriptions")
            return httpx.Response(429, request=request, json={"error": provider_error})

    monkeypatch.setattr(openai_provider.httpx, "AsyncClient", FakeClient)
    with pytest.raises(ValidationError) as error:
        asyncio.run(asyncio.wait_for(OpenAIWhisperProvider(api_key="test-only-secret").transcribe(audio), timeout=3))

    assert error.value.code == expected_code
    assert "test-only-secret" not in error.value.message
    assert "private-provider-detail" not in error.value.message
