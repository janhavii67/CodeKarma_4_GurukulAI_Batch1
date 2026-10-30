import io
import math
import wave
from array import array

import pytest
from fastapi.testclient import TestClient
from app.core.config import settings
from app.models.machine import Machine


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


def test_unverified_legacy_troubleshooting_tree_is_not_discoverable(client: TestClient):
    """Legacy demo branches without approved source links must never reach operators."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    response = client.get("/api/v1/troubleshooting")
    assert response.status_code == 200
    assert all(row["id"] != "case-vibration-chatter" for row in response.json())
    detail = client.get("/api/v1/troubleshooting/case-vibration-chatter")
    assert detail.status_code == 404


def _machine_tone_wav(*, silent: bool = False) -> bytes:
    samples = array("h", [0 if silent else int(12_000 * math.sin(2 * math.pi * 440 * index / 16_000)) for index in range(16_000)])
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16_000)
        wav.writeframes(samples.tobytes())
    return output.getvalue()


def test_machine_sound_analysis_validates_audio_and_does_not_invent_references(client: TestClient, db_session, monkeypatch):
    machine = db_session.query(Machine).filter_by(code="MACH-CT12", is_active=True).first()
    if machine is None:
        machine = Machine(name="CT-Scan", code="MACH-CT12", category="Medical Imaging", status="ACTIVE", is_active=True)
        db_session.add(machine)
        db_session.flush()
    machine_id = machine.id
    monkeypatch.setattr("app.api.v1.endpoints.audio._observe_audio", lambda _features, _machine: "A steady tone is audible.")
    login(client, settings.OPERATOR_EMAIL if hasattr(settings, "OPERATOR_EMAIL") else "operator@demo.local", "Operator@Gurukul2026!")
    csrf = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    headers = {settings.CSRF_HEADER_NAME: csrf}
    response = client.post("/api/v1/audio/analyze", data={"machine_id": machine_id}, files={"file": ("machine.wav", _machine_tone_wav(), "audio/wav")}, headers=headers)
    assert response.status_code == 201
    result = response.json()
    assert result["status"] == "NO_RELIABLE_MATCH"
    assert result["reason_code"] == "NO_APPROVED_REFERENCES"
    assert result["matched_reference"] is None
    assert result["candidate_matches"] == []
    assert "no expert-approved reference" in result["message"].lower()

    silent = client.post("/api/v1/audio/analyze", data={"machine_id": machine_id}, files={"file": ("silent.wav", _machine_tone_wav(silent=True), "audio/wav")}, headers=headers)
    assert silent.status_code == 422
    assert silent.json()["error"]["code"] == "silent_audio"

    unsupported = client.post("/api/v1/audio/analyze", data={"machine_id": machine_id}, files={"file": ("sound.mp3", b"not an audio stream", "audio/mpeg")}, headers=headers)
    assert unsupported.status_code == 422
    assert unsupported.json()["error"]["code"] == "unsupported_audio_format"
