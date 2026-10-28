import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers, UploadFile
from sqlalchemy.orm import Session

from app.api.v1.endpoints.voice import _store_validated_audio
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.integrations.speech.gemini_provider import GeminiSpeechProvider
from app.integrations.speech.base import Segment
from app.models import ApprovalRecord, KnowledgeItem, KnowledgeVersion, MediaAsset, Transcript, TranscriptSegment, User
from app.models.processing_job import ProcessingJob
from app.services import structuring_service
from app.services.ai_orchestrator import AIResponse, AICapability


def test_gemini_speech_provider_uses_configured_model_by_default(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "configured-gemini-model")
    monkeypatch.setattr("app.integrations.speech.gemini_provider.genai.Client", lambda **_kwargs: object())

    provider = GeminiSpeechProvider()

    assert provider.model == "configured-gemini-model"


@pytest.mark.asyncio
async def test_voice_upload_rejects_unknown_type_and_oversize(monkeypatch, tmp_path):
    path = tmp_path / "capture.exe"
    bad_type = UploadFile(filename="capture.exe", file=io.BytesIO(b"audio"), headers=Headers({"content-type": "audio/webm"}))
    with pytest.raises(ValidationError, match="Upload an audio recording"):
        await _store_validated_audio(bad_type, path)

    monkeypatch.setattr("app.api.v1.endpoints.voice.settings.MAX_UPLOAD_BYTES", 4)
    too_large = UploadFile(filename="capture.webm", file=io.BytesIO(b"12345"), headers=Headers({"content-type": "audio/webm"}))
    with pytest.raises(ValidationError, match="upload limit"):
        await _store_validated_audio(too_large, path)
    assert not path.exists()


@pytest.mark.asyncio
async def test_structuring_uses_shared_orchestrator_and_preserves_transcript_timestamps(monkeypatch):
    payload = {
        "summary": "The expert says to inspect the chuck.",
        "detailed_summary": "Inspect the chuck before operation.",
        "steps": [{
            "title": "Inspect chuck",
            "instruction": "Inspect the chuck before operation.",
            "source_segment_ids": [7],
        }],
        "keywords": ["chuck"],
    }
    captured = {}

    def execute(request):
        captured["request"] = request
        return AIResponse(
            request_id=request.request_id,
            capability=request.capability,
            status="succeeded",
            result=json.dumps(payload),
        )

    monkeypatch.setattr(structuring_service.ai_orchestrator, "execute", execute)
    draft = await structuring_service.structure_transcript_with_ai(
        [Segment(idx=7, start_s=12.5, end_s=16.0, text="Inspect the chuck before operation.")]
    )

    assert captured["request"].capability == AICapability.STRUCTURED_EXTRACTION
    assert "12.50-16.00s" in captured["request"].payload.prompt
    assert draft.steps[0].source_segment_ids == [7]
    assert draft.steps[0].needs_review is False


@pytest.mark.asyncio
async def test_structuring_failure_is_reported_without_fabricated_steps(monkeypatch):
    def execute(request):
        return AIResponse(
            request_id=request.request_id,
            capability=request.capability,
            status="failed",
            error_code="provider_unavailable",
        )

    monkeypatch.setattr(structuring_service.ai_orchestrator, "execute", execute)
    with pytest.raises(RuntimeError, match="transcript was saved"):
        await structuring_service.structure_transcript_with_ai(
            [Segment(idx=1, start_s=0, end_s=1, text="Set pressure to the value stated by the supervisor.")]
        )


@pytest.mark.asyncio
async def test_required_value_phrase_is_flagged_without_inventing_a_number(monkeypatch):
    payload = {
        "summary": "Set the documented value.",
        "steps": [{
            "title": "Set value",
            "instruction": "Set it to the required value.",
            "source_segment_ids": [1],
            "needs_review": False,
        }],
    }

    def execute(request):
        return AIResponse(
            request_id=request.request_id,
            capability=request.capability,
            status="succeeded",
            result=json.dumps(payload),
        )

    monkeypatch.setattr(structuring_service.ai_orchestrator, "execute", execute)
    draft = await structuring_service.structure_transcript_with_ai([
        Segment(idx=1, start_s=1.25, end_s=2.75, text="Set it to the required value.")
    ])

    assert draft.steps[0].instruction == "Set it to the required value."
    assert draft.steps[0].needs_review is True
    assert "value not stated" in (draft.steps[0].note or "").lower()


@pytest.mark.asyncio
async def test_gemini_transcriber_returns_real_timestamps_and_uses_canonical_wav_mime(tmp_path):
    fixture = Path(__file__).parent / "fixtures" / "multimodal" / "sample_voice.wav"
    audio_path = tmp_path / "normalized.16k.wav"
    audio_path.write_bytes(fixture.read_bytes())
    captured = {}

    class Models:
        def generate_content(self, *, model, contents, config):
            captured["mime"] = contents[0].inline_data.mime_type
            return type("Response", (), {
                "text": json.dumps({
                    "language": "en",
                    "segments": [{"idx": 1, "start_s": 0.25, "end_s": 1.5, "text": "A short test sentence."}],
                })
            })()

    provider = object.__new__(GeminiSpeechProvider)
    provider.model = "test-model"
    provider.client = type("Client", (), {"models": Models()})()
    segments = await provider.transcribe(audio_path)

    assert captured["mime"] == "audio/wav"
    assert len(segments) == 1
    assert segments[0].start_s == 0.25
    assert segments[0].end_s == 1.5


@pytest.mark.asyncio
async def test_gemini_transcriber_rejects_segments_without_timestamps(tmp_path):
    fixture = Path(__file__).parent / "fixtures" / "multimodal" / "sample_voice.wav"
    audio_path = tmp_path / "normalized.16k.wav"
    audio_path.write_bytes(fixture.read_bytes())

    class Models:
        def generate_content(self, **_kwargs):
            return type("Response", (), {"text": json.dumps({"segments": [{"text": "A test segment."}]})})()

    provider = object.__new__(GeminiSpeechProvider)
    provider.model = "test-model"
    provider.client = type("Client", (), {"models": Models()})()
    with pytest.raises(ValidationError) as exc:
        await provider.transcribe(audio_path)
    assert exc.value.code == "invalid_transcript_timestamps"


def test_identical_voice_upload_reuses_the_existing_processing_job(
    client: TestClient, db_session: Session, monkeypatch, tmp_path
):
    from app.api.v1.endpoints import voice as voice_endpoint

    monkeypatch.setattr(settings, "MEDIA_DIR", str(tmp_path))
    queued_job_ids = []
    monkeypatch.setattr(voice_endpoint, "execute_voice_processing_job", lambda job_id: queued_job_ids.append(job_id))

    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    assert login.status_code == 200
    csrf = login.cookies[settings.CSRF_COOKIE_NAME]
    sample_path = Path(__file__).parent / "fixtures" / "multimodal" / "sample_voice.wav"
    sample_audio = sample_path.read_bytes()

    def upload():
        return client.post(
            "/api/v1/voice/upload",
            files={"file": ("sample_voice.wav", sample_audio, "audio/wav")},
            headers={settings.CSRF_HEADER_NAME: csrf},
        )

    first = upload()
    second = upload()
    assert first.status_code == 202, first.text
    assert second.status_code == 202, second.text
    assert first.json()["media"]["id"] == second.json()["media"]["id"]
    assert first.json()["job"]["id"] == second.json()["job"]["id"]
    assert queued_job_ids == [first.json()["job"]["id"]]
    assert db_session.query(ProcessingJob).filter_by(media_id=first.json()["media"]["id"]).count() == 1
    assert len(list(tmp_path.iterdir())) == 1


def test_ai_voice_draft_is_hidden_until_acknowledged_expert_publication(
    client: TestClient, db_session: Session, tmp_path
):
    expert_a = db_session.query(User).filter_by(email=settings.EXPERT_A_EMAIL).one()
    item = KnowledgeItem(
        title="Voice draft publication check",
        category="SOP",
        author_id=expert_a.id,
        status="DRAFT",
    )
    db_session.add(item)
    db_session.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=item.title,
        status="draft",
        origin="ai_draft",
        summary="AI-generated test draft.",
        steps=[{"title": "Check", "instruction": "Check the documented value.", "source_segment_ids": [1], "needs_review": False}],
        created_by=expert_a.id,
    )
    db_session.add(version)
    db_session.flush()
    media = MediaAsset(
        title="Test voice capture",
        version_id=version.id,
        kind="audio",
        storage_key=str(tmp_path / "sample_voice.wav"),
        original_name="sample_voice.wav",
        mime="audio/wav",
        size_bytes=1024,
        uploaded_by=expert_a.id,
    )
    db_session.add(media)
    db_session.flush()
    transcript = Transcript(
        media_id=media.id,
        version_id=version.id,
        language="en",
        provider="test",
        full_text="A transcript remains private while this draft is pending review.",
        status="completed",
    )
    db_session.add(transcript)
    db_session.flush()
    db_session.add(TranscriptSegment(
        transcript_id=transcript.id,
        idx=1,
        start_s=1.25,
        end_s=2.75,
        original_text="A transcript remains private while this draft is pending review.",
    ))
    db_session.commit()

    def login_as(email: str, password: str) -> str:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200
        return response.cookies[settings.CSRF_COOKIE_NAME]

    login_as(settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    private_response = client.get(f"/api/v1/voice/knowledge-versions/{version.id}/transcript")
    assert private_response.status_code == 403

    author_csrf = login_as(settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    submitted = client.post(
        f"/api/v1/knowledge/{item.id}/submit",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
    )
    assert submitted.status_code == 200, submitted.text

    reviewer_csrf = login_as(settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    review_url = f"/api/v1/reviews/{item.id}/decision"
    without_acknowledgment = client.post(
        review_url,
        json={"decision": "APPROVED"},
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
    )
    assert without_acknowledgment.status_code == 422
    assert without_acknowledgment.json()["error"]["code"] == "ai_draft_acknowledgment_required"
    db_session.refresh(version)
    assert version.status == "in_review"

    published = client.post(
        review_url,
        json={"decision": "APPROVED", "acknowledged_ai_draft": True},
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
    )
    assert published.status_code == 200, published.text
    db_session.refresh(version)
    assert version.status == "published"
    approval = db_session.query(ApprovalRecord).filter_by(version_id=version.id, decision="approved").one()
    assert approval.acknowledged_ai_draft is True

    login_as(settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    visible_response = client.get(f"/api/v1/voice/knowledge-versions/{version.id}/transcript")
    assert visible_response.status_code == 200
    assert visible_response.json()["segments"][0]["start_s"] == 1.25
