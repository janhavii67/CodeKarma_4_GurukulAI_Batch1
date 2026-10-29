from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utc_now
from app.models.audit import AuditLog
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.machine import Machine
from app.models.user import User
from app.modules.assistant.models import KnowledgeSource
from app.schemas.knowledge import RevisionCreateRequest
from app.services.knowledge_service import KnowledgeService


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    csrf = response.cookies.get(settings.CSRF_COOKIE_NAME)
    assert csrf
    return csrf


def _source_reference(*, status: str = "verified", audience: str = "trainee_authorized") -> dict:
    return {
        "type": "document",
        "source_title": "TEST FIXTURE OEM Manual",
        "revision": "Fixture revision 4",
        "pdf_pages": [12, 13],
        "section": "Fixture identification section",
        "verification": {
            "status": status,
            "audience_clearance": audience,
            "source_provenance": "Isolated test fixture; no real source",
            "source_manufacturer": "Test Imaging Ltd",
            "source_model": "MRI-TEST-7",
            "machine_manufacturer": "Test Imaging Ltd",
            "machine_model": "MRI-TEST-7",
            "machine_identity_basis": "asset_plate",
            "machine_identity_reference": "Test fixture plate reference",
            # The service must replace these untrusted client values.
            "verified_by_user_id": "client-supplied-id",
            "verified_at": "2000-01-01T00:00:00+00:00",
        },
    }


def _add_machine(db: Session) -> Machine:
    machine = Machine(
        id="source-verification-machine",
        name="Source Verification MRI Test Unit",
        code="ASSET-MRI-VERIFY-7",
        model_number="MRI-TEST-7",
        manufacturer="Test Imaging Ltd",
        category="Medical Equipment",
        category_id=None,
        status="ACTIVE",
    )
    db.add(machine)
    db.commit()
    return machine


def test_expert_verification_is_attributed_and_save_stays_unpublished(client: TestClient, db_session: Session):
    machine = _add_machine(db_session)
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    expert_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    payload = {
        "title": "TEST FIXTURE verified source draft",
        "machine_id": machine.id,
        "content": "Test fixture content only.\nSecond line retained.",
        "source_refs": [_source_reference()],
    }
    create = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: expert_csrf},
        json=payload,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    version = body["version"]
    verification = version["source_refs"][0]["verification"]
    assert body["author_id"] == expert.id
    assert version["status"] == "draft"
    assert version["submitted_at"] is None
    assert body["current_published_version_id"] is None
    assert version["source_refs"][0]["pdf_pages"] == [12, 13]
    assert version["source_refs"][0]["section"] == "Fixture identification section"
    assert verification["verified_by_user_id"] == expert.id
    assert verification["verified_by_name"] == expert.name
    assert verification["verified_at"] != "2000-01-01T00:00:00+00:00"
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version["id"]).first() is None
    assert db_session.query(AuditLog).filter_by(
        action="knowledge.source_verified", entity_id=version["id"], actor_id=expert.id
    ).count() == 1

    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    trainee_create = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json=payload,
    )
    assert trainee_create.status_code == 403
    trainee_read = client.get(f"/api/v1/knowledge/{body['id']}")
    assert trainee_read.status_code in (403, 404)
    trainee_update = client.patch(
        f"/api/v1/knowledge/{body['id']}",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"source_refs": [_source_reference()]},
    )
    assert trainee_update.status_code == 403

    # Saving did not submit, publish, or index. Submission remains a separate action.
    expert_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    submit = client.post(
        f"/api/v1/knowledge/{body['id']}/submit",
        headers={settings.CSRF_HEADER_NAME: expert_csrf},
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["version"]["status"] == "in_review"
    assert submit.json()["current_published_version_id"] is None
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version["id"]).first() is None


def test_restricted_source_cannot_be_submitted_or_approved(client: TestClient, db_session: Session):
    machine = _add_machine(db_session)
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    source_ref = _source_reference(status="unverified", audience="restricted")
    create = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={
            "title": "TEST FIXTURE restricted source draft",
            "machine_id": machine.id,
            "content": "Test-only draft content.",
            "source_refs": [source_ref],
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    version_id = body["version"]["id"]

    submit = client.post(
        f"/api/v1/knowledge/{body['id']}/submit",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
    )
    assert submit.status_code == 422
    assert submit.json()["error"]["code"] == "source_audience_not_authorized"
    assert db_session.get(KnowledgeVersion, version_id).status == "draft"
    assert body["current_published_version_id"] is None

    # A manually staged legacy review cannot bypass the source gate.
    item = db_session.get(KnowledgeItem, body["id"])
    version = db_session.get(KnowledgeVersion, version_id)
    item.status = "PENDING_REVIEW"
    version.status = "in_review"
    db_session.commit()
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    approve = client.post(
        f"/api/v1/reviews/{item.id}/decision",
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
        json={"decision": "APPROVED", "comments": "Test-only reviewer check"},
    )
    assert approve.status_code == 422
    assert approve.json()["error"]["code"] == "source_audience_not_authorized"
    db_session.refresh(item)
    db_session.refresh(version)
    assert version.status == "in_review"
    assert item.current_published_version_id is None
    assert db_session.query(KnowledgeSource).filter_by(knowledge_version_id=version_id).first() is None
    assert expert.id == version.created_by

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    unverified_ref = _source_reference(status="unverified", audience="trainee_authorized")
    unverified_create = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
        json={
            "title": "TEST FIXTURE uncleared identity draft",
            "machine_id": machine.id,
            "content": "Test-only content.",
            "source_refs": [unverified_ref],
        },
    )
    assert unverified_create.status_code == 201, unverified_create.text
    unverified_submit = client.post(
        f"/api/v1/knowledge/{unverified_create.json()['id']}/submit",
        headers={settings.CSRF_HEADER_NAME: author_csrf},
    )
    assert unverified_submit.status_code == 422
    assert unverified_submit.json()["error"]["code"] == "machine_source_verification_required"


def test_source_model_mismatch_cannot_be_marked_verified(client: TestClient, db_session: Session):
    machine = _add_machine(db_session)
    source_ref = _source_reference()
    source_ref["verification"]["source_model"] = "OTHER-MODEL-99"
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    response = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={
            "title": "TEST FIXTURE mismatched model",
            "machine_id": machine.id,
            "content": "Test-only content.",
            "source_refs": [source_ref],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "source_machine_identity_mismatch"
    assert db_session.query(KnowledgeItem).filter_by(title="TEST FIXTURE mismatched model").first() is None


def test_revision_copies_verified_page_references_without_mutating_published_version(db_session: Session):
    machine = _add_machine(db_session)
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    source_refs = [_source_reference()]
    source_refs[0]["verification"].update({
        "verified_by_user_id": expert.id,
        "verified_by_name": expert.name,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    })
    item = KnowledgeItem(
        title="TEST FIXTURE published verified source",
        machine_id=machine.id,
        category="GENERAL",
        author_id=expert.id,
        status="APPROVED",
        current_version=1,
    )
    db_session.add(item)
    db_session.flush()
    published = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=item.title,
        machine_id=machine.id,
        status=STATUS_PUBLISHED,
        origin="expert",
        content="Test-only published content.",
        source_refs=source_refs,
        created_by=expert.id,
        author_id=expert.id,
        published_at=utc_now(),
    )
    db_session.add(published)
    db_session.flush()
    item.current_published_version_id = published.id
    db_session.commit()

    draft_item, draft = KnowledgeService.create_revision(
        db_session,
        expert,
        item.id,
        RevisionCreateRequest(revision_reason="Preserve verified references for review"),
    )
    assert draft_item.id == item.id
    assert draft.status == "draft"
    assert draft.source_refs == source_refs
    assert db_session.get(KnowledgeVersion, published.id).source_refs == source_refs
    assert db_session.get(KnowledgeItem, item.id).current_published_version_id == published.id
