import io

from app.core.config import settings
from app.core.permissions import PERM_KNOWLEDGE_CREATE
from app.integrations.storage import set_storage_service
from app.integrations.storage.local import LocalStorageService
from app.models import Machine, Procedure, User
from app.services.media_service import MediaService

PNG = b"\x89PNG\r\n\x1a\n" + b"valid-test-image"


def _login(client, email, password):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {settings.CSRF_HEADER_NAME: response.cookies.get(settings.CSRF_COOKIE_NAME)}


def _workflow(machine_id, title, steps, operation=None, asset_ids=None):
    return {"title": title, "description": f"{title} description", "machine_id": machine_id, "operation": operation,
            "steps": steps, "asset_ids": asset_ids or []}


def test_one_machine_has_multiple_independent_workflows_with_their_own_step_attachments(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "multi-workflow")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "multi-workflow")
    try:
        expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        image = MediaService.upload(db_session, expert, [PERM_KNOWLEDGE_CREATE], None, io.BytesIO(PNG), "image",
            "image/png", "startup-panel.png", machine_id=machine.id, title="Startup panel", storage=storage)
        audio = MediaService.upload(db_session, expert, [PERM_KNOWLEDGE_CREATE], None, io.BytesIO(b"RIFF....WAVEfmt "),
            "audio", "audio/wav", "ready-tone.wav", machine_id=machine.id, title="Ready tone", storage=storage)

        headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
        first = client.post("/api/v1/procedures", headers=headers, json=_workflow(machine.id, "Morning startup", [
            {"title": "Power on", "instruction": "Switch on the main panel.", "asset_ids": [image.id, audio.id]},
            {"title": "Check status", "instruction": "Confirm the ready state."},
        ], operation="Startup"))
        second = client.post("/api/v1/procedures", headers=headers, json=_workflow(machine.id, "Evening shutdown", [
            {"title": "Park axes", "instruction": "Return axes to home."},
        ], operation="Shutdown"))
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["operation"] == "Startup"

        trainee_headers = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
        listed = client.get(f"/api/v1/procedures?machine_id={machine.id}")
        assert listed.status_code == 200
        by_id = {item["id"]: item for item in listed.json()}
        assert first.json()["id"] in by_id and second.json()["id"] in by_id
        assert [step["title"] for step in by_id[first.json()["id"]]["steps"]] == ["Power on", "Check status"]
        assert [step["title"] for step in by_id[second.json()["id"]]["steps"]] == ["Park axes"]

        assets = client.get(f"/api/v1/procedures/{first.json()['id']}/assets")
        assert assets.status_code == 200, assets.text
        by_asset = {item["id"]: item for item in assets.json()}
        assert by_asset[image.id]["filename"] == "startup-panel.png"
        assert by_asset[image.id]["size_bytes"] == len(PNG)
        assert by_asset[audio.id]["kind"] == "audio"
        assert client.get(f"/api/v1/media/{image.id}").status_code == 200
        assert client.get(f"/api/v1/procedures/{second.json()['id']}/assets").json() == []

        first_run = client.post(f"/api/v1/procedures/{first.json()['id']}/start", headers=trainee_headers)
        second_run = client.post(f"/api/v1/procedures/{second.json()['id']}/start", headers=trainee_headers)
        assert first_run.status_code == 201 and second_run.status_code == 201
        assert first_run.json()["id"] != second_run.json()["id"]
        assert len(first_run.json()["step_executions"]) == 2
        assert len(second_run.json()["step_executions"]) == 1
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_duplicate_creates_an_independent_copy(client, db_session):
    machine = db_session.query(Machine).first()
    headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    source = client.post("/api/v1/procedures", headers=headers, json=_workflow(machine.id, "Calibration", [
        {"title": "Zero the gauge", "instruction": "Set the gauge to zero.", "notes": "Use the reference block."},
    ], operation="Calibration")).json()

    duplicate = client.post(f"/api/v1/procedures/{source['id']}/duplicate", headers=headers)
    assert duplicate.status_code == 201, duplicate.text
    copy = duplicate.json()
    assert copy["id"] != source["id"]
    assert copy["title"] == "Calibration (copy)"
    assert copy["operation"] == "Calibration"
    assert copy["steps"][0]["id"] != source["steps"][0]["id"]
    assert copy["steps"][0]["details"] == {"asset_ids": [], "notes": "Use the reference block."}

    renamed = client.patch(f"/api/v1/procedures/{copy['id']}", headers=headers, json={"title": "Calibration v2", "operation": "Maintenance"})
    assert renamed.status_code == 200, renamed.text
    db_session.expire_all()
    assert db_session.get(Procedure, source["id"]).title == "Calibration"
    assert db_session.get(Procedure, copy["id"]).operation == "Maintenance"


def test_archive_hides_workflow_from_trainees_and_restore_returns_it(client, db_session):
    machine = db_session.query(Machine).first()
    headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    workflow = client.post("/api/v1/procedures", headers=headers, json=_workflow(machine.id, "Lubrication", [
        {"title": "Fill reservoir", "instruction": "Fill to the marked line."},
    ])).json()

    other_expert = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    assert client.post(f"/api/v1/procedures/{workflow['id']}/archive", headers=other_expert).status_code == 403

    headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    archived = client.post(f"/api/v1/procedures/{workflow['id']}/archive", headers=headers)
    assert archived.status_code == 200 and archived.json()["status"] == "ARCHIVED"
    assert client.patch(f"/api/v1/procedures/{workflow['id']}", headers=headers, json={"title": "Renamed"}).status_code == 409
    mine = client.get(f"/api/v1/procedures/mine/all?machine_id={machine.id}")
    assert mine.status_code == 200
    assert {item["id"]: item["status"] for item in mine.json()}[workflow["id"]] == "ARCHIVED"

    trainee_headers = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert workflow["id"] not in {item["id"] for item in client.get(f"/api/v1/procedures?machine_id={machine.id}").json()}
    assert client.post(f"/api/v1/procedures/{workflow['id']}/start", headers=trainee_headers).status_code == 404
    assert client.post(f"/api/v1/procedures/{workflow['id']}/archive", headers=trainee_headers).status_code == 403
    assert client.get("/api/v1/procedures/mine/all").status_code == 403

    headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    restored = client.post(f"/api/v1/procedures/{workflow['id']}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["status"] == "APPROVED"
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert workflow["id"] in {item["id"] for item in client.get(f"/api/v1/procedures?machine_id={machine.id}").json()}


def test_knowledge_derived_archived_workflow_cannot_be_restored(client, db_session):
    machine = db_session.query(Machine).first()
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    superseded = Procedure(title="Old revision", description="Superseded", machine_id=machine.id, author_id=author.id,
        status="ARCHIVED", knowledge_version_id="kv-superseded-revision")
    db_session.add(superseded); db_session.commit()
    headers = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.post(f"/api/v1/procedures/{superseded.id}/restore", headers=headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "procedure_superseded"
    db_session.expire_all()
    assert db_session.get(Procedure, superseded.id).status == "ARCHIVED"
