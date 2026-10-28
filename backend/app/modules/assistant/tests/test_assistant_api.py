import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_WITHDRAWN,
)
from app.models.user import User
from app.modules.assistant.models import (
    AssistantFeedback,
    ChatConversation,
    ChatMessage,
    ChatMessageSource,
    KnowledgeChunk,
    KnowledgeSource,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
    FEEDBACK_CATEGORY_MISSING_SOURCE,
    CONVERSATION_STATUS_DELETED,
)


def _login(client: TestClient, email: str, password: str) -> str:
    """Helper to log in and retrieve the CSRF token."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    csrf_token = resp.cookies.get(settings.CSRF_COOKIE_NAME)
    assert csrf_token is not None, "CSRF cookie was not set on login"
    return csrf_token


def test_unauthenticated_requests_return_401(client: TestClient):
    """
    All assistant routes require an authenticated active session.
    Unauthenticated calls must return HTTP 401 with standard error envelope.
    """
    # 1. Chat
    resp = client.post("/api/v1/assistant/chat", json={"message": "Hello"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 2. Chat stream
    resp = client.post("/api/v1/assistant/chat/stream", json={"message": "Hello"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 3. List conversations
    resp = client.get("/api/v1/assistant/conversations")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 4. Get conversation detail
    resp = client.get("/api/v1/assistant/conversations/non-existent-conv")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 5. Delete conversation
    resp = client.delete("/api/v1/assistant/conversations/non-existent-conv")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 6. Feedback
    resp = client.post("/api/v1/assistant/feedback", json={"message_id": "msg-1", "reason": "incorrect"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"

    # 7. Sources
    resp = client.get("/api/v1/assistant/sources/src-1")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"


def test_conversation_ownership_isolation_returns_404(client: TestClient, db_session: Session):
    """
    A user cannot view, delete, or append to another user's conversation.
    Must return 404 (not 403) to prevent enumeration of other users' conversation IDs.
    """
    # Login Expert A
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Expert A creates a conversation
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"message": "Expert A private question"},
    )
    assert chat_resp.status_code == 200
    conv_id = chat_resp.json()["conversation_id"]
    msg_id = chat_resp.json()["message_id"]

    # Login Expert B (different user)
    csrf_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)

    # Expert B tries to GET Expert A's conversation -> 404
    get_resp = client.get(f"/api/v1/assistant/conversations/{conv_id}")
    assert get_resp.status_code == 404
    assert get_resp.json()["error"]["code"] == "conversation_not_found"

    # Expert B tries to DELETE Expert A's conversation -> 404
    del_resp = client.delete(
        f"/api/v1/assistant/conversations/{conv_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
    )
    assert del_resp.status_code == 404
    assert del_resp.json()["error"]["code"] == "conversation_not_found"

    # Expert B tries to chat within Expert A's conversation -> 404
    chat_b_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"message": "Intruder message", "conversation_id": conv_id},
    )
    assert chat_b_resp.status_code == 404
    assert chat_b_resp.json()["error"]["code"] == "conversation_not_found"

    # Expert B tries to submit feedback on Expert A's message -> 404
    fb_b_resp = client.post(
        "/api/v1/assistant/feedback",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"message_id": msg_id, "reason": "incorrect"},
    )
    assert fb_b_resp.status_code == 404
    assert fb_b_resp.json()["error"]["code"] == "message_not_found"


def test_insufficient_evidence_path(client: TestClient, db_session: Session):
    """
    When no approved knowledge source is found for a query:
    - insufficient_evidence flag is True
    - sources list is empty
    - answer explicitly discloses insufficient evidence without hallucination
    """
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    query = "nonexistent_procedure_xyz999 unknown_setting_abc123"
    resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": query},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["insufficient_evidence"] is True
    assert data["sources"] == []
    assert "does not contain sufficient information" in data["answer"]
    assert "conversation_id" in data
    assert "message_id" in data

    # Verify message in database has evidence_status == "insufficient"
    saved_msg = db_session.get(ChatMessage, data["message_id"])
    assert saved_msg is not None
    assert saved_msg.evidence_status == "insufficient"


def test_draft_and_withdrawn_knowledge_never_cited(client: TestClient, db_session: Session):
    """
    Retrieval invariant:
    Draft, superseded, and withdrawn content must NEVER be cited or surfaced.
    Only approved, published knowledge may be retrieved.
    """
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    user_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    assert user_a is not None

    # 1. Create a KnowledgeItem with Draft, Withdrawn, and Published versions
    item = KnowledgeItem(
        title="Spindle Thermal Expansion Calibration",
        author_id=user_a.id,
    )
    db_session.add(item)
    db_session.commit()

    # Draft version with distinct keyword "hyperpressure999"
    v_draft = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_DRAFT,
        summary="Draft calibration draft_secret_formula",
        steps=[{"step": 1, "text": "Set hyperpressure999 to 9999 PSI in secret draft."}],
        created_by=user_a.id,
    )
    db_session.add(v_draft)
    db_session.commit()

    src_draft = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item.id,
        knowledge_version_id=v_draft.id,
        title="Draft Spindle Thermal Expansion Calibration",
        status="draft",
    )
    db_session.add(src_draft)
    db_session.commit()

    chk_draft = KnowledgeChunk(
        source_id=src_draft.id,
        chunk_index=0,
        text="Set hyperpressure999 to 9999 PSI in secret draft.",
        token_count=12,
        is_active=True,
    )
    db_session.add(chk_draft)
    db_session.commit()

    # Withdrawn version with distinct keyword "withdrawn888"
    v_withdrawn = KnowledgeVersion(
        item_id=item.id,
        version_no=2,
        status=STATUS_WITHDRAWN,
        summary="Withdrawn calibration method",
        steps=[{"step": 1, "text": "Old obsolete method withdrawn888 at 8888 RPM."}],
        created_by=user_a.id,
    )
    db_session.add(v_withdrawn)
    db_session.commit()

    src_withdrawn = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item.id,
        knowledge_version_id=v_withdrawn.id,
        title="Withdrawn Spindle Method",
        status="withdrawn",
    )
    db_session.add(src_withdrawn)
    db_session.commit()

    chk_withdrawn = KnowledgeChunk(
        source_id=src_withdrawn.id,
        chunk_index=0,
        text="Old obsolete method withdrawn888 at 8888 RPM.",
        token_count=10,
        is_active=True,
    )
    db_session.add(chk_withdrawn)
    db_session.commit()

    # Published version with approved procedure
    v_published = KnowledgeVersion(
        item_id=item.id,
        version_no=3,
        status=STATUS_PUBLISHED,
        summary="Official approved spindle thermal procedure",
        steps=[{"step": 1, "text": "Run spindle warmup cycle for 20 minutes at 4000 RPM."}],
        created_by=user_a.id,
    )
    db_session.add(v_published)
    db_session.commit()
    item.current_published_version_id = v_published.id
    db_session.commit()

    src_published = KnowledgeSource(
        source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
        source_ref_id=item.id,
        knowledge_version_id=v_published.id,
        title="Approved Spindle Thermal Calibration",
        status="published",
    )
    db_session.add(src_published)
    db_session.commit()

    chk_published = KnowledgeChunk(
        source_id=src_published.id,
        chunk_index=0,
        text="Run spindle warmup cycle for 20 minutes at 4000 RPM according to standard SOP.",
        section_label="Warmup",
        token_count=18,
        is_active=True,
    )
    db_session.add(chk_published)
    db_session.commit()

    # Query asking about spindle warmup and draft terms
    resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "spindle warmup cycle hyperpressure999 withdrawn888"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Verify that only the published chunk is in sources
    source_chunk_ids = [s["chunk_id"] for s in data["sources"]]
    assert chk_published.id in source_chunk_ids
    assert chk_draft.id not in source_chunk_ids
    assert chk_withdrawn.id not in source_chunk_ids

    # Neither draft nor withdrawn keywords should appear in cited sources
    for s in data["sources"]:
        assert "hyperpressure999" not in s["snippet"]
        assert "withdrawn888" not in s["snippet"]

    # Verify that requesting draft source detail directly returns 404
    draft_source_resp = client.get(f"/api/v1/assistant/sources/{src_draft.id}")
    assert draft_source_resp.status_code == 404

    # Verify that requesting withdrawn source detail directly returns 404
    withdrawn_source_resp = client.get(f"/api/v1/assistant/sources/{src_withdrawn.id}")
    assert withdrawn_source_resp.status_code == 404

    # Verify published source detail returns 200 with chunks
    pub_source_resp = client.get(f"/api/v1/assistant/sources/{src_published.id}")
    assert pub_source_resp.status_code == 200
    pub_data = pub_source_resp.json()
    assert pub_data["title"] == "Approved Spindle Thermal Calibration"
    assert pub_data["status"] == "published"
    assert len(pub_data["chunks"]) == 1
    assert "spindle warmup cycle" in pub_data["chunks"][0]["text"].lower()


def test_feedback_saved_successfully(client: TestClient, db_session: Session):
    """
    Submitting feedback records user rating, structured reason category,
    optional comment, and creates an audit entry.
    """
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # 1. Start a chat turn to generate a message
    chat_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "How do I check hydraulic oil level?"},
    )
    assert chat_resp.status_code == 200
    msg_id = chat_resp.json()["message_id"]

    # 2. Submit valid feedback
    fb_payload = {
        "message_id": msg_id,
        "rating": 4,
        "reason": FEEDBACK_CATEGORY_MISSING_SOURCE,
        "comment": "The response was helpful but did not cite the visual sight-glass procedure.",
    }
    fb_resp = client.post(
        "/api/v1/assistant/feedback",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json=fb_payload,
    )
    assert fb_resp.status_code == 201
    fb_data = fb_resp.json()
    assert fb_data["message_id"] == msg_id
    assert fb_data["category"] == "missing_source"
    assert fb_data["rating"] == 4
    assert fb_data["comment"] == fb_payload["comment"]
    assert fb_data["status"] == "new"

    # Verify saved in database
    fb_record = db_session.get(AssistantFeedback, fb_data["id"])
    assert fb_record is not None
    assert fb_record.category == "missing_source"
    assert fb_record.rating == 4

    # 3. Invalid reason enum rejected with 422
    bad_payload = {
        "message_id": msg_id,
        "rating": 2,
        "reason": "completely_invalid_reason",
    }
    bad_resp = client.post(
        "/api/v1/assistant/feedback",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json=bad_payload,
    )
    assert bad_resp.status_code == 422


def test_conversation_lifecycle_and_delete(client: TestClient, db_session: Session):
    """
    Test conversation lifecycle:
    - Create conversation on first message
    - Append to conversation on second message
    - List conversations returns conversation with message_count=4
    - Detail view returns complete message history
    - Delete soft-deletes conversation
    - Subsequent access returns 404
    """
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Turn 1
    turn1_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "First message about CNC setup"},
    )
    assert turn1_resp.status_code == 200
    conv_id = turn1_resp.json()["conversation_id"]

    # Turn 2 in same conversation
    turn2_resp = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "Second message following up on setup", "conversation_id": conv_id},
    )
    assert turn2_resp.status_code == 200
    assert turn2_resp.json()["conversation_id"] == conv_id

    # List conversations
    list_resp = client.get("/api/v1/assistant/conversations")
    assert list_resp.status_code == 200
    conversations = list_resp.json()
    matching = [c for c in conversations if c["id"] == conv_id]
    assert len(matching) == 1
    assert matching[0]["message_count"] == 4  # 2 user + 2 assistant messages

    # Get conversation detail
    detail_resp = client.get(f"/api/v1/assistant/conversations/{conv_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["id"] == conv_id
    assert len(detail["messages"]) == 4
    assert detail["messages"][0]["role"] == "user"
    assert detail["messages"][1]["role"] == "assistant"
    assert detail["messages"][2]["role"] == "user"
    assert detail["messages"][3]["role"] == "assistant"

    # Soft delete conversation
    del_resp = client.delete(
        f"/api/v1/assistant/conversations/{conv_id}",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert del_resp.status_code == 200
    assert del_resp.json() == {"status": "deleted", "id": conv_id}

    # Verify conversation in DB has status == "deleted"
    db_conv = db_session.get(ChatConversation, conv_id)
    assert db_conv is not None
    assert db_conv.status == CONVERSATION_STATUS_DELETED

    # Subsequent GET returns 404
    get_after_del = client.get(f"/api/v1/assistant/conversations/{conv_id}")
    assert get_after_del.status_code == 404


def test_streaming_sse_endpoint(client: TestClient):
    """
    POST /assistant/chat/stream emits Server-Sent Events:
    - "token" events containing text tokens
    - final "sources" event containing source citations
    - final "done" event with [DONE]
    """
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    resp = client.post(
        "/api/v1/assistant/chat/stream",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "Please explain axis homing procedure"},
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    body = resp.text
    assert "event: token" in body
    assert "event: sources" in body
    assert "event: done" in body
    assert "data: [DONE]" in body


def test_csrf_protection_on_mutating_endpoints(client: TestClient):
    """
    Mutating endpoints require CSRF header matching CSRF cookie.
    Missing or mismatched CSRF returns 403 csrf_failed.
    """
    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # 1. POST /chat without CSRF header -> 403
    resp1 = client.post("/api/v1/assistant/chat", json={"message": "No CSRF"})
    assert resp1.status_code == 403
    assert resp1.json()["error"]["code"] == "csrf_failed"

    # 2. POST /chat/stream without CSRF header -> 403
    resp2 = client.post("/api/v1/assistant/chat/stream", json={"message": "No CSRF"})
    assert resp2.status_code == 403
    assert resp2.json()["error"]["code"] == "csrf_failed"

    # 3. DELETE /conversations/{id} without CSRF header -> 403
    resp3 = client.delete("/api/v1/assistant/conversations/any-id")
    assert resp3.status_code == 403
    assert resp3.json()["error"]["code"] == "csrf_failed"

    # 4. POST /feedback without CSRF header -> 403
    resp4 = client.post("/api/v1/assistant/feedback", json={"message_id": "m1", "reason": "incorrect"})
    assert resp4.status_code == 403
    assert resp4.json()["error"]["code"] == "csrf_failed"
