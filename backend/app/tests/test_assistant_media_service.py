import io

import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.modules.assistant.providers.llm_base import LLMRequest
from app.modules.assistant.providers.llm_gemini import GeminiLLMProvider
from app.modules.assistant.models import ChatMessage
from app.services import audio_service
from app.services.assistant_media_service import prepare_attachment


def _wav(seconds: float = 1.0) -> bytes:
    import numpy as np

    output = io.BytesIO()
    samples = np.sin(np.linspace(0, seconds * 2 * np.pi * 440, int(seconds * 16_000))).astype("float32")
    sf.write(output, samples, 16_000, format="WAV", subtype="PCM_16")
    return output.getvalue()


def test_media_attachment_parser_accepts_image_and_extracts_untrusted_document_text():
    image = prepare_attachment(b"\x89PNG\r\n\x1a\n" + b"png-payload", "machine.png")
    assert image.mime_type == "image/png"
    assert image.media_parts[0]["mime_type"] == "image/png"

    document = prepare_attachment(b"Turn the feed off before inspecting the fixture.", "notes.txt")
    assert "Turn the feed off" in document.text
    assert document.media_parts == []


def test_media_attachment_parser_rejects_mislabeled_and_unsupported_files():
    with pytest.raises(ValidationError) as mismatch:
        prepare_attachment(b"not an mp3", "machine.mp3")
    assert mismatch.value.code == "invalid_media_signature"

    with pytest.raises(ValidationError) as unsupported:
        prepare_attachment(b"payload", "archive.zip")
    assert unsupported.value.code == "unsupported_media_type"


def test_machine_sound_decoder_uses_ffmpeg_for_mp3_and_keeps_original_mime(monkeypatch):
    decoded = _wav()
    calls = []

    class Completed:
        returncode = 0
        stdout = decoded
        stderr = b""

    monkeypatch.setattr(audio_service.shutil, "which", lambda _name: "ffmpeg")

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        return Completed()

    monkeypatch.setattr(audio_service.subprocess, "run", fake_run)
    features = audio_service.extract_features(b"ID3" + b"mock-mp3", "machine.mp3")

    assert features["mime"] == "audio/mpeg"
    assert features["normalized_audio_wav"] == decoded
    assert features["duration_seconds"] == 1.0
    assert calls[0][0][0] == "ffmpeg"
    assert "pipe:0" in calls[0][0]
    assert "pipe:1" in calls[0][0]
    assert calls[0][1]["input"] == b"ID3mock-mp3"


def test_machine_sound_decoder_reports_missing_ffmpeg_without_faking_a_no_match(monkeypatch):
    monkeypatch.setattr(audio_service, "_ffmpeg_executable", lambda: None)
    with pytest.raises(audio_service.AudioProcessingError):
        audio_service.extract_features(b"ID3" + b"mock-mp3", "machine.mp3")


def test_gemini_provider_receives_inline_media_after_the_prompt():
    provider = object.__new__(GeminiLLMProvider)
    contents = provider._build_contents(LLMRequest(
        prompt="Inspect this machine image.",
        media_parts=[{"mime_type": "image/jpeg", "data": b"\xff\xd8\xffsample"}],
    ))
    assert contents[0] == "Inspect this machine image."
    assert len(contents) == 2
    assert contents[1].inline_data.mime_type == "image/jpeg"
    assert contents[1].inline_data.data == b"\xff\xd8\xffsample"


def test_media_chat_route_requires_csrf_and_records_only_attachment_name(client: TestClient, db_session: Session):
    unauthenticated = client.post(
        "/api/v1/assistant/chat/media",
        data={"message": "Summarize this note"},
        files={"file": ("inspection.txt", b"Check the fixture for wear.", "text/plain")},
    )
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["error"]["code"] == "unauthenticated"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert login.status_code == 200
    csrf = login.cookies[settings.CSRF_COOKIE_NAME]
    response = client.post(
        "/api/v1/assistant/chat/media",
        data={"message": "Summarize this note"},
        files={"file": ("inspection.txt", b"Check the fixture for wear.", "text/plain")},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert response.status_code == 200, response.text
    message = (
        db_session.query(ChatMessage)
        .filter_by(conversation_id=response.json()["conversation_id"], role="user")
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    assert message is not None
    assert "[Attachment: inspection.txt]" in message.content
    assert "Check the fixture for wear." not in message.content
