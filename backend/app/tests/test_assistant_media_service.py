import io
from pathlib import Path

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


def _ftyp(major_brand: bytes, compatible_brands: tuple[bytes, ...] = ()) -> bytes:
    box_size = 16 + 4 * len(compatible_brands)
    return box_size.to_bytes(4, "big") + b"ftyp" + major_brand + b"\0\0\0\0" + b"".join(compatible_brands)


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


def test_bmp_is_rejected_with_a_clear_supported_conversion():
    with pytest.raises(ValidationError) as unsupported:
        prepare_attachment(b"BM" + b"\0" * 24, "machine.bmp")

    assert unsupported.value.code == "unsupported_media_type"
    assert "convert" in unsupported.value.message.lower()
    assert "png" in unsupported.value.message.lower()


def test_mov_requires_a_quicktime_brand_before_using_gemini_video_mime():
    mov_bytes = _ftyp(b"qt  ")
    attachment = prepare_attachment(mov_bytes, "inspection.mov")

    assert attachment.mime_type == "video/mov"
    assert attachment.media_parts == [{"mime_type": "video/mov", "data": mov_bytes}]

    with pytest.raises(ValidationError) as mislabeled:
        prepare_attachment(_ftyp(b"isom"), "inspection.mov")
    assert mislabeled.value.code == "invalid_media_signature"


@pytest.mark.parametrize(
    ("filename", "data", "expected_mime"),
    [
        ("machine.png", b"\x89PNG\r\n\x1a\n" + b"payload", "image/png"),
        ("machine.jpg", b"\xff\xd8\xff" + b"payload", "image/jpeg"),
        ("machine.webp", b"RIFF\x04\0\0\0WEBP", "image/webp"),
        ("inspection.wav", b"RIFF\x24\0\0\0WAVE" + b"payload", "audio/wav"),
        ("inspection.mp3", b"ID3" + b"payload", "audio/mpeg"),
        ("inspection.flac", b"fLaC" + b"payload", "audio/flac"),
        ("inspection.m4a", _ftyp(b"M4A "), "audio/m4a"),
        ("inspection.aac", b"\xff\xf1" + b"payload", "audio/aac"),
        ("inspection.aiff", b"FORM\0\0\0\x10AIFF" + b"payload", "audio/aiff"),
        ("inspection.ogg", b"OggS" + b"payload", "audio/ogg"),
        ("inspection.opus", b"OggS" + b"payload", "audio/opus"),
        ("inspection.weba", b"\x1a\x45\xdf\xa3" + b"payload", "audio/webm"),
        ("inspection.mp4", _ftyp(b"isom"), "video/mp4"),
        ("inspection.webm", b"\x1a\x45\xdf\xa3" + b"payload", "video/webm"),
        ("inspection.avi", b"RIFF\x04\0\0\0AVI " + b"payload", "video/avi"),
        ("inspection.flv", b"FLV\x01" + b"payload", "video/x-flv"),
        ("inspection.mpeg", b"\0\0\x01\xb3" + b"payload", "video/mpeg"),
        ("inspection.mpg", b"\0\0\x01\xb3" + b"payload", "video/mpeg"),
        ("inspection.wmv", bytes.fromhex("3026B2758E66CF11A6D900AA0062CE6C") + b"payload", "video/wmv"),
        ("inspection.3gp", _ftyp(b"3gp4"), "video/3gpp"),
        ("reference.pdf", (Path(__file__).parent / "fixtures" / "multimodal" / "sample_doc.pdf").read_bytes(), "application/pdf"),
    ],
)
def test_supported_image_and_video_payloads_keep_matching_mime_and_bytes(filename, data, expected_mime):
    attachment = prepare_attachment(data, filename)
    provider = object.__new__(GeminiLLMProvider)
    contents = provider._build_contents(LLMRequest(prompt="Inspect this attachment.", media_parts=attachment.media_parts))

    assert attachment.mime_type == expected_mime
    assert contents[1].inline_data.mime_type == expected_mime
    assert contents[1].inline_data.data == data


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
