from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.media import MediaAsset
from app.models.user import User
from app.tests.test_assistant_handoffs_chunk10 import _login, _published_handoff_source


def _asset(db: Session, owner: User, *, name: str, kind: str, mime: str, version_id=None, machine_id=None) -> MediaAsset:
    asset = MediaAsset(title=name, kind=kind, mime=mime, original_name=name, storage_key=f"aa/bb/{'0' * 31}{len(name) % 10}.bin",
        size_bytes=128, uploaded_by=owner.id, version_id=version_id, machine_id=machine_id)
    db.add(asset)
    db.commit()
    return asset


def test_answer_returns_media_attached_to_cited_knowledge_only(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _item, version, _workflow = _published_handoff_source(db_session, author)
    diagram = _asset(db_session, author, name="spindle-diagram.png", kind="image", mime="image/png", version_id=version.id)
    tone = _asset(db_session, author, name="spindle-tone.wav", kind="audio", mime="audio/wav", version_id=version.id)
    unrelated = _asset(db_session, author, name="coolant-photo.png", kind="image", mime="image/png", machine_id="mach-haas-vf2")

    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    answer = client.post("/api/v1/assistant/chat", headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "How do I inspect unusual spindle vibration?", "machine_id": "mach-haas-vf2"})
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["sources"] and not body["insufficient_evidence"]
    related = {row["id"]: row for row in body["related_media"]}
    assert set(related) == {diagram.id, tone.id}
    assert unrelated.id not in related
    assert related[diagram.id]["kind"] == "image" and related[diagram.id]["url"] == f"/api/v1/media/{diagram.id}"
    assert related[tone.id]["source_title"] == body["sources"][0]["title"] or related[tone.id]["source_title"]

    history = client.get(f"/api/v1/assistant/conversations/{body['conversation_id']}")
    assert {row["id"] for row in history.json()["messages"][-1]["related_media"]} == {diagram.id, tone.id}


def test_unsupported_question_returns_no_media_and_admits_missing_evidence(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _published_handoff_source(db_session, author)
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    answer = client.post("/api/v1/assistant/chat", headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What is the population of a distant galaxy cluster?", "machine_id": "mach-haas-vf2"})
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["insufficient_evidence"] is True
    assert body["sources"] == [] and body["related_media"] == [] and body["handoffs"] == []


def test_conversation_memory_is_private_to_its_owner(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _published_handoff_source(db_session, author)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    first = client.post("/api/v1/assistant/chat", headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "How do I inspect unusual spindle vibration?", "machine_id": "mach-haas-vf2"}).json()

    expert_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    assert client.get(f"/api/v1/assistant/conversations/{first['conversation_id']}").status_code in (403, 404)
    hijack = client.post("/api/v1/assistant/chat", headers={settings.CSRF_HEADER_NAME: expert_csrf},
        json={"message": "And the next step?", "conversation_id": first["conversation_id"]})
    assert hijack.status_code in (403, 404)
    assert first["conversation_id"] not in {row["id"] for row in client.get("/api/v1/assistant/conversations").json()}
