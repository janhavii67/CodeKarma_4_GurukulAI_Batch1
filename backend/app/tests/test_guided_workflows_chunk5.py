import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utc_now
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import Procedure, ProcedureRun, ProcedureRunStep
from app.modules.assistant.services.indexing_service import IndexingService
from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService
from app.core.permissions import ROLE_EXPERT, ROLE_TRAINEE
from app.models.user import User


def _login(client, email: str, password: str):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def _published_source(db: Session, author: User):
    item = KnowledgeItem(title="Coolant Leak Response", category="MAINTENANCE", author_id=author.id, status="APPROVED")
    db.add(item)
    db.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=item.title,
        status="published",
        origin="expert",
        created_by=author.id,
        machine_id="mach-haas-vf2",
        summary="Inspect coolant leak near spindle and verify documented containment checks.",
        description="Purpose: respond to a coolant leak using the approved inspection sequence.",
        content='{"operation":"Coolant leak response"}',
        prerequisites="Machine stopped; follow site isolation procedure.",
        operating_conditions="Use only the documented conditions for this machine.",
        safety_warnings="Wear the PPE stated in the local approved safety procedure.",
        common_mistakes="Do not restart the machine before the source of the coolant leak is identified.",
        corrective_actions="If the leak source is unclear, stop and contact the line supervisor.",
        steps=[
            {"order": 1, "title": "Inspect the leak area", "instruction": "Inspect the coolant leak area around the spindle while the machine is stopped.", "tools": ["Inspection light"], "safety_warning": "Keep the machine stopped during inspection.", "expected_result": "Leak source is identified.", "quality_checkpoints": ["Record the visible leak location"]},
            {"order": 2, "title": "Record the finding", "instruction": "Record where coolant is leaking and report an unclear source to the supervisor.", "tools": ["Inspection log"], "expected_result": "Finding recorded for supervisor review."},
        ],
        published_at=utc_now(),
    )
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    db.commit()
    db.refresh(version)
    IndexingService.index_knowledge_version(version.id, db)
    return item, version


def test_published_knowledge_becomes_reviewed_workflow_and_tracks_operator_session(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    assert author is not None
    source_item, source_version = _published_source(db_session, author)

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    sources_res = client.get("/api/v1/procedures/sources?q=Coolant")
    assert sources_res.status_code == 200
    assert any(row["version_id"] == source_version.id for row in sources_res.json())

    draft_res = client.post(
        f"/api/v1/procedures/drafts/from-knowledge/{source_version.id}",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert draft_res.status_code == 201
    workflow_item_id = draft_res.json()["item_id"]
    assert draft_res.json()["source_refs"][0]["version_id"] == source_version.id

    submit_res = client.post(f"/api/v1/knowledge/{workflow_item_id}/submit", headers={settings.CSRF_HEADER_NAME: csrf})
    assert submit_res.status_code == 200
    assert submit_res.json()["status"] == "PENDING_REVIEW"

    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    approve_res = client.post(
        f"/api/v1/reviews/{workflow_item_id}/decision",
        json={"decision": "APPROVED", "comments": "Reviewed against the approved coolant response source."},
        headers={settings.CSRF_HEADER_NAME: reviewer_csrf},
    )
    assert approve_res.status_code == 200

    workflow_version_id = approve_res.json()["version"]["id"]
    workflow_version = db_session.get(KnowledgeVersion, workflow_version_id)
    procedure = db_session.query(Procedure).filter(Procedure.knowledge_version_id == workflow_version_id).one()
    assert procedure.status == "APPROVED"
    assert any(ref["version_id"] == source_version.id for ref in procedure.source_refs)
    assert procedure.operation == "Coolant leak response"
    assert procedure.troubleshooting_guidance
    assert procedure.steps[0].details["quality_checkpoints"] == ["Record the visible leak location"]

    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    start_res = client.post(f"/api/v1/procedures/{procedure.id}/start", headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert start_res.status_code == 201
    run_id = start_res.json()["id"]
    assert start_res.json()["workflow"]["knowledge_version_id"] == workflow_version_id
    assert all(not execution["is_completed"] for execution in start_res.json()["step_executions"])

    next_res = client.patch(
        f"/api/v1/procedures/runs/{run_id}/current-step",
        json={"step_order": 2},
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert next_res.status_code == 200
    assert next_res.json()["current_step_order"] == 2
    assert all(not execution["is_completed"] for execution in next_res.json()["step_executions"])

    issue_res = client.post(
        f"/api/v1/procedures/runs/{run_id}/issues",
        json={"step_id": procedure.steps[1].id, "description": "Coolant still leaks near the spindle after inspection."},
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert issue_res.status_code == 201
    assert issue_res.json()["issue"]["step_order"] == 2
    assert issue_res.json()["guidance_status"] == "matched_published_knowledge"
    assert issue_res.json()["guidance"][0]["version_id"] in {source_version.id, workflow_version_id}

    completion_res = client.post(
        f"/api/v1/procedures/runs/{run_id}/step/{procedure.steps[1].id}",
        json={"is_completed": True, "operator_notes": "Finding recorded for the supervisor."},
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert completion_res.status_code == 200
    assert completion_res.json()["status"] == "IN_PROGRESS"
    assert len(completion_res.json()["issues"]) == 1

    blocked_old_step = client.post(
        f"/api/v1/procedures/runs/{run_id}/step/{procedure.steps[0].id}",
        json={"is_completed": True},
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert blocked_old_step.status_code == 422

    back_res = client.patch(
        f"/api/v1/procedures/runs/{run_id}/current-step",
        json={"step_order": 1},
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert back_res.status_code == 200
    assert back_res.json()["step_executions"][0]["is_completed"] is False


def test_workflow_revisions_archive_old_snapshot_and_keep_session_revision(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, source = _published_source(db_session, author)
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    draft = client.post(f"/api/v1/procedures/drafts/from-knowledge/{source.id}", headers={settings.CSRF_HEADER_NAME: csrf})
    assert draft.status_code == 201
    item_id = draft.json()["item_id"]
    assert client.post(f"/api/v1/knowledge/{item_id}/submit", headers={settings.CSRF_HEADER_NAME: csrf}).status_code == 200
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    approved_v1 = client.post(f"/api/v1/reviews/{item_id}/decision", json={"decision": "APPROVED", "comments": "Approved revision one."}, headers={settings.CSRF_HEADER_NAME: reviewer_csrf})
    assert approved_v1.status_code == 200
    v1_id = approved_v1.json()["version"]["id"]
    procedure_v1 = db_session.query(Procedure).filter(Procedure.knowledge_version_id == v1_id).one()

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    revision = client.post(f"/api/v1/knowledge/{item_id}/versions", json={"revision_reason": "Clarified the operator reporting checkpoint."}, headers={settings.CSRF_HEADER_NAME: csrf})
    assert revision.status_code == 201
    assert client.post(f"/api/v1/knowledge/{item_id}/submit", headers={settings.CSRF_HEADER_NAME: csrf}).status_code == 200
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    approved_v2 = client.post(f"/api/v1/reviews/{item_id}/decision", json={"decision": "APPROVED", "comments": "Approved revised workflow."}, headers={settings.CSRF_HEADER_NAME: reviewer_csrf})
    assert approved_v2.status_code == 200
    procedure_v2 = db_session.query(Procedure).filter(Procedure.knowledge_version_id == approved_v2.json()["version"]["id"]).one()
    db_session.refresh(procedure_v1)
    assert procedure_v1.status == "ARCHIVED"
    assert procedure_v2.version == 2
    assert any(ref["version_id"] == procedure_v2.knowledge_version_id for ref in procedure_v2.source_refs)
    assert any(ref["version_id"] == source.id for ref in procedure_v2.source_refs)
    published_workflows = client.get("/api/v1/procedures?q=Coolant").json()
    assert any(row["id"] == procedure_v2.id for row in published_workflows)

    old_run = ProcedureRun(procedure_id=procedure_v1.id, operator_id=author.id, status="IN_PROGRESS", current_step_order=1)
    db_session.add(old_run)
    db_session.flush()
    db_session.add(ProcedureRunStep(run_id=old_run.id, step_id=procedure_v1.steps[0].id, is_completed=False))
    db_session.commit()
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    old_run_res = client.get(f"/api/v1/procedures/runs/{old_run.id}")
    assert old_run_res.status_code == 200
    assert old_run_res.json()["workflow"]["version"] == 1
    assert old_run_res.json()["workflow"]["status"] == "ARCHIVED"


def test_workflow_creation_and_session_access_follow_permissions(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _, source = _published_source(db_session, author)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    source_res = client.get("/api/v1/procedures/sources")
    assert source_res.status_code == 403
    create_res = client.post(
        f"/api/v1/procedures/drafts/from-knowledge/{source.id}",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
    )
    assert create_res.status_code == 403
