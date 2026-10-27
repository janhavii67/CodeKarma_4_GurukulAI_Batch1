import io
from app.integrations.storage import set_storage_service
from app.core.permissions import PERM_KNOWLEDGE_CREATE
from app.core.config import settings
from app.integrations.storage.local import LocalStorageService
from app.models import Machine, MediaAsset, Procedure, User
from app.repositories.media_repository import MediaRepository
from app.services.media_service import MediaService
from app.core.exceptions import UnsupportedMediaTypeError, ConflictError


PNG = b"\x89PNG\r\n\x1a\n" + b"valid-test-image"


def test_machine_assets_are_isolated_and_persisted(db_session, tmp_path):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machines = db_session.query(Machine).order_by(Machine.id).limit(2).all()
    storage = LocalStorageService(tmp_path / "media")
    first = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "photo.png", machine_id=machines[0].id,
        title="Control panel", tags="panel, inspection", storage=storage)
    second = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "photo.png", machine_id=machines[1].id,
        title="Other panel", storage=storage)
    assert [a.id for a in MediaRepository.list_by_machine_id(db_session, machines[0].id)] == [first.id]
    assert [a.id for a in MediaRepository.list_by_machine_id(db_session, machines[1].id)] == [second.id]
    assert first.machine_id != second.machine_id
    assert storage.exists(first.storage_key)
    db_session.expire_all()
    assert db_session.get(MediaAsset, first.id).tags == "panel, inspection"


def test_server_rejects_non_video_signature_even_when_declared_video(db_session, tmp_path):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machine = db_session.query(Machine).first()
    try:
        MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "video", "video/mp4", "not-video.mp4", machine_id=machine.id,
            storage=LocalStorageService(tmp_path / "media"))
        assert False, "Expected mismatched video signature to be rejected"
    except UnsupportedMediaTypeError:
        pass


def test_machine_note_is_a_standalone_note_asset(db_session, tmp_path):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machine = db_session.query(Machine).first()
    content = "Check the coolant return before restarting the spindle."
    note = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(content.encode()), "notes", "text/plain", "coolant-check.txt",
        machine_id=machine.id, title="Coolant observation", description="Post-maintenance note",
        tags="coolant", storage=LocalStorageService(tmp_path / "media"))
    assert note.version_id is None
    assert note.machine_id == machine.id
    assert note.kind == "notes"


def test_machine_audio_asset_persists_without_inventing_a_transcript(db_session, tmp_path, monkeypatch):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machine = db_session.query(Machine).first()
    storage = LocalStorageService(tmp_path / "media")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "STT_PROVIDER", "whisper_api")
    recording = b"\x1a\x45\xdf\xa3" + b"fake recorded bytes"
    asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(recording), "audio", "audio/webm", "voice.webm", machine_id=machine.id,
        title="Machine voice note", storage=storage)
    assert asset.kind == "audio"
    assert asset.machine_id == machine.id
    assert storage.exists(asset.storage_key)
    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).one().version_id is None


def test_procedure_asset_relation_keeps_asset_independent(db_session, tmp_path):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machine = db_session.query(Machine).first()
    asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "reference.png", machine_id=machine.id,
        storage=LocalStorageService(tmp_path / "media"))
    procedure = Procedure(title="Test procedure reference", description="Test", machine_id=machine.id,
        author_id=user.id, status="DRAFT")
    procedure.media_assets.append(asset)
    db_session.add(procedure)
    db_session.commit()
    db_session.delete(procedure)
    db_session.commit()
    db_session.expire_all()
    assert db_session.get(MediaAsset, asset.id) is not None
    assert db_session.get(MediaAsset, asset.id).machine_id == machine.id


def test_referenced_asset_cannot_be_deleted_until_unlinked(db_session, tmp_path):
    user = db_session.query(User).filter(User.role_id == "EXPERT").first()
    machine = db_session.query(Machine).first()
    storage = LocalStorageService(tmp_path / "media")
    asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "ref.png", machine_id=machine.id, storage=storage)
    procedure = Procedure(title="Keeps media", description="Test", machine_id=machine.id, author_id=user.id, status="DRAFT")
    procedure.media_assets.append(asset); db_session.add(procedure); db_session.commit()
    try:
        MediaService.delete(db_session, user, [PERM_KNOWLEDGE_CREATE], asset.id, storage=storage)
        assert False, "Expected referenced asset deletion to be refused"
    except ConflictError as exc:
        assert exc.code == "asset_referenced"
    assert storage.exists(asset.storage_key)


def test_authenticated_machine_note_upload_lists_after_refetch(client, db_session, tmp_path):
    from app.integrations.storage.local import LocalStorageService
    from app.models import Machine
    from app.core.config import settings
    storage = LocalStorageService(tmp_path / "api-media")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "api-media")
    try:
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        assert login.status_code == 200
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        machine = db_session.query(Machine).first()
        resp = client.post(f"/api/v1/machine-knowledge/{machine.id}/notes",
            headers={settings.CSRF_HEADER_NAME: csrf},
            data={"title": "Pump vibration", "content": "Check the pump coupling.", "tags": "pump"})
        assert resp.status_code == 201, resp.text
        assert resp.json()["machine_id"] == machine.id
        listing = client.get(f"/api/v1/machine-knowledge/{machine.id}/media?kind=notes")
        assert listing.status_code == 200
        assert listing.json()[0]["content"] == "Check the pump coupling."
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_machine_upload_auth_validation_and_isolation(client, db_session, tmp_path):
    from app.integrations.storage.local import LocalStorageService
    storage = LocalStorageService(tmp_path / "api-media")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "api-media")
    try:
        machine_a, machine_b = db_session.query(Machine).order_by(Machine.id).limit(2).all()
        unauth = client.post(f"/api/v1/machine-knowledge/{machine_a.id}/media", files={"file": ("photo.png", PNG, "image/png")})
        assert unauth.status_code == 401
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        headers = {settings.CSRF_HEADER_NAME: csrf}
        saved = client.post(f"/api/v1/machine-knowledge/{machine_a.id}/media", headers=headers,
            data={"kind": "image", "title": "Panel image"}, files={"file": ("photo.png", PNG, "image/png")})
        assert saved.status_code == 201, saved.text
        assert saved.json()["machine_id"] == machine_a.id
        assert client.get(f"/api/v1/machine-knowledge/{machine_b.id}/media").json() == []
        bad = client.post(f"/api/v1/machine-knowledge/{machine_a.id}/media", headers=headers,
            data={"kind": "video"}, files={"file": ("still.png", PNG, "image/png")})
        assert bad.status_code == 422
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_procedure_asset_api_enforces_same_machine(client, db_session, tmp_path):
    from app.integrations.storage.local import LocalStorageService
    storage = LocalStorageService(tmp_path / "api-media")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "api-media")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine_a, machine_b = db_session.query(Machine).order_by(Machine.id).limit(2).all()
        procedure = Procedure(title="Reference test", description="Test", machine_id=machine_a.id, author_id=user.id, status="DRAFT")
        db_session.add(procedure); db_session.commit()
        asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "image", "image/png", "ref.png", machine_id=machine_b.id,
            storage=storage)
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        resp = client.put(f"/api/v1/procedures/{procedure.id}/assets", headers={settings.CSRF_HEADER_NAME: csrf}, json={"asset_ids": [asset.id]})
        assert resp.status_code == 403
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_expert_creates_procedure_with_existing_same_machine_asset(client, db_session, tmp_path):
    from app.integrations.storage.local import LocalStorageService
    storage = LocalStorageService(tmp_path / "api-media")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "api-media")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "image", "image/png", "guide.png", machine_id=machine.id,
            title="Inspection guide", storage=storage)
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        resp = client.post("/api/v1/procedures", headers={settings.CSRF_HEADER_NAME: csrf}, json={
            "title": "Inspect machine", "description": "Visual inspection checklist", "machine_id": machine.id,
            "steps": [{"title": "Check panel", "instruction": "Inspect the panel for damage."}], "asset_ids": [asset.id],
        })
        assert resp.status_code == 201, resp.text
        procedure_id = resp.json()["id"]
        attached = client.get(f"/api/v1/procedures/{procedure_id}/assets")
        assert attached.status_code == 200
        assert attached.json()[0]["id"] == asset.id
        assert storage.exists(asset.storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)
