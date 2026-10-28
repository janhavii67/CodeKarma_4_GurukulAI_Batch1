import json

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utc_now
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.procedure import Procedure, ProcedureStep
from app.models.user import RolePermission, User
from app.modules.assistant.services.indexing_service import IndexingService


def _login(client, email: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def _published_handoff_source(db: Session, author: User):
    item = KnowledgeItem(
        title="Approved spindle vibration troubleshooting procedure",
        category="TROUBLESHOOTING",
        tags="spindle vibration inspection",
        author_id=author.id,
        status="APPROVED",
        machine_id="mach-haas-vf2",
    )
    db.add(item)
    db.flush()
    version = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        title=item.title,
        status=STATUS_PUBLISHED,
        origin="expert",
        created_by=author.id,
        machine_id="mach-haas-vf2",
        summary="Approved documented inspection checks for unusual spindle vibration.",
        description="Use the documented spindle vibration inspection sequence.",
        content="Inspect and record the spindle vibration observation.",
        steps=[
            {"order": 1, "title": "Inspect spindle vibration", "instruction": "Inspect and record unusual spindle vibration using the documented observation process.", "expected_result": "Record the observed spindle vibration for authorized review."},
            {"order": 2, "title": "Compare documented observation", "instruction": "Compare the spindle vibration observation only with the published machine-specific criteria."},
        ],
        published_at=utc_now(),
    )
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    workflow = Procedure(
        title="Approved spindle vibration inspection workflow",
        description="A reviewed step-by-step inspection workflow.",
        machine_id="mach-haas-vf2",
        author_id=author.id,
        status="APPROVED",
        version=1,
        knowledge_version_id=version.id,
        source_refs=[],
    )
    db.add(workflow)
    db.flush()
    db.add_all([
        ProcedureStep(procedure_id=workflow.id, step_order=1, title="Inspect spindle vibration", instruction="Inspect and record unusual spindle vibration."),
        ProcedureStep(procedure_id=workflow.id, step_order=2, title="Compare observation", instruction="Compare the recorded vibration with the published criteria."),
    ])
    unrelated = Procedure(
        title="Approved unrelated coolant workflow",
        description="A published but unrelated legacy workflow.",
        machine_id="mach-haas-vf2",
        author_id=author.id,
        status="APPROVED",
        version=1,
        source_refs=[],
    )
    db.add(unrelated)
    db.flush()
    db.add(ProcedureStep(procedure_id=unrelated.id, step_order=1, title="Inspect coolant", instruction="Inspect the unrelated coolant system."))
    db.commit()
    db.refresh(version)
    db.refresh(workflow)
    IndexingService.index_knowledge_version(version.id, db)
    return item, version, workflow


def test_tutor_offers_only_cited_matching_targets_and_starts_or_resumes_existing_sessions(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _item, version, workflow = _published_handoff_source(db_session, author)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    answer = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "How do I inspect unusual spindle vibration?", "machine_id": "mach-haas-vf2"},
    )
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["sources"]
    assert {row["kind"] for row in body["handoffs"]} == {"workflow", "troubleshooting"}
    assert {row["target_id"] for row in body["handoffs"] if row["kind"] == "workflow"} == {workflow.id}
    assert {row["target_id"] for row in body["handoffs"] if row["kind"] == "troubleshooting"} == {version.id}

    history = client.get(f"/api/v1/assistant/conversations/{body['conversation_id']}")
    assert history.status_code == 200
    restored = history.json()["messages"][-1]
    assert {row["kind"] for row in restored["handoffs"]} == {"workflow", "troubleshooting"}

    workflow_start = client.post(
        f"/api/v1/assistant/handoffs/workflow/{workflow.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert workflow_start.status_code == 201, workflow_start.text
    workflow_session = workflow_start.json()
    assert workflow_session["kind"] == "workflow"
    assert workflow_session["resumed"] is False
    workflow_details = client.get(f"/api/v1/procedures/runs/{workflow_session['session_id']}").json()
    assert all(not row["is_completed"] for row in workflow_details["step_executions"])

    workflow_resume = client.post(
        f"/api/v1/assistant/handoffs/workflow/{workflow.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert workflow_resume.status_code == 201
    assert workflow_resume.json()["session_id"] == workflow_session["session_id"]
    assert workflow_resume.json()["resumed"] is True

    # Revoking execution permission after the card is shown blocks accepting it.
    workflow_permission = db_session.get(RolePermission, {"role_id": "TRAINEE", "permission_id": "procedure.execute"})
    assert workflow_permission is not None
    db_session.delete(workflow_permission)
    db_session.commit()
    permission_changed = client.post(
        f"/api/v1/assistant/handoffs/workflow/{workflow.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert permission_changed.status_code == 404
    db_session.add(RolePermission(role_id="TRAINEE", permission_id="procedure.execute"))
    db_session.commit()

    trouble_start = client.post(
        f"/api/v1/assistant/handoffs/troubleshooting/{version.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert trouble_start.status_code == 201, trouble_start.text
    trouble_session_id = trouble_start.json()["session_id"]
    session = client.get(f"/api/v1/troubleshooting/sessions/{trouble_session_id}").json()
    assert session["context"]["tutor_handoff"] == {
        "conversation_id": body["conversation_id"],
        "message_id": body["message_id"],
        "source_version_id": version.id,
    }
    assert session["source_refs"] and session["source_refs"][0]["version_id"] == version.id

    trouble_resume = client.post(
        f"/api/v1/assistant/handoffs/troubleshooting/{version.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert trouble_resume.status_code == 201
    assert trouble_resume.json()["session_id"] == trouble_session_id
    assert trouble_resume.json()["resumed"] is True

    tampered = client.post(
        "/api/v1/assistant/handoffs/workflow/not-the-cited-workflow/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert tampered.status_code == 404
    assert client.get(f"/api/v1/assistant/conversations/{body['conversation_id']}").status_code == 200

    # A different user cannot use the handoff payload to enter the original conversation.
    other_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    cross_user = client.post(
        f"/api/v1/assistant/handoffs/workflow/{workflow.id}/start",
        headers={settings.CSRF_HEADER_NAME: other_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert cross_user.status_code == 404


def test_handoff_is_removed_from_history_and_rejected_after_source_withdrawal(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _item, version, workflow = _published_handoff_source(db_session, author)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    answer = client.post(
        "/api/v1/assistant/chat",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "How do I inspect unusual spindle vibration?", "machine_id": "mach-haas-vf2"},
    )
    body = answer.json()
    assert body["handoffs"]

    version.status = "withdrawn"
    source = body["sources"][0]["source_id"]
    from app.modules.assistant.models import KnowledgeSource
    db_session.get(KnowledgeSource, source).status = "withdrawn"
    db_session.commit()

    restored = client.get(f"/api/v1/assistant/conversations/{body['conversation_id']}").json()
    assert restored["messages"][-1]["handoffs"] == []
    assert restored["messages"][-1]["sources"] == []

    rejected = client.post(
        f"/api/v1/assistant/handoffs/workflow/{workflow.id}/start",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"conversation_id": body["conversation_id"], "message_id": body["message_id"]},
    )
    assert rejected.status_code in {404, 422}


def test_streaming_answer_includes_the_same_grounded_handoff_actions(client, db_session: Session):
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    _item, _version, _workflow = _published_handoff_source(db_session, author)
    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    streamed = client.post(
        "/api/v1/assistant/chat/stream",
        headers={settings.CSRF_HEADER_NAME: trainee_csrf},
        json={"message": "How do I inspect unusual spindle vibration?", "machine_id": "mach-haas-vf2"},
    )
    assert streamed.status_code == 200
    lines = streamed.text.splitlines()
    source_line = next(index for index, line in enumerate(lines) if line == "event: sources")
    event_data = json.loads(lines[source_line + 1].removeprefix("data: "))
    assert {row["kind"] for row in event_data["handoffs"]} == {"workflow", "troubleshooting"}
