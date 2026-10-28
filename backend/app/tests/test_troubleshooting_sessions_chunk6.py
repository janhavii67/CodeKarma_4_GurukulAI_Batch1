import json

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utc_now
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import Procedure, ProcedureRun, ProcedureRunStep, ProcedureStep
from app.models.user import User
from app.modules.assistant.services.indexing_service import IndexingService


def _login(client, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def _published_source(db: Session, author: User, suffix: str = "") -> KnowledgeVersion:
    title = f"Approved vibration inspection{suffix}"
    item = KnowledgeItem(title=title, category="TROUBLESHOOTING", tags="vibration,diagnostic", author_id=author.id, status="APPROVED")
    db.add(item)
    db.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=title,
        status="published",
        origin="expert",
        created_by=author.id,
        machine_id="mach-haas-vf2",
        summary="Published documented inspection steps for unusual spindle vibration.",
        description="Use the approved inspection checks recorded here.",
        content="Published source only.",
        safety_warnings="Follow the cited site safety procedure before inspection.",
        steps=[
            {"order": 1, "title": "Inspect documented holder condition", "instruction": "Inspect the tool holder for documented vibration marks while following the approved machine safety procedure.", "tools": ["Inspection light"], "expected_result": "Record whether the documented marks are present.", "safety_warning": "Follow the cited site safety procedure."},
            {"order": 2, "title": "Record spindle vibration observation", "instruction": "Record the observed spindle vibration and compare it only with the approved machine-specific acceptance criteria.", "expected_result": "Observation recorded for authorized review."},
        ],
        published_at=utc_now(),
    )
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    db.commit()
    db.refresh(version)
    IndexingService.index_knowledge_version(version.id, db)
    return version


def test_session_searches_published_sources_and_records_outcomes_without_inventing_root_cause(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    version = _published_source(db_session, author)
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    topics = client.get("/api/v1/troubleshooting/topics", params={"q": "unusual spindle vibration"})
    assert topics.status_code == 200
    assert any(row["version_id"] == version.id and row["version_no"] == 1 for row in topics.json())

    started = client.post(
        "/api/v1/troubleshooting/sessions",
        json={"reported_symptom": "Unusual spindle vibration during turning", "machine_id": "mach-haas-vf2", "problem_category": "vibration_noise", "operation_context": "Turning", "checked_already": "Noise observed"},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert started.status_code == 201
    body = started.json()
    assert body["context"]["checked_already"] == "Noise observed"
    assert body["checks"]
    assert all(check["source_refs"] for check in body["checks"])
    assert all(ref["version_id"] in {source["version_id"] for source in body["source_refs"]}
               for check in body["checks"] for ref in check["source_refs"])
    assert any(source["version_id"] == version.id for source in body["source_refs"])

    wrong_order = client.post(
        f"/api/v1/troubleshooting/sessions/{body['id']}/checks/1/outcome",
        json={"outcome": "fail", "observation": "Not checked"},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert wrong_order.status_code == 422

    fail = client.post(
        f"/api/v1/troubleshooting/sessions/{body['id']}/checks/0/outcome",
        json={"outcome": "fail", "observation": "Vibration marks observed."},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert fail.status_code == 200
    assert fail.json()["current_check_index"] == 1
    assert fail.json()["status"] == "in_progress"
    assert fail.json()["responses"][0]["outcome"] == "fail"
    assert "root_cause" not in fail.json()

    unknown = fail
    while unknown.json()["status"] == "in_progress":
        index = unknown.json()["current_check_index"]
        unknown = client.post(
            f"/api/v1/troubleshooting/sessions/{body['id']}/checks/{index}/outcome",
            json={"outcome": "unknown", "observation": "Could not perform this check."},
            headers={settings.CSRF_HEADER_NAME: csrf},
        )
        assert unknown.status_code == 200
    assert unknown.json()["status"] == "unresolved"
    assert unknown.json()["responses"][-1]["outcome"] == "unknown"

    # Historical steps/outcomes retain the source revision the operator saw.
    version.status = "superseded"
    db_session.commit()
    resumed = client.get(f"/api/v1/troubleshooting/sessions/{body['id']}")
    assert resumed.status_code == 200
    assert resumed.json()["checks"][0]["source_refs"][0]["version_id"] == version.id
    assert len(resumed.json()["responses"]) == len(body["checks"])


def test_no_retrieved_evidence_creates_no_procedure_and_can_be_escalated(client, db_session: Session):
    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    started = client.post(
        "/api/v1/troubleshooting/sessions",
        json={"reported_symptom": "ZXQ-UNIQUE-UNINDEXED-SYMPTOM-71384"},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert started.status_code == 201
    body = started.json()
    assert body["source_refs"] == []
    assert body["checks"] == []
    assert body["context"]["evidence_status"] == "insufficient_evidence"

    escalated = client.post(
        f"/api/v1/troubleshooting/sessions/{body['id']}/escalate",
        json={"reason": "No approved procedure supports this symptom."},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert escalated.status_code == 200
    assert escalated.json()["status"] == "escalated"


def test_draft_knowledge_never_appears_as_troubleshooting_evidence(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item = KnowledgeItem(title="Draft-only ZXQ spindle branch", category="TROUBLESHOOTING", author_id=author.id, status="DRAFT")
    db_session.add(item)
    db_session.flush()
    version = KnowledgeVersion(
        item_id=item.id, version_no=1, title=item.title, status="draft", origin="expert", created_by=author.id,
        summary="Draft-only ZXQ branch", steps=[{"order": 1, "title": "Draft check", "instruction": "Inspect ZXQ-only draft spindle condition."}],
    )
    db_session.add(version)
    db_session.commit()
    IndexingService.index_knowledge_version(version.id, db_session)
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    results = client.get("/api/v1/troubleshooting/topics", params={"q": "ZXQ-only draft spindle condition"})
    assert results.status_code == 200
    assert all(row["version_id"] != version.id for row in results.json())


def test_workflow_issue_context_is_preserved_and_does_not_complete_workflow(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).first()
    procedure = Procedure(title="Approved diagnostic context", description="Published workflow context", author_id=author.id, status="APPROVED")
    db_session.add(procedure)
    db_session.flush()
    step = ProcedureStep(procedure_id=procedure.id, step_order=1, title="Inspect recorded condition", instruction="Record the approved observation.")
    db_session.add(step)
    db_session.flush()
    run = ProcedureRun(procedure_id=procedure.id, operator_id=trainee.id, status="IN_PROGRESS", current_step_order=1, issues=[])
    db_session.add(run)
    db_session.flush()
    execution = ProcedureRunStep(run_id=run.id, step_id=step.id, is_completed=False)
    db_session.add(execution)
    issue = {"id": "issue-chunk6-1", "step_id": step.id, "step_order": 1, "description": "Unexpected finish at this step", "created_at": utc_now().isoformat()}
    run.issues = [issue]
    db_session.commit()

    csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post(
        "/api/v1/troubleshooting/sessions",
        json={"reported_symptom": issue["description"], "workflow_run_id": run.id, "workflow_issue_id": issue["id"]},
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["workflow_run_id"] == run.id
    assert body["workflow_issue_id"] == issue["id"]
    assert body["context"]["workflow"]["workflow_revision"] == procedure.version
    db_session.refresh(run)
    db_session.refresh(execution)
    assert run.status == "IN_PROGRESS"
    assert execution.is_completed is False


def test_session_object_isolation_and_expert_review_draft_permissions(client, db_session: Session):
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    created = client.post("/api/v1/troubleshooting/sessions", json={"reported_symptom": "Unverified symptom requiring escalation"}, headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert created.status_code == 201
    session_id = created.json()["id"]

    _login(client, "operator@demo.local", "Operator@Gurukul2026!")
    denied = client.get(f"/api/v1/troubleshooting/sessions/{session_id}")
    assert denied.status_code == 404
    denied_queue = client.get("/api/v1/troubleshooting/escalations/queue")
    assert denied_queue.status_code == 403

    owner_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    escalation = client.post(f"/api/v1/troubleshooting/sessions/{session_id}/escalate", json={"reason": "Needs expert review."}, headers={settings.CSRF_HEADER_NAME: owner_csrf})
    assert escalation.status_code == 200

    expert_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    queue = client.get("/api/v1/troubleshooting/escalations/queue")
    assert queue.status_code == 200
    row = next(item for item in queue.json() if item["session_id"] == session_id)
    claim = client.post(f"/api/v1/troubleshooting/escalations/{row['escalation_id']}/claim", headers={settings.CSRF_HEADER_NAME: expert_csrf})
    assert claim.status_code == 200
    detail = client.get(f"/api/v1/troubleshooting/sessions/{session_id}")
    assert detail.status_code == 200

    draft = client.post(f"/api/v1/troubleshooting/sessions/{session_id}/knowledge-draft", headers={settings.CSRF_HEADER_NAME: expert_csrf})
    assert draft.status_code == 201
    assert draft.json()["status"] == "draft"
    item = db_session.get(KnowledgeItem, draft.json()["item_id"])
    assert item.category == "TROUBLESHOOTING"
    version = db_session.get(KnowledgeVersion, draft.json()["version_id"])
    assert version.status == "draft"
    assert json.loads(version.content)["originating_session_id"] == session_id
