import pytest
from fastapi.testclient import TestClient
from app.core.config import settings


def login(client: TestClient, email: str, password: str):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_dashboard_stats_authenticated(client: TestClient):
    # Login as trainee
    res = login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert res.status_code == 200

    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_machines"] >= 3
    assert data["approved_articles"] >= 2
    assert data["procedures_count"] >= 1
    assert data["pending_reviews"] >= 1
    assert len(data["recent_articles"]) > 0


def test_machines_catalog(client: TestClient):
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp = client.get("/api/v1/machines")
    data = resp.json()
    machines = data["items"] if isinstance(data, dict) and "items" in data else data
    assert len(machines) >= 3
    haas = next((m for m in machines if "HAAS" in m["name"]), None)
    assert haas is not None
    assert haas["category_name"] == "CNC Milling Centers"
    assert len(haas["tools"]) >= 2


def test_knowledge_search_and_detail(client: TestClient):
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp = client.get("/api/v1/knowledge?q=thermal")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    article_id = data["items"][0]["id"]

    detail_resp = client.get(f"/api/v1/knowledge/{article_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "APPROVED"
    assert detail["current_revision"] is not None
    assert "Z-axis drift" in detail["current_revision"]["content"]


def test_knowledge_workflow_and_self_review_prevention(client: TestClient):
    # 1. Expert A logs in and creates a new knowledge draft
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    # Get CSRF token
    csrf_res = client.get("/api/v1/auth/csrf")
    csrf_token = csrf_res.json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf_token}

    create_payload = {
        "title": "Spindle Taper Regrinding and Concentricity Check",
        "category": "MAINTENANCE",
        "tags": "spindle,regrinding,concentricity",
        "content": "Verify spindle taper angle using a precision air gauge prior to in-situ grinding.",
        "operating_conditions": "Ambient 20°C",
        "safety_warnings": "Disconnect drive power during magnetic base positioning.",
    }
    create_res = client.post("/api/v1/knowledge", json=create_payload, headers=headers)
    assert create_res.status_code == 201
    article = create_res.json()
    art_id = article["id"]
    assert article["status"] == "DRAFT"

    # 2. Expert A submits draft for review
    submit_res = client.post(f"/api/v1/knowledge/{art_id}/submit", headers=headers)
    assert submit_res.status_code == 200
    assert submit_res.json()["status"] == "PENDING_REVIEW"

    # 3. NON-NEGOTIABLE CHECK: Expert A attempts to approve their own draft -> MUST BE REJECTED 403
    self_review_res = client.post(
        f"/api/v1/reviews/{art_id}/decision",
        json={"decision": "APPROVED", "comments": "Self approval attempt"},
        headers=headers,
    )
    assert self_review_res.status_code == 403
    assert "self_review_forbidden" in self_review_res.json()["error"]["code"]

    # 4. Expert B (Peer Reviewer) logs in and approves the submission
    login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    csrf_res_b = client.get("/api/v1/auth/csrf")
    headers_b = {"X-CSRF-Token": csrf_res_b.json()["csrf_token"]}

    peer_review_res = client.post(
        f"/api/v1/reviews/{art_id}/decision",
        json={"decision": "APPROVED", "comments": "Peer reviewed by Bhavna Patel."},
        headers=headers_b,
    )
    assert peer_review_res.status_code == 200
    assert peer_review_res.json()["status"] == "APPROVED"


def test_procedures_and_execution_runner(client: TestClient):
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    csrf_res = client.get("/api/v1/auth/csrf")
    headers = {"X-CSRF-Token": csrf_res.json()["csrf_token"]}

    procs_res = client.get("/api/v1/procedures")
    assert procs_res.status_code == 200
    procs = procs_res.json()
    assert len(procs) >= 1
    proc = procs[0]
    assert len(proc["steps"]) == 3

    # Start run
    start_res = client.post(f"/api/v1/procedures/{proc['id']}/start", headers=headers)
    assert start_res.status_code == 201
    run = start_res.json()
    run_id = run["id"]
    assert run["status"] == "IN_PROGRESS"
    assert len(run["step_executions"]) == 3

    # Complete Step 1
    step_1_id = proc["steps"][0]["id"]
    comp_res = client.post(
        f"/api/v1/procedures/runs/{run_id}/step/{step_1_id}",
        json={"is_completed": True, "operator_notes": "6.2 bar verified."},
        headers=headers,
    )
    assert comp_res.status_code == 200
    updated_run = comp_res.json()
    step_1_exec = next(s for s in updated_run["step_executions"] if s["step_id"] == step_1_id)
    assert step_1_exec["is_completed"] is True
    assert step_1_exec["operator_notes"] == "6.2 bar verified."


def test_troubleshooting_case_and_tree(client: TestClient):
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp = client.get("/api/v1/troubleshooting")
    assert resp.status_code == 200
    cases = resp.json()
    assert len(cases) >= 1
    case_id = cases[0]["id"]

    detail_resp = client.get(f"/api/v1/troubleshooting/{case_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert len(detail["nodes"]) >= 4
    assert len(detail["edges"]) >= 3
    root_node = next(n for n in detail["nodes"] if n["is_root"])
    assert "Tool Overhang" in root_node["title"]


def test_audio_analysis_calibrated_matching_and_rejections(client: TestClient):
    login(client, settings.OPERATOR_EMAIL if hasattr(settings, "OPERATOR_EMAIL") else "operator@demo.local", "Operator@Gurukul2026!")
    csrf_res = client.get("/api/v1/auth/csrf")
    headers = {"X-CSRF-Token": csrf_res.json()["csrf_token"]}

    # 1. Normal Sound -> Expect MATCHED
    norm_res = client.post("/api/v1/audio/analyze", json={"scenario": "normal_spindle"}, headers=headers)
    assert norm_res.status_code == 201
    norm_data = norm_res.json()
    assert norm_data["status"] == "MATCHED"
    assert norm_data["fault_label"] == "Normal Operation"
    assert norm_data["similarity_score"] >= 0.85

    # 2. Silence Sound -> Expect UNSUITABLE_AUDIO with ENERGY_TOO_LOW_SILENCE
    sil_res = client.post("/api/v1/audio/analyze", json={"scenario": "silence"}, headers=headers)
    assert sil_res.status_code == 201
    sil_data = sil_res.json()
    assert sil_data["status"] == "UNSUITABLE_AUDIO"
    assert sil_data["reason_code"] == "ENERGY_TOO_LOW_SILENCE"

    # 3. Speech / Unknown sound -> Expect NO_RELIABLE_MATCH (below threshold rejection)
    sp_res = client.post("/api/v1/audio/analyze", json={"scenario": "speech"}, headers=headers)
    assert sp_res.status_code == 201
    sp_data = sp_res.json()
    assert sp_data["status"] == "NO_RELIABLE_MATCH"
    assert sp_data["reason_code"] == "BELOW_MATCH_THRESHOLD"
    assert sp_data["requires_expert_review"] is True
