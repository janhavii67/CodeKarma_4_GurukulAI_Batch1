import pytest
import json
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_PUBLISHED,
    STATUS_WITHDRAWN,
)
from app.models.user import User
from app.modules.assistant.models import (
    ChatConversation,
    ChatMessage,
    KnowledgeChunk,
    KnowledgeSource,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
)
from app.modules.assistant.services.retrieval_service import RetrievedChunk
from app.modules.assistant.providers.llm_base import LLMResponse


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    csrf = resp.cookies.get(settings.CSRF_COOKIE_NAME)
    assert csrf is not None
    return csrf


def test_trainee_e2e_published_then_withdrawn_sop(client: TestClient, db_session: Session):
    """
    TASK M02-D Integration Test:
    1. Log in as a trainee.
    2. Ask a question on an approved, published SOP.
    3. Confirm the answer cites the published SOP.
    4. Withdraw the SOP.
    5. Ask the same question again as the trainee.
    6. Confirm the withdrawn SOP is NO LONGER cited, and insufficient_evidence=True is returned.
    """
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    assert author is not None

    # 1. Create a published knowledge item and version with unique parameter '77.5 PSI' and token 'pneumatic777'
    item = KnowledgeItem(
        title="Pneumatic Pressure Calibration SOP 777",
        author_id=author.id,
    )
    db_session.add(item)
    db_session.commit()

    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Standard pneumatic regulation 77.5 PSI",
        steps=[{"step": 1, "text": "Set regulator pressure for pneumatic 777 to 75 PSI for spindle clamping."}],
        created_by=author.id,
    )
    db_session.add(version)
    db_session.commit()
    item.current_published_version_id = version.id
    db_session.commit()

    source = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item.id,
        knowledge_version_id=version.id,
        title="Pneumatic Pressure Calibration SOP 777",
        status="published",
    )
    db_session.add(source)
    db_session.commit()

    chunk = KnowledgeChunk(
        source_id=source.id,
        chunk_index=0,
        text="Set regulator pressure for pneumatic 777 to 75 PSI for spindle clamping according to standard SOP.",
        section_label="Pressure Calibration",
        token_count=18,
        is_active=True,
    )
    db_session.add(chunk)
    db_session.commit()

    # 2. Log in as Trainee
    csrf_trainee = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    # 3. Trainee asks question on the published SOP
    query = "How do I perform pneumatic 777 calibration?"
    resp1 = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_trainee},
        json={"message": query},
    )
    assert resp1.status_code == 200
    data1 = resp1.json()

    # Confirm the published SOP is cited
    assert data1["insufficient_evidence"] is False
    assert len(data1["sources"]) > 0
    source_titles = [s["title"] for s in data1["sources"]]
    assert "Pneumatic Pressure Calibration SOP 777" in source_titles
    source_chunk_ids = [s["chunk_id"] for s in data1["sources"]]
    assert chunk.id in source_chunk_ids

    # 4. Withdraw the SOP (version status = withdrawn, source status = withdrawn)
    version.status = STATUS_WITHDRAWN
    source.status = "withdrawn"
    db_session.commit()

    # 5. Trainee asks the exact same question again
    resp2 = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_trainee},
        json={"message": query, "conversation_id": data1["conversation_id"]},
    )
    assert resp2.status_code == 200
    data2 = resp2.json()

    # 6. Confirm the withdrawn SOP is strictly NO LONGER cited
    assert data2["insufficient_evidence"] is True
    assert len(data2["sources"]) == 0
    source_titles_2 = [s["title"] for s in data2["sources"]]
    assert "Pneumatic Pressure Calibration SOP 777" not in source_titles_2
    assert chunk.id not in [s["chunk_id"] for s in data2["sources"]]
    assert "does not contain sufficient information" in data2["answer"]

    old_history = client.get(f"/api/v1/assistant/conversations/{data1['conversation_id']}")
    assert old_history.status_code == 200
    withdrawn_answer = next(message for message in old_history.json()["messages"] if message["id"] == data1["message_id"])
    assert withdrawn_answer["sources"] == []
    assert "no longer available" in withdrawn_answer["content"]


def test_follow_up_retrieval_uses_recent_operator_question_context(client: TestClient, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item = KnowledgeItem(title="Synthetic follow-up context QZ9", author_id=author.id)
    db_session.add(item)
    db_session.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Synthetic retrieval context for anaphoric follow-up testing.",
        steps=[{"step": 1, "text": "The fictional component is called the cobalt spindle collar QZ9."}],
        created_by=author.id,
    )
    db_session.add(version)
    db_session.flush()
    item.current_published_version_id = version.id
    source = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item.id,
        knowledge_version_id=version.id,
        title=item.title,
        status="published",
    )
    db_session.add(source)
    db_session.flush()
    chunk = KnowledgeChunk(
        source_id=source.id,
        chunk_index=0,
        text="For synthetic QA only, the fictional component is named cobalt spindle collar QZ9.",
        token_count=14,
        is_active=True,
    )
    db_session.add(chunk)
    db_session.commit()

    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    first = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What is the fictional cobalt spindle collar QZ9?"},
    )
    assert first.status_code == 200, first.text
    assert chunk.id in [source["chunk_id"] for source in first.json()["sources"]]

    follow_up = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What is it called?", "conversation_id": first.json()["conversation_id"]},
    )
    assert follow_up.status_code == 200, follow_up.text
    assert chunk.id in [source["chunk_id"] for source in follow_up.json()["sources"]]


def test_answer_can_cite_two_current_published_sources(client: TestClient, db_session: Session, monkeypatch):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    source_chunks = []
    for idx, detail in enumerate(("handoff check", "cooling note"), start=1):
        item = KnowledgeItem(title=f"Synthetic two-source test {idx} TST9", author_id=author.id)
        db_session.add(item)
        db_session.flush()
        version = KnowledgeVersion(
            item_id=item.id,
            version_no=1,
            status=STATUS_PUBLISHED,
            summary="Synthetic source for citation test.",
            steps=[{"step": 1, "text": f"Synthetic TST9 source {idx} documents the fictional {detail}."}],
            created_by=author.id,
        )
        db_session.add(version)
        db_session.flush()
        item.current_published_version_id = version.id
        source = KnowledgeSource(
            source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
            source_ref_id=item.id,
            knowledge_version_id=version.id,
            title=item.title,
            status="published",
        )
        db_session.add(source)
        db_session.flush()
        chunk = KnowledgeChunk(
            source_id=source.id,
            chunk_index=0,
            text=f"Synthetic TST9 source {idx} documents the fictional {detail} for this QA test.",
            token_count=13,
            is_active=True,
        )
        db_session.add(chunk)
        source_chunks.append((item.title, chunk))
    db_session.commit()

    class CitationProvider:
        def generate(self, _request):
            response = "Source A records the fictional handoff check. [CHUNK:{}] Source B records the fictional cooling note. [CHUNK:{}]".format(
                source_chunks[0][1].id, source_chunks[1][1].id,
            )
            return LLMResponse(response, "synthetic", "synthetic-model", 1)

    monkeypatch.setattr("app.services.ai_orchestrator.ai_orchestrator._llm_factory", lambda _provider=None: CitationProvider())
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    answer = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What does the synthetic TST9 test document?"},
    )
    assert answer.status_code == 200, answer.text
    data = answer.json()
    assert data["insufficient_evidence"] is False
    assert {source["title"] for source in data["sources"]} == {title for title, _chunk in source_chunks}
    assert {source["chunk_id"] for source in data["sources"]} == {chunk.id for _title, chunk in source_chunks}


@pytest.mark.parametrize("path", ["/api/v1/assistant/chat", "/api/v1/assistant/chat/stream"])
def test_retrieval_failure_returns_safe_503_without_orphan_conversation(client, db_session, monkeypatch, path):
    def unavailable(*_args, **_kwargs):
        raise RuntimeError("synthetic private backend detail")

    monkeypatch.setattr("app.api.v1.endpoints.assistant.RetrievalService.retrieve_chunks", unavailable)
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post(
        path,
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "Synthetic retrieval outage check for verification token."},
    )
    assert response.status_code == 503, response.text
    payload = response.json()
    assert payload["error"]["code"] == "retrieval_unavailable"
    assert "temporarily unavailable" in payload["error"]["message"]
    assert "synthetic private backend detail" not in response.text
    assert db_session.query(ChatConversation).count() == 0


def test_stream_provider_failure_falls_back_through_orchestrator_safely(client, monkeypatch):
    class BrokenProvider:
        provider_name = "synthetic"
        model_name = "synthetic-model"

        def stream(self, _request):
            raise RuntimeError("synthetic provider secret detail")
            yield ""

        def generate(self, _request):
            raise RuntimeError("synthetic provider secret detail")

    synthetic_chunk = RetrievedChunk(
        chunk_id="synthetic-chunk",
        source_id="synthetic-source",
        knowledge_version_id=None,
        title="Synthetic approved test source",
        section_label="Overview",
        text="Synthetic approved information for provider failure regression testing.",
        score=0.9,
        rank=1,
    )
    monkeypatch.setattr(
        "app.api.v1.endpoints.assistant.RetrievalService.retrieve_chunks",
        lambda *_args, **_kwargs: [synthetic_chunk],
    )
    monkeypatch.setattr(
        "app.services.ai_orchestrator.ai_orchestrator._llm_factory",
        lambda _provider=None: BrokenProvider(),
    )

    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post(
        "/api/v1/assistant/chat/stream",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "Summarize the synthetic approved regression source."},
    )
    assert response.status_code == 200, response.text
    source_event = next(line.removeprefix("data: ") for line in response.text.splitlines() if line.startswith("data: {") and '"provider_unavailable"' in line)
    payload = json.loads(source_event)
    assert payload["provider_unavailable"] is True
    assert payload["sources"] == []
    streamed_answer = "".join(
        json.loads(line.removeprefix("data: "))["token"]
        for line in response.text.splitlines()
        if line.startswith("data: {") and '"token"' in line
    )
    assert "temporarily unavailable" in streamed_answer.lower()
    assert "synthetic provider secret detail" not in response.text


def test_trainee_cannot_open_other_users_conversation(client: TestClient, db_session: Session):
    """
    TASK M02-D Security Invariant:
    Confirm a trainee cannot open, inspect, delete, or append to another user's
    conversation by changing the ID in the URL.
    Returns 404 (not 403 or 200).
    """
    # 1. Expert A logs in and creates a conversation
    csrf_expert = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_expert},
        json={"message": "Confidential procedure query by Expert A"},
    )
    assert chat_resp.status_code == 200
    expert_conv_id = chat_resp.json()["conversation_id"]

    # 2. Trainee logs in
    csrf_trainee = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    # 3. Trainee attempts to view the conversation by changing the ID in the URL
    get_resp = client.get(f"/api/v1/assistant/conversations/{expert_conv_id}")
    assert get_resp.status_code == 404
    assert get_resp.json()["error"]["code"] == "conversation_not_found"

    # 4. Trainee attempts to chat inside Expert A's conversation
    chat_intruder_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_trainee},
        json={"message": "Injected message", "conversation_id": expert_conv_id},
    )
    assert chat_intruder_resp.status_code == 404
    assert chat_intruder_resp.json()["error"]["code"] == "conversation_not_found"

    # 5. Trainee attempts to delete Expert A's conversation
    del_resp = client.delete(
        f"/api/v1/assistant/conversations/{expert_conv_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_trainee},
    )
    assert del_resp.status_code == 404
    assert del_resp.json()["error"]["code"] == "conversation_not_found"
