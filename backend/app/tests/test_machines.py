import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.core.config import settings
from app.models.machine import Machine, Tool
from app.models.knowledge import KnowledgeItem
from app.models.audit import AuditLog
from app.models.user import User


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
            "name": "Haas VF-2 CNC Mill Unit 2",
            "code": "HAAS-VF2-002",
            "category": "Milling",
            "is_demo": False,
        },
    )
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["name"] == "Haas VF-2 CNC Mill Unit 2"
    assert data["code"] == "HAAS-VF2-002"
    assert data["category"] == "Milling"
    assert data["is_demo"] is False
    assert "id" in data

    # 2. Duplicate machine code returns 409
    dup_resp = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "name": "Another Haas Mill",
            "code": "HAAS-VF2-002",
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
    assert any(m["code"] == "HAAS-VF2-002" for m in list_data["items"])


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


def _add_test_machine(db_session, machine_id: str = "machine-delete-empty") -> Machine:
    machine = Machine(
        id=machine_id,
        name="Temporary deletion test machine",
        code=f"{machine_id}-CODE",
        status="ACTIVE",
        is_demo=False,
    )
    db_session.add(machine)
    db_session.flush()
    return machine


def test_delete_unused_machine_requires_auth_csrf_and_machine_permission(client, db_session):
    machine = _add_test_machine(db_session)

    assert client.delete(f"/api/v1/machines/{machine.id}").status_code == 401

    trainee = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    csrf_trainee = trainee.cookies.get(settings.CSRF_COOKIE_NAME)
    denied = client.delete(
        f"/api/v1/machines/{machine.id}",
        headers={settings.CSRF_HEADER_NAME: csrf_trainee},
    )
    assert denied.status_code == 403

    expert_csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    missing_csrf = client.delete(f"/api/v1/machines/{machine.id}")
    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["error"]["code"] == "csrf_failed"

    deleted = client.delete(
        f"/api/v1/machines/{machine.id}",
        headers={settings.CSRF_HEADER_NAME: expert_csrf},
    )
    assert deleted.status_code == 204
    assert db_session.get(Machine, machine.id) is None
    audit = db_session.query(AuditLog).filter(
        AuditLog.action == "machine.delete", AuditLog.entity_id == machine.id
    ).one()
    assert audit.entity_type == "machine"


def test_delete_machine_with_knowledge_and_tools_is_rejected_without_data_loss(client, db_session):
    machine = _add_test_machine(db_session, "machine-delete-referenced")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    knowledge = KnowledgeItem(
        title="Retained machine knowledge",
        machine_id=machine.id,
        author_id=expert.id,
        category="GENERAL",
        status="DRAFT",
    )
    tool = Tool(name="Retained tool", tool_number="RET-001", machine_id=machine.id)
    db_session.add_all([knowledge, tool])
    db_session.flush()
    knowledge_id, tool_id = knowledge.id, tool.id

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.delete(
        f"/api/v1/machines/{machine.id}",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "machine_in_use"
    assert "knowledge records" in response.json()["error"]["message"]
    assert "assigned tools" in response.json()["error"]["message"]
    assert db_session.get(Machine, machine.id) is not None
    assert db_session.get(KnowledgeItem, knowledge_id) is not None
    assert db_session.get(Tool, tool_id) is not None


def test_delete_machine_checks_unmodeled_database_foreign_keys(client, db_session):
    machine = _add_test_machine(db_session, "machine-delete-hidden-history")
    db_session.execute(text(
        "CREATE TABLE machine_delete_guard_test ("
        "id INTEGER PRIMARY KEY, machine_id VARCHAR(36) NOT NULL "
        "REFERENCES machines(id) ON DELETE CASCADE, payload TEXT)"
    ))
    db_session.execute(
        text("INSERT INTO machine_delete_guard_test (machine_id, payload) VALUES (:machine_id, :payload)"),
        {"machine_id": machine.id, "payload": "retain this history"},
    )

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.delete(
        f"/api/v1/machines/{machine.id}",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "machine_in_use"
    assert db_session.get(Machine, machine.id) is not None
    assert db_session.execute(text("SELECT COUNT(*) FROM machine_delete_guard_test")).scalar_one() == 1
    db_session.execute(text("DROP TABLE machine_delete_guard_test"))


def test_delete_machine_not_found_returns_404(client):
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.delete(
        "/api/v1/machines/does-not-exist",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "machine_not_found"
