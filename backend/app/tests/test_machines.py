import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.core.config import settings
from app.models.machine import Machine, MachineCategory, Tool
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import Procedure
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

    dup_case_resp = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"name": "Case-insensitive duplicate", "code": "haas-vf2-002"},
    )
    assert dup_case_resp.status_code == 409

    # 3. List machines with q filter
    list_resp = client.get("/api/v1/machines?q=VF-2")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 1
    assert any(m["code"] == "HAAS-VF2-002" for m in list_data["items"])


def test_active_medical_categories_filter_and_register_by_database_id(client, db_session):
    active = MachineCategory(
        id="ultrasound-systems",
        name="Ultrasound Systems",
        description="Diagnostic ultrasound equipment.",
    )
    legacy = MachineCategory(
        id="legacy-industrial",
        name="Legacy Industrial Category",
        is_active=False,
    )
    db_session.add_all([active, legacy])
    db_session.flush()

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    categories = client.get("/api/v1/machines/categories")
    assert categories.status_code == 200
    assert any(item["id"] == active.id for item in categories.json())
    assert all(item["id"] != legacy.id for item in categories.json())

    response = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={
            "name": "Ultrasound",
            "code": "US-TEST-001",
            "model_number": "US-9000",
            "serial_number": "US-SERIAL-001",
            "manufacturer": "Medical Systems Ltd",
            "location": "Imaging room 2",
            "status": "ACTIVE",
            "specifications": "Diagnostic imaging unit",
            "category_id": active.id,
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["id"]
    assert created["name"] == "Ultrasound"
    assert created["category_id"] == active.id
    assert created["category_name"] == active.name
    assert created["is_active"] is True
    assert created["model_number"] == "US-9000"
    assert created["serial_number"] == "US-SERIAL-001"
    assert created["manufacturer"] == "Medical Systems Ltd"
    assert created["location"] == "Imaging room 2"
    assert created["specifications"] == "Diagnostic imaging unit"

    diary = client.get(f"/api/v1/machine-knowledge/library?machine_id={created['id']}")
    assert diary.status_code == 200
    assert len(diary.json()) == 1
    assert diary.json()[0]["id"] == created["id"]
    assert diary.json()[0]["name"] == "Ultrasound"
    assert diary.json()[0]["counts"]["total"] == 0

    by_category_id = client.get(f"/api/v1/machines?category={active.id}")
    assert by_category_id.status_code == 200
    assert any(item["id"] == created["id"] for item in by_category_id.json()["items"])

    inactive_category = client.post(
        "/api/v1/machines",
        headers={settings.CSRF_HEADER_NAME: csrf},
        json={"name": "Bad category selection", "code": "BAD-CAT-001", "category_id": legacy.id},
    )
    assert inactive_category.status_code == 422


def test_machine_knowledge_library_only_lists_active_machines(client, db_session):
    inactive_machine = db_session.query(Machine).order_by(Machine.id).first()
    assert inactive_machine is not None
    inactive_machine.is_active = False
    db_session.commit()
    active_machine_ids = {
        machine.id
        for machine in db_session.query(Machine).filter(Machine.is_active.is_(True)).all()
    }

    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.get("/api/v1/machine-knowledge/library")

    assert response.status_code == 200, response.text
    assert {machine["id"] for machine in response.json()} == active_machine_ids
    assert inactive_machine.id not in {machine["id"] for machine in response.json()}

    inactive_detail = client.get(
        f"/api/v1/machine-knowledge/library?machine_id={inactive_machine.id}"
    )
    assert inactive_detail.status_code == 404


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


def test_delete_machine_detaches_references_and_preserves_linked_records(client, db_session):
    machine = _add_test_machine(db_session, "machine-delete-referenced")
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    knowledge_records = [
        KnowledgeItem(
            title=f"Retained machine knowledge {number}",
            machine_id=machine.id,
            author_id=expert.id,
            category="GENERAL",
            status="DRAFT",
        )
        for number in (1, 2)
    ]
    tool = Tool(name="Retained tool", tool_number="RET-001", machine_id=machine.id)
    procedure = Procedure(
        title="Retained procedure",
        description="Procedure content remains after the machine is removed.",
        machine_id=machine.id,
        author_id=expert.id,
        status="DRAFT",
    )
    db_session.add_all([*knowledge_records, tool, procedure])
    db_session.flush()
    versions = [
        KnowledgeVersion(
            item_id=item.id,
            version_no=1,
            title=item.title,
            status="draft",
            origin="expert",
            created_by=expert.id,
        )
        for item in knowledge_records
    ]
    db_session.add_all(versions)
    db_session.flush()
    knowledge_ids = [item.id for item in knowledge_records]
    knowledge_titles = {item.title for item in knowledge_records}
    tool_id, procedure_id = tool.id, procedure.id

    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.delete(
        f"/api/v1/machines/{machine.id}",
        headers={settings.CSRF_HEADER_NAME: csrf},
    )

    assert response.status_code == 204
    assert db_session.get(Machine, machine.id) is None
    retained_knowledge = [db_session.get(KnowledgeItem, item_id) for item_id in knowledge_ids]
    assert all(item is not None and item.machine_id is None and item.is_archived for item in retained_knowledge)
    retained_tool = db_session.get(Tool, tool_id)
    assert retained_tool is not None and retained_tool.machine_id is None
    retained_procedure = db_session.get(Procedure, procedure_id)
    assert retained_procedure is not None and retained_procedure.machine_id is None

    audit = db_session.query(AuditLog).filter(
        AuditLog.action == "machine.delete", AuditLog.entity_id == machine.id
    ).one()
    assert audit.detail["detached_references"]["knowledge_items"] == 2
    assert audit.detail["detached_references"]["procedures"] == 1
    assert audit.detail["archived_knowledge_items"] == 2

    library = client.get("/api/v1/knowledge")
    assert library.status_code == 200
    assert knowledge_titles.isdisjoint({item["title"] for item in library.json()["items"]})


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
