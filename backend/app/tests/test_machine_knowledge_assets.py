import io
from app.integrations.storage import set_storage_service
from app.core.permissions import PERM_KNOWLEDGE_CREATE
from app.core.config import settings
from app.integrations.storage.local import LocalStorageService
from app.models import Machine, MediaAsset, Procedure, ProcedureRun, ProcessingJob, Transcript, User
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


def test_machine_asset_lookup_resolves_legacy_version_machine_without_cross_leakage(db_session, tmp_path):
    from app.repositories.knowledge_repository import KnowledgeRepository

    user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machines = db_session.query(Machine).order_by(Machine.id).limit(2).all()
    _, version = KnowledgeRepository.create_item_and_version_1(
        db_session,
        title="Legacy machine procedure",
        author_id=user.id,
        machine_id=machines[1].id,
        commit=False,
    )
    asset = MediaService.upload(
        db_session, user, [PERM_KNOWLEDGE_CREATE], version.id,
        io.BytesIO(PNG), "image", "image/png", "legacy-panel.png",
        storage=LocalStorageService(tmp_path / "legacy-media"),
    )
    # Recreate the pre-backfill shape: version_id is populated, machine_id is not.
    asset.machine_id = None
    db_session.commit()

    assert asset.id not in {row.id for row in MediaRepository.list_by_machine_id(db_session, machines[0].id)}
    assert asset.id in {row.id for row in MediaRepository.list_by_machine_id(db_session, machines[1].id)}


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


def test_machine_library_summary_uses_real_counts_and_hides_private_assets(client, db_session, tmp_path):
    user_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    user_b = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).one()
    machine_a, machine_b = db_session.query(Machine).order_by(Machine.id).limit(2).all()
    storage = LocalStorageService(tmp_path / "library-summary")
    owned = MediaService.upload(db_session, user_a, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "owned.png", machine_id=machine_a.id, storage=storage)
    private = MediaService.upload(db_session, user_b, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "private.png", machine_id=machine_b.id, storage=storage)
    unauthenticated = client.get(f"/api/v1/machine-knowledge/library?machine_id={machine_b.id}")
    assert unauthenticated.status_code == 401
    login = client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
    assert login.status_code == 200

    library = client.get(f"/api/v1/machine-knowledge/library?machine_id={machine_a.id}")
    assert library.status_code == 200, library.text
    assert len(library.json()) == 1
    assert library.json()[0]["id"] == machine_a.id
    assert library.json()[0]["counts"]["image"] == 0
    assert library.json()[0]["counts"]["total"] == 0

    hidden_library = client.get(f"/api/v1/machine-knowledge/library?machine_id={machine_b.id}")
    assert hidden_library.status_code == 200, hidden_library.text
    assert hidden_library.json()[0]["counts"]["image"] == 0
    assert client.get(f"/api/v1/machine-knowledge/{machine_a.id}/media?kind=image").json() == []
    assert client.get(f"/api/v1/machine-knowledge/{machine_b.id}/media?kind=image").json() == []
    assert db_session.get(MediaAsset, private.id) is not None


def test_authenticated_audio_recording_upload_persists_to_selected_machine(client, db_session, tmp_path, monkeypatch):
    storage = LocalStorageService(tmp_path / "recorded-audio")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    old_key = settings.OPENAI_API_KEY
    settings.MEDIA_ROOT = str(tmp_path / "recorded-audio")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    # Keep this persistence-only test independent of the machine's configured
    # local Whisper provider; provider-enabled queueing has its own test below.
    monkeypatch.setattr(settings, "STT_PROVIDER", "whisper_api")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    try:
        machine = db_session.query(Machine).first()
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        assert login.status_code == 200
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        webm_recording = b"\x1a\x45\xdf\xa3" + b"recorded audio payload"
        uploaded = client.post(
            f"/api/v1/machine-knowledge/{machine.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf},
            data={"kind": "audio", "title": "Recorded machine note"},
            files={"file": ("recording.webm", webm_recording, "audio/webm")},
        )
        assert uploaded.status_code == 201, uploaded.text
        asset = uploaded.json()
        assert asset["machine_id"] == machine.id
        assert asset["version_id"] is None
        assert asset["kind"] == "audio"
        assert asset["transcript_status"] == "not_configured"
        assert storage.exists(db_session.get(MediaAsset, asset["id"]).storage_key)
        listed = client.get(f"/api/v1/machine-knowledge/{machine.id}/media?kind=audio")
        assert listed.status_code == 200
        assert [row["id"] for row in listed.json()] == [asset["id"]]
    finally:
        settings.MEDIA_ROOT = old_root
        settings.OPENAI_API_KEY = old_key
        set_storage_service(None)


def test_local_whisper_audio_upload_queues_existing_transcription_job_without_api_key(client, db_session, tmp_path, monkeypatch):
    storage = LocalStorageService(tmp_path / "local-whisper-upload")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "local-whisper-upload")
    monkeypatch.setattr(settings, "STT_PROVIDER", "local_whisper")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    import app.api.v1.endpoints.media as media_endpoint

    async def no_op_processing_job(_job_id):
        return None

    monkeypatch.setattr(media_endpoint, "execute_voice_processing_job", no_op_processing_job)
    try:
        machine = db_session.query(Machine).first()
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        assert login.status_code == 200
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        recording = b"\x1a\x45\xdf\xa3" + b"fixture audio payload"
        response = client.post(
            f"/api/v1/machine-knowledge/{machine.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf},
            data={"kind": "audio", "title": "Local Whisper recording"},
            files={"file": ("local-recording.webm", recording, "audio/webm")},
        )

        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["transcript_status"] == "processing"
        assert payload["machine_id"] == machine.id
        job = db_session.query(ProcessingJob).filter(ProcessingJob.media_id == payload["id"]).one()
        assert job.status == "queued"
        assert job.user_id == payload["uploaded_by"]
        assert db_session.query(Transcript).filter(Transcript.media_id == payload["id"]).count() == 0
        assert storage.exists(db_session.get(MediaAsset, payload["id"]).storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_transcription_request_reports_missing_provider_configuration(client, db_session, tmp_path, monkeypatch):
    storage = LocalStorageService(tmp_path / "transcription-not-configured")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "transcription-not-configured")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "STT_PROVIDER", "whisper_api")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        audio = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(b"\x1a\x45\xdf\xa3recorded audio"), "audio", "audio/webm", "recording.webm",
            machine_id=machine.id, storage=storage)
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        response = client.post(f"/api/v1/voice/assets/{audio.id}/transcribe", headers={settings.CSRF_HEADER_NAME: csrf}, json={})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "transcription_not_configured"
        assert db_session.query(ProcessingJob).filter(ProcessingJob.media_id == audio.id).count() == 0
        assert storage.exists(audio.storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_transcript_edit_persists_and_keeps_original_audio_and_machine_link(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "transcript-edit")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "transcript-edit")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        audio = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(b"\x1a\x45\xdf\xa3recorded audio"), "audio", "audio/webm", "recording.webm",
            machine_id=machine.id, storage=storage)
        transcript = Transcript(media_id=audio.id, full_text="Initial transcript", status="completed", provider="test")
        db_session.add(transcript); db_session.commit()
        audio_id, transcript_id, storage_key = audio.id, transcript.id, audio.storage_key
        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        headers = {settings.CSRF_HEADER_NAME: csrf}
        fetched = client.get(f"/api/v1/voice/transcripts/{transcript_id}")
        changed = client.patch(f"/api/v1/voice/transcripts/{transcript_id}", headers=headers, json={"full_text": "Reviewed transcript text"})
        listing = client.get(f"/api/v1/machine-knowledge/{machine.id}/media?kind=transcript")

        assert fetched.status_code == 200 and fetched.json()["media_id"] == audio_id
        assert changed.status_code == 200 and changed.json()["full_text"] == "Reviewed transcript text"
        assert listing.status_code == 200 and listing.json()[0]["media_id"] == audio_id
        assert db_session.get(Transcript, transcript_id).full_text == "Reviewed transcript text"
        assert db_session.get(MediaAsset, audio_id) is not None and storage.exists(storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_transcript_is_not_visible_to_unassigned_user(client, db_session, tmp_path):
    user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    machine = db_session.query(Machine).first()
    audio = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(b"\x1a\x45\xdf\xa3recorded audio"), "audio", "audio/webm", "recording.webm",
        machine_id=machine.id, storage=LocalStorageService(tmp_path / "transcript-auth"))
    transcript = Transcript(media_id=audio.id, full_text="Private transcript", status="completed", provider="test")
    db_session.add(transcript); db_session.commit()
    trainee = client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
    response = client.get(f"/api/v1/voice/transcripts/{transcript.id}")
    machine_listing = client.get(f"/api/v1/machine-knowledge/{machine.id}/media?kind=transcript")
    assert trainee.status_code == 200
    assert response.status_code == 403
    assert machine_listing.status_code == 200 and machine_listing.json() == []


def test_private_machine_asset_cannot_be_listed_downloaded_or_referenced_by_trainee(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "private-machine-media")
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    machine = db_session.query(Machine).first()
    asset = MediaService.upload(db_session, author, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "private.png", machine_id=machine.id,
        storage=storage)
    login = client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
    headers = {settings.CSRF_HEADER_NAME: login.cookies.get(settings.CSRF_COOKIE_NAME)}

    listing = client.get(f"/api/v1/machine-knowledge/{machine.id}/media")
    download = client.get(f"/api/v1/media/{asset.id}")
    voice_listing = client.get("/api/v1/voice/assets")
    voice_detail = client.get(f"/api/v1/voice/assets/{asset.id}")
    reference = client.post("/api/v1/procedures", headers=headers, json={
        "title": "Cannot reference another author's private asset", "description": "Test", "machine_id": machine.id,
        "steps": [{"title": "Inspect", "instruction": "Inspect safely."}], "asset_ids": [asset.id],
    })

    assert login.status_code == 200
    assert listing.status_code == 200 and all(row["id"] != asset.id for row in listing.json())
    assert download.status_code == 403
    assert voice_listing.status_code == 200 and all(row["id"] != asset.id for row in voice_listing.json())
    assert voice_detail.status_code == 403
    assert reference.status_code == 403
    assert db_session.get(MediaAsset, asset.id) is not None


def test_trainee_cannot_upload_machine_audio(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "recorded-audio")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "recorded-audio")
    try:
        machine = db_session.query(Machine).first()
        login = client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
        assert login.status_code == 200
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        response = client.post(
            f"/api/v1/machine-knowledge/{machine.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf},
            data={"kind": "audio"},
            files={"file": ("recording.webm", b"\x1a\x45\xdf\xa3audio bytes", "audio/webm")},
        )
        assert response.status_code == 403
        assert db_session.query(MediaAsset).filter(MediaAsset.title == "recording.webm").count() == 0
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


def test_procedure_asset_references_are_reviewable_but_only_mutable_by_draft_owner(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "procedure-asset-auth")
    owner = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    machine = db_session.query(Machine).first()
    asset = MediaService.upload(db_session, owner, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "shared.png", machine_id=machine.id,
        storage=storage)
    procedure = Procedure(title="Private draft", description="Draft", machine_id=machine.id,
        author_id=owner.id, status="DRAFT")
    procedure.media_assets.append(asset)
    db_session.add(procedure); db_session.commit()

    login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_B_EMAIL, "password": settings.EXPERT_B_PASSWORD})
    csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
    headers = {settings.CSRF_HEADER_NAME: csrf}
    viewed = client.get(f"/api/v1/procedures/{procedure.id}/assets")
    changed = client.put(f"/api/v1/procedures/{procedure.id}/assets", headers=headers, json={"asset_ids": []})

    assert login.status_code == 200
    assert viewed.status_code == 200
    assert changed.status_code == 403
    trainee = client.post("/api/v1/auth/login", json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD})
    trainee_view = client.get(f"/api/v1/procedures/{procedure.id}/assets")
    assert trainee.status_code == 200
    assert trainee_view.status_code == 403
    db_session.expire_all()
    assert db_session.get(Procedure, procedure.id).media_assets[0].id == asset.id


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
        assert attached.json()[0]["machine_id"] == machine.id
        assert attached.json()[0]["verification_status"] == "pending_review"
        assert attached.json()[0]["mime"] == "image/png"
        assert storage.exists(asset.storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_procedure_step_assets_and_notes_persist_without_copying_files(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "step-procedure-assets")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "step-procedure-assets")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        first_asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "image", "image/png", "step-one.png", machine_id=machine.id,
            title="Existing step one image", storage=storage)
        second_asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "image", "image/png", "step-two.png", machine_id=machine.id,
            title="Existing step two image", storage=storage)
        first_storage_key, second_storage_key = first_asset.storage_key, second_asset.storage_key

        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        response = client.post("/api/v1/procedures", headers={settings.CSRF_HEADER_NAME: csrf}, json={
            "title": "Step-level reference procedure", "description": "A procedure with ordered machine references.", "machine_id": machine.id,
            "steps": [
                {"title": "Inspect", "instruction": "Inspect the visible surface.", "notes": "Use the approved checklist.", "asset_ids": [first_asset.id]},
                {"title": "Confirm", "instruction": "Confirm the indicator state.", "asset_ids": [second_asset.id]},
            ],
        })
        assert response.status_code == 201, response.text
        procedure_id = response.json()["id"]
        steps = response.json()["steps"]
        assert [step["step_order"] for step in steps] == [1, 2]
        assert steps[0]["details"] == {"asset_ids": [first_asset.id], "notes": "Use the approved checklist."}
        assert steps[1]["details"]["asset_ids"] == [second_asset.id]

        references = client.get(f"/api/v1/procedures/{procedure_id}/assets")
        assert references.status_code == 200
        assert {asset["id"] for asset in references.json()} == {first_asset.id, second_asset.id}
        assert len(references.json()) == 2
        assert all(asset["machine_id"] == machine.id for asset in references.json())
        updated_references = client.put(f"/api/v1/procedures/{procedure_id}/assets",
            headers={settings.CSRF_HEADER_NAME: csrf}, json={"asset_ids": []})
        assert updated_references.status_code == 200, updated_references.text
        assert set(updated_references.json()["asset_ids"]) == {first_asset.id, second_asset.id}
        db_session.expire_all()
        procedure = db_session.get(Procedure, procedure_id)
        assert [step.step_order for step in procedure.steps] == [1, 2]
        assert storage.exists(first_storage_key) and storage.exists(second_storage_key)
        assert db_session.get(MediaAsset, first_asset.id).storage_key == first_storage_key
        assert db_session.get(MediaAsset, second_asset.id).storage_key == second_storage_key
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_procedure_step_reference_rejects_asset_from_another_machine(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "cross-machine-step-asset")
    owner = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    machine_a, machine_b = db_session.query(Machine).order_by(Machine.id).limit(2).all()
    asset = MediaService.upload(db_session, owner, [PERM_KNOWLEDGE_CREATE], None,
        io.BytesIO(PNG), "image", "image/png", "other-machine.png", machine_id=machine_b.id,
        storage=storage)
    login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
    csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
    response = client.post("/api/v1/procedures", headers={settings.CSRF_HEADER_NAME: csrf}, json={
        "title": "Reject cross-machine reference", "description": "The asset must not cross machine boundaries.", "machine_id": machine_a.id,
        "steps": [{"title": "Inspect", "instruction": "Use the matching-machine procedure.", "asset_ids": [asset.id]}],
    })
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "machine_mismatch"
    assert db_session.query(Procedure).filter(Procedure.title == "Reject cross-machine reference").count() == 0


def test_authorized_procedure_delete_preserves_linked_machine_asset(client, db_session, tmp_path):
    storage = LocalStorageService(tmp_path / "procedure-delete")
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = str(tmp_path / "procedure-delete")
    try:
        user = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
        machine = db_session.query(Machine).first()
        asset = MediaService.upload(db_session, user, [PERM_KNOWLEDGE_CREATE], None,
            io.BytesIO(PNG), "image", "image/png", "kept.png", machine_id=machine.id,
            title="Independent asset", storage=storage)
        procedure = Procedure(title="Delete draft", description="Temporary", machine_id=machine.id,
            author_id=user.id, status="DRAFT")
        procedure.media_assets.append(asset)
        db_session.add(procedure); db_session.commit()
        procedure_id, asset_id, storage_key = procedure.id, asset.id, asset.storage_key

        login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
        csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
        response = client.delete(f"/api/v1/procedures/{procedure_id}", headers={settings.CSRF_HEADER_NAME: csrf})

        assert response.status_code == 204
        assert db_session.get(Procedure, procedure_id) is None
        db_session.expire_all()
        assert db_session.get(MediaAsset, asset_id) is not None
        assert storage.exists(storage_key)
    finally:
        settings.MEDIA_ROOT = old_root
        set_storage_service(None)


def test_procedure_delete_rejects_non_owner_and_procedures_with_runs(client, db_session):
    machine = db_session.query(Machine).first()
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    other_expert = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).first()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).first()
    protected = Procedure(title="Protected draft", description="Has run history", machine_id=machine.id,
        author_id=author.id, status="DRAFT")
    protected.runs.append(ProcedureRun(operator_id=trainee.id, status="IN_PROGRESS"))
    db_session.add(protected)
    another_draft = Procedure(title="Another expert draft", description="Owner only", machine_id=machine.id,
        author_id=author.id, status="DRAFT")
    db_session.add(another_draft); db_session.commit()

    login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_B_EMAIL, "password": settings.EXPERT_B_PASSWORD})
    csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
    headers = {settings.CSRF_HEADER_NAME: csrf}
    cross_machine = client.delete(f"/api/v1/procedures/{another_draft.id}", headers=headers)
    author_login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
    author_headers = {settings.CSRF_HEADER_NAME: author_login.cookies.get(settings.CSRF_COOKIE_NAME)}
    assert cross_machine.status_code == 403
    with_runs = client.delete(f"/api/v1/procedures/{protected.id}", headers=author_headers)
    assert with_runs.status_code == 409
    assert db_session.get(Procedure, another_draft.id) is not None
    assert db_session.get(Procedure, protected.id) is not None


def test_procedure_delete_requires_auth_and_only_deletes_drafts(client, db_session):
    machine = db_session.query(Machine).first()
    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    approved = Procedure(title="Published SOP", description="Published", machine_id=machine.id,
        author_id=author.id, status="APPROVED")
    db_session.add(approved); db_session.commit()
    unauthenticated = client.delete(f"/api/v1/procedures/{approved.id}")
    login = client.post("/api/v1/auth/login", json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD})
    csrf = login.cookies.get(settings.CSRF_COOKIE_NAME)
    headers = {settings.CSRF_HEADER_NAME: csrf}
    not_draft = client.delete(f"/api/v1/procedures/{approved.id}", headers=headers)
    missing = client.delete("/api/v1/procedures/nonexistent-procedure", headers=headers)

    assert unauthenticated.status_code == 401
    assert not_draft.status_code == 409
    assert not_draft.json()["error"]["code"] == "procedure_not_draft"
    assert missing.status_code == 404
