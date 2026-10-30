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


def get_csrf(client: TestClient):
    return client.get("/api/v1/auth/csrf").json()["csrf_token"]


def test_trainee_cannot_access_review_queue(client: TestClient):
    """Trainee must be forbidden from accessing the peer review queue."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp = client.get("/api/v1/reviews/queue")
    assert resp.status_code == 403
    data = resp.json()
    assert data["error"]["code"] == "forbidden"


def test_trainee_cannot_create_knowledge(client: TestClient):
    """Trainee must be forbidden from authoring/publishing knowledge."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    csrf = get_csrf(client)
    resp = client.post(
        "/api/v1/knowledge",
        json={"title": "Unauthorized SOP", "category": "cnc-milling", "content": "Test content"},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


def test_trainee_cannot_register_machines(client: TestClient):
    """Trainee must be forbidden from registering machines in the catalog."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    csrf = get_csrf(client)
    resp = client.post(
        "/api/v1/machines",
        json={
            "name": "Unauthorized Machine",
            "model_number": "UNAUTH-100",
            "category_id": "cnc-milling",
            "status": "ACTIVE",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


def test_trainee_dashboard_and_curriculum_access(client: TestClient):
    """Trainee receives personalized, real database-backed learning metrics."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp = client.get("/api/v1/learning/dashboard")
    assert resp.status_code == 200
    data = resp.json()

    assert "Continue your manufacturing training" in data["welcome_message"]
    assert data["role_id"] == "TRAINEE"
    assert data["assigned_paths_count"] >= 1
    assert len(data["assigned_paths"]) >= 1
    path = data["assigned_paths"][0]
    assert "CNC Machinist Level 1" in path["path_title"]
    assert path["progress_percentage"] >= 0
    assert len(path["items"]) >= 1

    # In-progress procedures
    assert data["in_progress_procedures_count"] >= 1
    run = data["in_progress_procedures"][0]
    assert run["procedure_title"] is not None
    assert run["status"] == "IN_PROGRESS"

    # Notifications
    assert len(data["notifications"]) >= 1


def test_trainee_cannot_view_another_operators_procedure_run(client: TestClient):
    """Trainee cannot access another operator's procedure run."""
    # 1. Expert A starts a run
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    csrf = get_csrf(client)
    proc_list = client.get("/api/v1/procedures").json()
    proc_id = proc_list[0]["id"]
    expert_run = client.post(
        f"/api/v1/procedures/{proc_id}/start",
        headers={"X-CSRF-Token": csrf},
    ).json()
    expert_run_id = expert_run["id"]

    # 2. Trainee logs in and tries to peek at Expert A's run
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    peek_resp = client.get(f"/api/v1/procedures/runs/{expert_run_id}")
    assert peek_resp.status_code == 403
    assert peek_resp.json()["error"]["code"] == "unauthorized_run"


def test_trainee_sound_analysis_execution(client: TestClient, db_session, monkeypatch):
    """Trainee can submit machine audio for acoustic comparison."""
    machine = db_session.query(Machine).filter_by(code="MACH-CT12", is_active=True).first()
    if machine is None:
        machine = Machine(name="CT-Scan", code="MACH-CT12", category="Medical Imaging", status="ACTIVE", is_active=True)
        db_session.add(machine)
        db_session.flush()
    machine_id = machine.id
    monkeypatch.setattr("app.api.v1.endpoints.audio._observe_audio", lambda _features, _machine: "A steady tone is audible.")
    client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
    csrf = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    samples = array("h", (int(12_000 * math.sin(2 * math.pi * 440 * index / 16_000)) for index in range(16_000)))
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16_000)
        wav.writeframes(samples.tobytes())
    resp = client.post(
        "/api/v1/audio/analyze",
        data={"machine_id": machine_id},
        files={"file": ("machine.wav", output.getvalue(), "audio/wav")},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "NO_RELIABLE_MATCH"
    assert data["reason_code"] == "NO_APPROVED_REFERENCES"
    assert data["candidate_matches"] == []


def test_trainee_notification_read_lifecycle(client: TestClient):
    """Trainee can mark own notification as read."""
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    csrf = get_csrf(client)
    notifs = client.get("/api/v1/learning/notifications").json()
    assert len(notifs) >= 1
    target_notif = notifs[0]

    mark_resp = client.post(
        f"/api/v1/learning/notifications/{target_notif['id']}/read",
        headers={"X-CSRF-Token": csrf},
    )
    assert mark_resp.status_code == 200
    assert mark_resp.json()["status"] == "success"
