from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_DRAFT, STATUS_PUBLISHED
from app.models.machine import Machine
from app.models.user import User
from app.modules.assistant.models import KnowledgeChunk, KnowledgeSource
from app.modules.assistant.services.indexing_service import IndexingService
from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    csrf = response.cookies.get(settings.CSRF_COOKIE_NAME)
    assert csrf
    return csrf


def test_trainee_cannot_create_ecg_source_draft_and_no_row_is_written(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    from app.api.v1.endpoints.knowledge import _UGA_ECG_CANDIDATE_TITLE

    monkeypatch.setattr(
        "app.api.v1.endpoints.knowledge._extract_uga_ecg_manual_excerpt",
        lambda: (_ for _ in ()).throw(AssertionError("Unauthorized requests must not read the source PDF")),
    )
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert db_session.query(KnowledgeItem).filter_by(title=_UGA_ECG_CANDIDATE_TITLE).count() == 0

    response = client.get(
        "/api/v1/knowledge/import-candidates/uganda-ecg-training-manual",
    )

    assert response.status_code == 403
    assert db_session.query(KnowledgeItem).filter_by(title=_UGA_ECG_CANDIDATE_TITLE).count() == 0


def test_xray_wrong_related_link_is_removed_in_author_revision_only(
    client: TestClient,
    db_session: Session,
):
    """The wrong link is related-knowledge metadata; revise it without mutating v1."""
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machine = Machine(
        id="chunk7-xray-revision-machine",
        name="Xray Revision Test Unit",
        code="XRAY-CHUNK7-TEST",
        category="Medical Equipment",
        status="ACTIVE",
    )
    db_session.add(machine)
    db_session.flush()

    incorrect_related_link = {
        "type": "knowledge",
        "title": "Infusion Pump - Gearbox Stripped Tooth Confirmed Fault",
        "source_ref_id": "fixture-infusion-pump-item",
        "version_id": "fixture-infusion-pump-version",
    }
    valid_related_link = {
        "type": "knowledge",
        "title": "X-Ray Collimator Motor Normal Movement",
        "source_ref_id": "fixture-xray-item",
        "version_id": "fixture-xray-version",
    }
    item = KnowledgeItem(
        id="chunk7-xray-revision-item",
        title="Xray sound reference revision fixture",
        machine_id=machine.id,
        category="MACHINE_SOUND_REFERENCE",
        author_id=expert.id,
        current_version=1,
    )
    db_session.add(item)
    db_session.flush()
    published = KnowledgeVersion(
        id="chunk7-xray-revision-v1",
        item_id=item.id,
        version_no=1,
        title=item.title,
        machine_id=machine.id,
        status=STATUS_PUBLISHED,
        origin="expert",
        summary="Fixture metadata only; not a machine instruction.",
        content="Revision test fixture content only.",
        source_refs=[incorrect_related_link, valid_related_link],
        created_by=expert.id,
        author_id=expert.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(published)
    db_session.flush()
    item.current_published_version_id = published.id
    db_session.commit()

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    revision_response = client.post(
        f"/api/v1/knowledge/{item.id}/versions",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={"revision_reason": "Remove an unrelated source association after verification."},
    )
    assert revision_response.status_code == 201, revision_response.text
    revision_id = revision_response.json()["id"]
    assert revision_response.json()["status"] == STATUS_DRAFT
    assert revision_response.json()["created_by"] == expert.id
    assert revision_response.json()["source_refs"] == [incorrect_related_link, valid_related_link]

    update_response = client.patch(
        f"/api/v1/knowledge/{item.id}",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={
            "version_id": revision_id,
            "source_refs": [valid_related_link],
        },
    )
    assert update_response.status_code == 200, update_response.text

    db_session.expire_all()
    saved_item = db_session.get(KnowledgeItem, item.id)
    saved_published = db_session.get(KnowledgeVersion, published.id)
    saved_revision = db_session.get(KnowledgeVersion, revision_id)
    assert saved_item.current_published_version_id == published.id
    assert saved_published.status == STATUS_PUBLISHED
    assert saved_published.source_refs == [incorrect_related_link, valid_related_link]
    assert saved_revision.status == STATUS_DRAFT
    assert saved_revision.created_by == expert.id
    assert saved_revision.source_refs == [valid_related_link]
    assert saved_revision.submitted_at is None

    revision_audit = db_session.query(AuditLog).filter_by(
        action="knowledge.new_revision",
        entity_id=revision_id,
        actor_id=expert.id,
    ).one()
    update_audit = db_session.query(AuditLog).filter_by(
        action="knowledge.update",
        entity_id=revision_id,
        actor_id=expert.id,
    ).one()
    assert revision_audit.detail["from_version_no"] == 1
    assert "source_refs" in update_audit.detail["changed_fields"]


def test_machine_without_its_own_published_evidence_gets_clear_missing_evidence_response(
    client: TestClient,
    db_session: Session,
    monkeypatch,
):
    """Published evidence for another machine must not replace a machine evidence gap."""
    monkeypatch.setattr("app.modules.assistant.services.retrieval_service.settings.RETRIEVAL_MODE", "keyword")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    target = Machine(
        id="chunk7-missing-mri",
        name="MRI Evidence Gap Test Unit",
        code="MRI-CHUNK7-GAP",
        status="ACTIVE",
    )
    other = Machine(
        id="chunk7-other-mri",
        name="MRI Other Unit",
        code="MRI-CHUNK7-OTHER",
        status="ACTIVE",
    )
    db_session.add_all([target, other])
    db_session.flush()
    item = KnowledgeItem(
        id="chunk7-other-machine-item",
        title="Other machine fixture evidence",
        machine_id=other.id,
        author_id=expert.id,
    )
    db_session.add(item)
    db_session.flush()
    version = KnowledgeVersion(
        id="chunk7-other-machine-version",
        item_id=item.id,
        version_no=1,
        title=item.title,
        machine_id=other.id,
        status=STATUS_PUBLISHED,
        origin="expert",
        summary="Unique fixture token: orbitfixturekeyword.",
        content="Unique fixture token: orbitfixturekeyword. This is not machine guidance.",
        created_by=expert.id,
        author_id=expert.id,
        published_at=datetime.now(timezone.utc),
    )
    db_session.add(version)
    db_session.flush()
    item.current_published_version_id = version.id
    db_session.commit()
    source = IndexingService.index_knowledge_version(version.id, db_session, user_id=expert.id)
    chunk = db_session.query(KnowledgeChunk).filter_by(source_id=source.id).one()

    assert RetrievalService.retrieve_chunks(
        RetrievalQuery(query="orbitfixturekeyword", user_id=trainee.id, machine_id=target.id),
        db_session,
    ) == []

    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"message": "What is orbitfixturekeyword?", "machine_id": target.id},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["insufficient_evidence"] is True
    assert body["sources"] == []
    assert "MRI Evidence Gap Test Unit (MRI-CHUNK7-GAP)" in body["answer"]
    assert "manufacturer's manual or approved SOP" in body["answer"]
    assert "calibration setting" not in body["answer"].lower()
    assert chunk.id not in body["answer"]
