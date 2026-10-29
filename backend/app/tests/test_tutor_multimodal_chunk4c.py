import asyncio
import io
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.permissions import AuthenticatedContext
from app.integrations.storage.local import LocalStorageService
from app.models.media import MediaAsset
from app.models.user import User
from app.modules.assistant.providers.llm_base import LLMRequest
from app.modules.assistant.models import ChatMessage
from app.schemas.assistant import ChatRequest
from app.services.ai_orchestrator import AIResponse
from app.services.ai_orchestrator import AIStream
from app.api.v1.endpoints import assistant
from app.modules.assistant.services.retrieval_service import RetrievedChunk


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """
    Clear the module-level chat rate-limit store before every test in this
    file so that tests are isolated regardless of suite execution order.
    The production rate-limiter is an in-memory dict that accumulates across
    the session; without this reset, tests that run after many assistant
    tests fail with 429 even though the mock is in place.
    """
    assistant._chat_rate_limits.clear()
    yield
    assistant._chat_rate_limits.clear()


def _auth_context(db_session):
    user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    return AuthenticatedContext(user=user, session=None, permissions=["assistant.use"])


def _fake_response(request, result="The attachment shows a test object."):
    return AIResponse(
        request_id=request.request_id,
        capability=request.capability,
        status="succeeded",
        result=result,
        provider="mock",
        model="mock-multimodal",
    )


def _media_file(name: str, data: bytes, mime: str) -> UploadFile:
    from starlette.datastructures import Headers
    return UploadFile(filename=name, file=io.BytesIO(data), headers=Headers({"content-type": mime}))


@pytest.mark.parametrize(
    ("filename", "data", "content_type", "expected_mime"),
    [
        ("machine.jpg", b"\xff\xd8\xffjpeg-sample", "image/jpeg", "image/jpeg"),
        ("inspection.wav", b"RIFF\x24\0\0\0WAVEaudio-sample", "audio/wav", "audio/wav"),
        ("inspection.mp4", b"\0\0\0\x10ftypisom\0\0\0\0", "video/mp4", "video/mp4"),
        ("inspection.mov", b"\0\0\0\x14ftypqt  \0\0\0\0qt  ", "video/quicktime", "video/mov"),
    ],
)
def test_tutor_multimodal_upload_reaches_mocked_gemini_payload(
    db_session, monkeypatch, tmp_path, filename, data, content_type, expected_mime
):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-media")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])
    requests = []

    def mocked_execute(request):
        requests.append(request)
        return _fake_response(request)

    monkeypatch.setattr(assistant.ai_orchestrator, "execute", mocked_execute)
    response = asyncio.run(assistant.chat_media_endpoint(
        file=_media_file(filename, data, content_type),
        message="What can you observe in this upload?",
        conversation_id=None,
        machine_id=None,
        auth_ctx=auth_ctx,
        db=db_session,
    ))

    assert response.conversation_id
    assert response.attachment is not None
    assert response.attachment.filename == filename
    request_with_media = next(request for request in requests if request.payload.media_parts)
    assert request_with_media.payload.prompt
    provider = object.__new__(__import__("app.modules.assistant.providers.llm_gemini", fromlist=["GeminiLLMProvider"]).GeminiLLMProvider)
    contents = provider._build_contents(request_with_media.payload)
    assert contents[1].inline_data.mime_type == expected_mime
    assert contents[1].inline_data.data == data
    assert "What can you observe in this upload?" in request_with_media.payload.prompt
    assert db_session.query(ChatMessage).filter(
        ChatMessage.conversation_id == response.conversation_id,
        ChatMessage.role == "user",
        ChatMessage.attachment_media_id == response.attachment.media_id,
    ).one()
    stored_asset = db_session.get(MediaAsset, response.attachment.media_id)
    assert stored_asset is not None
    assert b"".join(storage.open(stored_asset.storage_key)[0]) == data


def test_tutor_restores_owned_attachment_for_followup_and_history(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-history")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(assistant.ai_orchestrator, "execute", _fake_response)

    upload_response = asyncio.run(assistant.chat_media_endpoint(
        file=_media_file("machine.jpg", b"\xff\xd8\xffjpeg-sample", "image/jpeg"),
        message="What is in this picture?",
        conversation_id=None,
        machine_id=None,
        auth_ctx=auth_ctx,
        db=db_session,
    ))
    first_detail = assistant.get_conversation_detail(upload_response.conversation_id, auth_ctx, db_session)
    first_user_message = next(message for message in first_detail.messages if message.role == "user")
    assert first_user_message.attachment.media_id == upload_response.attachment.media_id
    assert first_user_message.attachment.filename == "machine.jpg"

    captured = []

    def capture_followup(request):
        captured.append(request)
        return _fake_response(request)

    monkeypatch.setattr(assistant.ai_orchestrator, "execute", capture_followup)
    assistant._execute_chat_turn(
        db=db_session,
        auth_ctx=auth_ctx,
        req=ChatRequest(message="What does it show?", conversation_id=upload_response.conversation_id),
    )

    assert len(captured) == 1
    media = captured[0].payload.media_parts
    assert media == [{"mime_type": "image/jpeg", "data": b"\xff\xd8\xffjpeg-sample"}]
    latest_user_message = (
        db_session.query(ChatMessage)
        .filter(ChatMessage.conversation_id == upload_response.conversation_id, ChatMessage.role == "user")
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    assert latest_user_message.attachment_media_id == upload_response.attachment.media_id

    download = assistant.download_tutor_attachment(upload_response.attachment.media_id, auth_ctx, db_session)
    assert download.media_type == "image/jpeg"
    assert download.headers["cache-control"] == "private, no-store"

    other_user = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).one()
    other_context = AuthenticatedContext(user=other_user, session=None, permissions=["assistant.use"])
    with pytest.raises(NotFoundError) as not_found:
        assistant.download_tutor_attachment(upload_response.attachment.media_id, other_context, db_session)
    assert getattr(not_found.value, "code", None) == "attachment_not_found"


def test_text_document_without_rag_chunks_still_reaches_model(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-text")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])
    requests = []

    def capture(request):
        requests.append(request)
        return _fake_response(request, "The uploaded note mentions coolant inspection.")

    monkeypatch.setattr(assistant.ai_orchestrator, "execute", capture)
    response = asyncio.run(assistant.chat_media_endpoint(
        file=_media_file("inspection.txt", b"Check the coolant filter before startup.", "text/plain"),
        message="Summarize this note.",
        conversation_id=None,
        machine_id=None,
        auth_ctx=auth_ctx,
        db=db_session,
    ))

    assert response.answer == "The uploaded note mentions coolant inspection."
    assert len(requests) == 1
    assert requests[0].payload.media_parts == []
    assert "Check the coolant filter before startup." in requests[0].payload.prompt
    assert response.attachment.mime == "text/plain"


def test_pdf_attachment_reaches_mocked_gemini_payload_with_extracted_text(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-pdf")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])
    data = (Path(__file__).parent / "fixtures" / "multimodal" / "sample_doc.pdf").read_bytes()
    prepared = assistant.prepare_attachment(data, "sample_doc.pdf")
    assert prepared.text.strip()
    requests = []

    def capture(request):
        requests.append(request)
        return _fake_response(request, "The uploaded document contains a maintenance reference.")

    monkeypatch.setattr(assistant.ai_orchestrator, "execute", capture)
    response = asyncio.run(assistant.chat_media_endpoint(
        file=_media_file("sample_doc.pdf", data, "application/pdf"),
        message="Summarize the uploaded maintenance document.",
        conversation_id=None,
        machine_id=None,
        auth_ctx=auth_ctx,
        db=db_session,
    ))

    request = next(request for request in requests if request.payload.media_parts)
    provider = object.__new__(__import__("app.modules.assistant.providers.llm_gemini", fromlist=["GeminiLLMProvider"]).GeminiLLMProvider)
    contents = provider._build_contents(request.payload)
    assert contents[1].inline_data.mime_type == "application/pdf"
    assert contents[1].inline_data.data == data
    assert "Summarize the uploaded maintenance document." in request.payload.prompt
    assert prepared.text[:80] in request.payload.prompt
    assert response.attachment.mime == "application/pdf"


def test_empty_model_result_returns_a_safe_tutor_error(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    monkeypatch.setattr(assistant, "get_storage_service", lambda: LocalStorageService(tmp_path / "tutor-empty"))
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])

    def empty_response(request):
        return _fake_response(request, "   ")

    monkeypatch.setattr(assistant.ai_orchestrator, "execute", empty_response)
    response = asyncio.run(assistant.chat_media_endpoint(
        file=_media_file("notes.txt", b"A short uploaded note.", "text/plain"),
        message="Summarize the note.",
        conversation_id=None,
        machine_id=None,
        auth_ctx=auth_ctx,
        db=db_session,
    ))

    assert response.provider_unavailable is True
    assert "temporarily unavailable" in response.answer.lower()


def test_empty_stream_response_returns_a_safe_tutor_error(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-empty-stream")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])
    data = b"\xff\xd8\xffjpeg-empty-stream"
    asset = assistant._store_tutor_attachment(
        db_session,
        auth_ctx.user.id,
        assistant.prepare_attachment(data, "machine.jpg"),
        data,
    )
    db_session.flush()
    monkeypatch.setattr(
        assistant.ai_orchestrator,
        "stream",
        lambda _request: AIStream(provider="mock", model="mock-empty", chunks=iter([])),
    )

    response = assistant.chat_stream_endpoint(
        req=ChatRequest(message="Describe this image.", image_media_id=asset.id),
        auth_ctx=auth_ctx,
        db=db_session,
    )

    async def collect_body():
        return "".join([str(chunk) async for chunk in response.body_iterator])

    body = asyncio.run(collect_body())
    streamed_text = "".join(
        json.loads(line.removeprefix("data: "))["token"]
        for line in body.splitlines()
        if line.startswith("data: {") and '"token"' in line
    )
    assert "temporarily unavailable" in streamed_text.lower()
    assert "event: done" in body


def test_streamed_tutor_image_is_sent_to_mocked_gemini_payload(db_session, monkeypatch, tmp_path):
    auth_ctx = _auth_context(db_session)
    storage = LocalStorageService(tmp_path / "tutor-stream")
    monkeypatch.setattr(assistant, "get_storage_service", lambda: storage)
    monkeypatch.setattr(assistant.RetrievalService, "retrieve_chunks", lambda *_args, **_kwargs: [])

    data = b"\xff\xd8\xffjpeg-stream-sample"
    prepared = assistant.prepare_attachment(data, "machine.jpg")
    asset = assistant._store_tutor_attachment(db_session, auth_ctx.user.id, prepared, data)
    db_session.flush()

    requests = []

    def mocked_stream(request):
        requests.append(request)
        return AIStream(provider="mock", model="mock-multimodal", chunks=iter(["The image shows a machine panel."]))

    monkeypatch.setattr(assistant.ai_orchestrator, "stream", mocked_stream)
    response = assistant.chat_stream_endpoint(
        req=ChatRequest(message="What is shown in this picture?", image_media_id=asset.id),
        auth_ctx=auth_ctx,
        db=db_session,
    )

    async def collect_body():
        return "".join([str(chunk) async for chunk in response.body_iterator])

    body = asyncio.run(collect_body())
    assert "event: done" in body
    assert len(requests) == 1
    provider = object.__new__(__import__("app.modules.assistant.providers.llm_gemini", fromlist=["GeminiLLMProvider"]).GeminiLLMProvider)
    contents = provider._build_contents(requests[0].payload)
    assert contents[1].inline_data.mime_type == "image/jpeg"
    assert contents[1].inline_data.data == data


def _unsupported_spindle_parameters_chunk():
    return RetrievedChunk(
        chunk_id="verified-general-guidance",
        source_id="verified-source",
        knowledge_version_id="verified-version",
        title="General spindle guidance",
        section_label="Operation",
        text="Follow the approved machine-specific spindle warmup procedure.",
        score=0.9,
        rank=1,
    )


def _unsupported_spindle_answer(request):
    return _fake_response(
        request,
        "Run the spindle at 20% for 5 minutes, then increase to 50% for 5 minutes [CHUNK:verified-general-guidance].",
    )


def test_sync_tutor_withholds_unsupported_procedure_and_citation(db_session, monkeypatch):
    auth_ctx = _auth_context(db_session)
    monkeypatch.setattr(
        assistant.RetrievalService,
        "retrieve_chunks",
        lambda *_args, **_kwargs: [_unsupported_spindle_parameters_chunk()],
    )
    monkeypatch.setattr(assistant.ai_orchestrator, "execute", _unsupported_spindle_answer)

    _conversation, assistant_message, sources, insufficient, answer, provider_unavailable, _audio = assistant._execute_chat_turn(
        db=db_session,
        auth_ctx=auth_ctx,
        req=ChatRequest(message="What is the standard spindle warmup procedure?"),
    )

    assert answer == assistant.INSUFFICIENT_EVIDENCE_ANSWER
    assert assistant_message.content == assistant.INSUFFICIENT_EVIDENCE_ANSWER
    assert insufficient is True
    assert provider_unavailable is False
    assert sources == []
    assert "20%" not in answer and "50%" not in answer
    assert not any(source.cited for source in assistant_message.message_sources)


def test_stream_tutor_withholds_unsupported_procedure_and_citation(db_session, monkeypatch):
    auth_ctx = _auth_context(db_session)
    monkeypatch.setattr(
        assistant.RetrievalService,
        "retrieve_chunks",
        lambda *_args, **_kwargs: [_unsupported_spindle_parameters_chunk()],
    )
    monkeypatch.setattr(
        assistant.ai_orchestrator,
        "stream",
        lambda request: AIStream(
            provider="mock",
            model="mock-grounded",
            chunks=iter([_unsupported_spindle_answer(request).result]),
        ),
    )
    response = assistant.chat_stream_endpoint(
        req=ChatRequest(message="What is the standard spindle warmup procedure?"),
        auth_ctx=auth_ctx,
        db=db_session,
    )

    async def collect_body():
        return "".join([str(chunk) async for chunk in response.body_iterator])

    body = asyncio.run(collect_body())
    token_text = "".join(
        json.loads(line.removeprefix("data: "))["token"]
        for line in body.splitlines()
        if line.startswith("data: {") and '"token"' in line
    )
    assert assistant.INSUFFICIENT_EVIDENCE_ANSWER in token_text
    assert "20%" not in token_text and "50%" not in token_text
    sources_event = next(line for line in body.splitlines() if line.startswith("data: {") and '"sources"' in line)
    assert json.loads(sources_event.removeprefix("data: "))["sources"] == []
