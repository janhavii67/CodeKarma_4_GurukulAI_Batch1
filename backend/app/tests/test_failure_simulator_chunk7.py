from app.core.config import settings
from app.db.base import utc_now
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, ApprovalRecord
from app.models.simulation import SimulationScenarioRevision
from app.models.user import User
from app.core.security import hash_password
from app.services.simulation_service import validate_scenario
from app.core.exceptions import ValidationError


def _login(client, email, password):
    assert client.post("/api/v1/auth/login", json={"email": email, "password": password}).status_code == 200
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def _source(db, author):
    item = KnowledgeItem(title="Inspection Response Source", category="QUALITY", author_id=author.id, status="APPROVED")
    db.add(item)
    db.flush()
    version = KnowledgeVersion(item_id=item.id, version_no=1, title=item.title, status="published", origin="expert",
        created_by=author.id, summary="Approved nonconformance inspection and escalation guidance.",
        content="Use the approved inspection method and escalate a confirmed deviation.", published_at=utc_now())
    db.add(version)
    db.flush()
    item.current_published_version_id = version.id
    db.commit()
    return version


def _content(source_id):
    return {
        "title": "Out-of-tolerance response", "description": "Practice a documented nonconformance response.",
        "operation": "Inspection", "machine_id": None, "difficulty": "BEGINNER",
        "initial_situation": "A measurement is outside the approved tolerance.",
        "learning_objectives": ["Verify and escalate using approved guidance."], "prerequisites": [],
        "safety_precautions": ["Ask a supervisor if the approved procedure is unclear."],
        "start_decision_id": "verify", "source_version_ids": [source_id], "related_workflow_ids": [],
        "related_troubleshooting_ids": [], "decision_points": [
            {"id": "verify", "situation": "What is the first action?", "evidence": ["A deviation was measured."], "choices": [
                {"id": "check", "label": "Verify the measurement", "consequence": "The documented measurement method is checked.",
                 "observation": "The deviation remains.", "explanation": "This is the approved verification action.", "next_decision_id": "escalate",
                 "terminal": False, "preferred": True, "safety_critical": False, "source_refs": [source_id]},
                {"id": "adjust", "label": "Change a machine setting", "consequence": "The simulated action is stopped.",
                 "explanation": "The cited procedure does not authorize this adjustment.", "next_decision_id": None, "terminal": True,
                 "preferred": False, "safety_critical": True, "source_refs": [source_id]},
            ]},
            {"id": "escalate", "situation": "The result remains outside tolerance.", "choices": [
                {"id": "report", "label": "Escalate for review", "consequence": "The simulated issue is escalated.",
                 "explanation": "The approved source directs escalation.", "next_decision_id": None, "terminal": True,
                 "preferred": True, "safety_critical": False, "source_refs": [source_id]},
                {"id": "release", "label": "Release the part", "consequence": "The deviation remains unresolved.",
                 "explanation": "The approved source does not support release without review.", "next_decision_id": None, "terminal": True,
                 "preferred": False, "safety_critical": True, "source_refs": [source_id]},
            ]},
        ]}


def test_graph_validator_rejects_cycles_and_missing_nodes(db_session):
    author = db_session.query(User).filter_by(email=settings.EXPERT_A_EMAIL).first()
    source = _source(db_session, author)
    cyclic = _content(source.id)
    cyclic["decision_points"][1]["choices"][0]["next_decision_id"] = "verify"
    cyclic["decision_points"][1]["choices"][0]["terminal"] = False
    try:
        validate_scenario(db_session, cyclic)
        assert False, "cycle must be rejected"
    except ValidationError as exc:
        assert exc.code == "scenario_cycle"

    missing = _content(source.id)
    missing["decision_points"][0]["choices"][0]["next_decision_id"] = "not-a-node"
    try:
        validate_scenario(db_session, missing)
        assert False, "missing transition must be rejected"
    except ValidationError as exc:
        assert exc.code == "invalid_next_decision"

    unreachable = _content(source.id)
    unreachable["decision_points"].append({"id": "orphan", "situation": "Unreachable branch", "choices": [
        {"id": "orphan-a", "label": "A", "consequence": "A", "explanation": "A", "terminal": True, "preferred": True, "source_refs": [source.id]},
        {"id": "orphan-b", "label": "B", "consequence": "B", "explanation": "B", "terminal": True, "preferred": False, "source_refs": [source.id]},
    ]})
    try:
        validate_scenario(db_session, unreachable)
        assert False, "unreachable decision must be rejected"
    except ValidationError as exc:
        assert exc.code == "unreachable_decision"


def test_scenario_review_and_revision_pinned_deterministic_session(client, db_session):
    author = db_session.query(User).filter_by(email=settings.EXPERT_A_EMAIL).first()
    source = _source(db_session, author)
    draft_payload = {"content": _content(source.id)}

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    draft = client.post("/api/v1/simulator/drafts", json=draft_payload, headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert draft.status_code == 201, draft.text
    revision_id, scenario_id = draft.json()["revision_id"], draft.json()["scenario_id"]
    assert client.get("/api/v1/simulator/scenarios").json() == []
    submit = client.post(f"/api/v1/simulator/drafts/{revision_id}/submit", headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert submit.status_code == 200
    self_approval = client.post(f"/api/v1/simulator/drafts/{revision_id}/publish", headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert self_approval.status_code == 403

    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    published = client.post(f"/api/v1/simulator/drafts/{revision_id}/publish", headers={settings.CSRF_HEADER_NAME: reviewer_csrf})
    assert published.status_code == 200, published.text
    assert client.get("/api/v1/simulator/scenarios").json()[0]["revision_no"] == 1
    approved_version = db_session.get(KnowledgeVersion, db_session.get(SimulationScenarioRevision, revision_id).knowledge_version_id)
    assert approved_version.status == "published"
    assert db_session.query(ApprovalRecord).filter_by(version_id=approved_version.id, decision="approved").one_or_none()

    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    scenario_revision = db_session.get(SimulationScenarioRevision, revision_id)
    knowledge_version = db_session.get(KnowledgeVersion, scenario_revision.knowledge_version_id)
    generic_detail = client.get(f"/api/v1/knowledge/{knowledge_version.item_id}")
    assert generic_detail.status_code == 200
    assert "Change a machine setting" not in str(generic_detail.json())
    start = client.post(f"/api/v1/simulator/scenarios/{scenario_id}/sessions", headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert start.status_code == 201, start.text
    session = start.json()
    assert session["current_decision"]["id"] == "verify"
    assert "preferred" not in str(session["current_decision"])

    author_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    next_content = _content(source.id)
    next_content["title"] = "Out-of-tolerance response revised"
    revised = client.post(f"/api/v1/simulator/scenarios/{scenario_id}/revisions", json={"content": next_content}, headers={settings.CSRF_HEADER_NAME: author_csrf})
    assert revised.status_code == 201, revised.text
    rev2_id = revised.json()["revision_id"]
    assert client.post(f"/api/v1/simulator/drafts/{rev2_id}/submit", headers={settings.CSRF_HEADER_NAME: author_csrf}).status_code == 200
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    assert client.post(f"/api/v1/simulator/drafts/{rev2_id}/publish", headers={settings.CSRF_HEADER_NAME: reviewer_csrf}).status_code == 200
    assert client.get(f"/api/v1/simulator/sessions/{session['id']}").json()["revision_id"] == session["revision_id"]
    assert client.get("/api/v1/simulator/scenarios").json()[0]["revision_no"] == 2

    trainee_csrf = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    restarted = client.post(f"/api/v1/simulator/sessions/{session['id']}/restart", headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert restarted.status_code == 200
    assert restarted.json()["revision_id"] != session["revision_id"]
    assert restarted.json()["revision_no"] == 2
    invalid = client.post(f"/api/v1/simulator/sessions/{session['id']}/decisions", json={"choice_id": "release"}, headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert invalid.status_code == 422
    choice = client.post(f"/api/v1/simulator/sessions/{session['id']}/decisions", json={"choice_id": "check"}, headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert choice.status_code == 200, choice.text
    assert choice.json()["decision"]["preferred"] is True
    assert choice.json()["session"]["revision_id"] == session["revision_id"]
    done = client.post(f"/api/v1/simulator/sessions/{session['id']}/decisions", json={"choice_id": "report"}, headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert done.status_code == 200
    assert done.json()["session"]["status"] == "completed"
    assert done.json()["session"]["report"]["preferred_decisions"] == 2

    report = client.post(f"/api/v1/simulator/sessions/{session['id']}/reports", json={"reason": "The displayed explanation is unclear.", "decision_id": "verify"}, headers={settings.CSRF_HEADER_NAME: trainee_csrf})
    assert report.status_code == 201, report.text
    reviewer_csrf = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    reports = client.get("/api/v1/simulator/reports").json()
    assert len(reports) == 1 and reports[0]["status"] == "open"
    disposition = client.post(f"/api/v1/simulator/reports/{reports[0]['id']}/disposition", json={"status": "reviewed", "reviewer_note": "Reviewed against the cited source."}, headers={settings.CSRF_HEADER_NAME: reviewer_csrf})
    assert disposition.status_code == 200 and disposition.json()["status"] == "reviewed"

    other = User(email="second.trainee@demo.local", name="Second trainee", password_hash=hash_password("SecondTrainee@2026!"), role_id="TRAINEE", is_active=True)
    db_session.add(other)
    db_session.commit()
    _login(client, other.email, "SecondTrainee@2026!")
    hidden = client.get(f"/api/v1/simulator/sessions/{session['id']}")
    assert hidden.status_code == 404


def test_trainee_cannot_author_scenario(client):
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.post("/api/v1/simulator/drafts", json={"content": {}}, headers={settings.CSRF_HEADER_NAME: client.get("/api/v1/auth/csrf").json()["csrf_token"]})
    assert response.status_code == 403
