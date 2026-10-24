import pytest
from fastapi.testclient import TestClient
from app.core.config import settings


def _login(client: TestClient, email: str, password: str):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    csrf = resp.cookies.get(settings.CSRF_COOKIE_NAME)
    return csrf


def test_list_machines_unauthenticated_401(client: TestClient):
    resp = client.get("/api/v1/machines")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthenticated"


def test_create_and_list_machines(client: TestClient):
    # Expert A has machine.manage
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # 1. Create a machine
    create_resp = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "name": "Haas VF-2 CNC Mill",
            "code": "HAAS-VF2-001",
            "category": "Milling",
            "is_demo": False,
        },
    )
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["name"] == "Haas VF-2 CNC Mill"
    assert data["code"] == "HAAS-VF2-001"
    assert data["category"] == "Milling"
    assert data["is_demo"] is False
    assert "id" in data

    # 2. Duplicate machine code returns 409
    dup_resp = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "name": "Another Haas Mill",
            "code": "HAAS-VF2-001",
            "category": "Milling",
            "is_demo": False,
        },
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["error"]["code"] == "already_exists"

    # 3. List machines with q filter
    list_resp = client.get("/api/v1/machines?q=VF-2")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    assert any(m["code"] == "HAAS-VF2-001" for m in list_data["items"])


def test_machine_manage_permission_gated(client: TestClient):
    # Trainee does NOT have machine.manage
    csrf_t = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)

    # Trainee can read machines
    list_resp = client.get("/api/v1/machines")
    assert list_resp.status_code == 200

    # Trainee POST /machines gives 403
    create_resp = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf_t},
        json={
            "name": "Unauthorized Machine",
            "code": "UNAUTH-001",
            "category": "Robotics",
        },
    )
    assert create_resp.status_code == 403
    assert create_resp.json()["error"]["code"] == "forbidden"


def test_create_machine_requires_csrf(client: TestClient):
    # Login as Expert A
    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # POST without CSRF header gives 403 csrf_failed
    resp = client.post(
        "/api/v1/machines",
        json={
            "name": "No CSRF Machine",
            "code": "NOCSRF-001",
            "category": "Turning",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "csrf_failed"
