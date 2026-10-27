from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.integrations.speech import openai_provider
from app.integrations.speech.factory import get_speech_provider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider


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


@pytest.mark.asyncio
async def test_openai_provider_parses_segments_without_exposing_credentials(monkeypatch, tmp_path):
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
    segments = await provider.transcribe(audio)

    assert [(segment.idx, segment.start_s, segment.end_s, segment.text) for segment in segments] == [
        (1, 0.2, 1.4, "Check the chuck pressure.")
    ]
    assert captured["url"].endswith("/audio/transcriptions")
    assert captured["headers"]["Authorization"] == "Bearer test-only-secret"
    assert captured["data"]["model"] == "whisper-1"
    assert captured["mime"] == "audio/wav"


@pytest.mark.asyncio
async def test_openai_provider_returns_empty_for_silent_result(monkeypatch, tmp_path):
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
    assert await OpenAIWhisperProvider(api_key="test-only-secret").transcribe(audio) == []


@pytest.mark.asyncio
async def test_openai_provider_maps_timeout_to_safe_error(monkeypatch, tmp_path):
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
        await OpenAIWhisperProvider(api_key="test-only-secret").transcribe(audio)

    assert error.value.code == "transcription_timeout"
    assert "test-only-secret" not in error.value.message
