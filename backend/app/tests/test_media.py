import io
from pathlib import Path
import tempfile
from typing import Any, Dict, Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.permissions import PERM_KNOWLEDGE_APPROVE, PERM_KNOWLEDGE_CREATE
from app.integrations.storage import set_storage_service
from app.integrations.storage.local import LocalStorageService
from app.models.audit import AuditLog
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_APPROVED,
    STATUS_CHANGES_REQUESTED,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_PUBLISHED,
    STATUS_REJECTED,
    STATUS_SUPERSEDED,
    STATUS_WITHDRAWN,
)
from app.models.media import MediaAsset
from app.models.user import User
from app.repositories.knowledge_repository import KnowledgeRepository
from app.repositories.media_repository import MediaRepository
from app.scripts.reconcile_media import reconcile_media
from app.services.knowledge_service import KnowledgeService
from app.services.media_service import MediaService


# Minimal valid byte fixtures
SAMPLE_WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 60
SAMPLE_MP3 = b"ID3\x03\x00\x00\x00\x00\x00\x0a" + b"\x00" * 100
SAMPLE_WAV = (
    b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    + b"\x00" * 50
)
SAMPLE_MP4 = b"\x00\x00\x00\x20ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 100
SAMPLE_OGG = b"OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00" + b"\x00" * 50
SAMPLE_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89" + b"\x00" * 50
SAMPLE_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00" + b"\x00" * 50
SAMPLE_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    return resp.cookies.get(settings.CSRF_COOKIE_NAME)


@pytest.fixture(autouse=True)
def temp_storage_env() -> Generator[LocalStorageService, None, None]:
    """Provides a fresh isolated temporary directory for media storage per test."""
    temp_dir = tempfile.TemporaryDirectory()
    storage = LocalStorageService(media_root=temp_dir.name)
    set_storage_service(storage)
    old_root = settings.MEDIA_ROOT
    settings.MEDIA_ROOT = temp_dir.name

    yield storage

    settings.MEDIA_ROOT = old_root
    set_storage_service(None)
    temp_dir.cleanup()


def _create_item_and_version(
    db: Session,
    user: User,
    title: str = "Test Procedure",
    status_val: str = STATUS_DRAFT,
) -> Tuple[KnowledgeItem, KnowledgeVersion]:
    item, version = KnowledgeRepository.create_item_and_version_1(
        db=db,
        title=title,
        author_id=user.id,
        summary="Test summary",
        commit=False,
    )
    if status_val != STATUS_DRAFT:
        version.status = status_val
    db.commit()
    db.refresh(item)
    db.refresh(version)
    return item, version



def test_media_config_endpoint(client: TestClient):
    # 1. Unauthenticated -> 401
    resp_unauth = client.get("/api/v1/media/config")
    assert resp_unauth.status_code == 401

    # 2. Authenticated -> 200
    csrf = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    resp = client.get("/api/v1/media/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["max_upload_bytes"] == settings.MAX_UPLOAD_BYTES
    assert data["max_media_per_version"] == settings.MAX_MEDIA_PER_VERSION
    assert "audio" in data["allowed_mime_types"]
    assert "video" in data["allowed_mime_types"]
    assert "image" in data["allowed_mime_types"]
    assert "document" in data["allowed_mime_types"]


def test_upload_happy_paths(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    test_cases = [
        # (filename, bytes, content_type, expected_kind, expected_mime)
        ("recording.webm", SAMPLE_WEBM, "audio/webm;codecs=opus", "audio", "audio/webm"),
        ("audio.mp3", SAMPLE_MP3, "audio/mpeg", "audio", "audio/mpeg"),
        ("sound.wav", SAMPLE_WAV, "audio/wav", "audio", "audio/wav"),
        ("sound_alias.wav", SAMPLE_WAV, "audio/x-wav", "audio", "audio/wav"),
        ("track.m4a", SAMPLE_MP4, "audio/mp4", "audio", "audio/mp4"),
        ("voice.ogg", SAMPLE_OGG, "audio/ogg", "audio", "audio/ogg"),
        ("clip.mp4", SAMPLE_MP4, "video/mp4", "video", "video/mp4"),
        ("video.webm", SAMPLE_WEBM, "video/webm", "video", "video/webm"),
        ("diagram.png", SAMPLE_PNG, "image/png", "image", "image/png"),
        ("photo.jpg", SAMPLE_JPEG, "image/jpeg", "image", "image/jpeg"),
        ("photo_alias.jpg", SAMPLE_JPEG, "image/pjpeg", "image", "image/jpeg"),
        ("manual.pdf", SAMPLE_PDF, "application/pdf", "document", "application/pdf"),
    ]

    for fname, data_bytes, ctype, expected_kind, expected_mime in test_cases:
        resp = client.post(
            f"/api/v1/knowledge-versions/{version.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf_a},
            files={"file": (fname, data_bytes, ctype)},
        )
        assert resp.status_code == 201, f"Failed for {fname}: {resp.text}"
        res = resp.json()
        assert res["kind"] == expected_kind
        assert res["mime"] == expected_mime
        assert res["version_id"] == version.id
        assert res["size_bytes"] == len(data_bytes)
        assert res["url"] == f"/api/v1/media/{res['id']}"
        assert "storage_key" not in res


def test_upload_authorization(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item_a, version_a = _create_item_and_version(db_session, expert_a)

    # 1. Unauthenticated -> 401
    resp_unauth = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_unauth.status_code == 401

    # 2. Trainee -> 403 (missing knowledge.create)
    csrf_t = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_trainee = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_t},
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_trainee.status_code == 403
    assert resp_trainee.json()["error"]["code"] == "forbidden"

    # 3. Expert B accessing Expert A's draft -> 404 (never leak existence)
    csrf_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    resp_exp_b = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_exp_b.status_code == 404
    assert resp_exp_b.json()["error"]["code"] == "not_found"

    # 4. Expert A accessing nonexistent version -> 404
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    resp_nonexistent = client.post(
        "/api/v1/knowledge-versions/non-existent-version-uuid/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_nonexistent.status_code == 404

    # Confirm 404 bodies for non-owned and nonexistent are identical
    assert resp_exp_b.json()["error"]["message"] == resp_nonexistent.json()["error"]["message"]

    # 5. Missing CSRF header -> 403 csrf_failed
    resp_no_csrf = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_no_csrf.status_code == 403
    assert resp_no_csrf.json()["error"]["code"] == "csrf_failed"

    # 6. Frozen versions -> 409
    frozen_statuses = [
        STATUS_IN_REVIEW,
        STATUS_APPROVED,
        STATUS_REJECTED,
        STATUS_PUBLISHED,
        STATUS_SUPERSEDED,
        STATUS_WITHDRAWN,
    ]
    for st in frozen_statuses:
        _, ver_frozen = _create_item_and_version(
            db_session, expert_a, title=f"Frozen {st}", status_val=st
        )
        resp_frozen = client.post(
            f"/api/v1/knowledge-versions/{ver_frozen.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf_a},
            files={"file": ("test.png", SAMPLE_PNG, "image/png")},
        )
        assert resp_frozen.status_code == 409, f"Expected 409 for status {st}, got {resp_frozen.status_code}"
        assert resp_frozen.json()["error"]["code"] == "frozen_version"

    # 7. changes_requested -> allows upload
    _, ver_changes = _create_item_and_version(
        db_session, expert_a, title="Changes Requested", status_val=STATUS_CHANGES_REQUESTED
    )
    resp_changes = client.post(
        f"/api/v1/knowledge-versions/{ver_changes.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("test.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_changes.status_code == 201


def test_upload_validation_and_sanitization(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # 1. Zero-byte upload -> 422 empty_file
    resp_zero = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert resp_zero.status_code == 422
    assert resp_zero.json()["error"]["code"] == "empty_file"

    # 2. Unsupported MIME (text/plain) -> 415
    resp_txt = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )
    assert resp_txt.status_code == 415
    assert resp_txt.json()["error"]["code"] == "unsupported_media_type"

    # 3. SVG and HTML rejected -> 415
    resp_svg = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("vector.svg", b"<svg></svg>", "image/svg+xml")},
    )
    assert resp_svg.status_code == 415

    resp_html = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("page.html", b"<html></html>", "text/html")},
    )
    assert resp_html.status_code == 415

    # 4. Extension .png with non-png content (signature mismatch) -> 415
    resp_fake_png = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("fake.png", b"not a png at all", "image/png")},
    )
    assert resp_fake_png.status_code == 415
    assert resp_fake_png.json()["error"]["code"] == "unsupported_media_type"

    # 5. Declared image/png with JPEG content -> 415
    resp_png_with_jpeg = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("image.png", SAMPLE_JPEG, "image/png")},
    )
    assert resp_png_with_jpeg.status_code == 415

    # 6. Kind mismatch (declared kind video for png file) -> 422 kind_mismatch
    resp_mismatch = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        data={"kind": "video"},
        files={"file": ("diagram.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_mismatch.status_code == 422
    assert resp_mismatch.json()["error"]["code"] == "kind_mismatch"

    # 7. Filename sanitization: path traversal, null bytes, long names, unicode
    dirty_name = "../../../etc/\x00secret  diagram \t\n\u0917\u0941\u0930\u0941\u0915\u0941\u0932 " + ("A" * 300) + ".png"
    resp_dirty = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": (dirty_name, SAMPLE_PNG, "image/png")},
    )
    assert resp_dirty.status_code == 201
    sanitized = resp_dirty.json()["original_name"]
    assert "/" not in sanitized
    assert "\\" not in sanitized
    assert "\x00" not in sanitized
    assert len(sanitized) <= 255
    assert sanitized.endswith(".png")


def test_per_version_media_cap(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Pre-populate 20 assets directly via repository
    for i in range(20):
        MediaRepository.create(
            db=db_session,
            version_id=version.id,
            kind="image",
            storage_key=f"aa/bb/{i:032d}.png",
            original_name=f"test_{i}.png",
            mime="image/png",
            size_bytes=100,
            uploaded_by=expert_a.id,
            commit=True,
        )

    # 21st upload -> 409 media_cap_reached
    resp_cap = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("diagram.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_cap.status_code == 409
    assert resp_cap.json()["error"]["code"] == "media_cap_reached"


def test_size_limit_enforcement(client: TestClient, db_session: Session, temp_storage_env: LocalStorageService):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Configure a tiny limit for test
    old_max = settings.MAX_UPLOAD_BYTES
    settings.MAX_UPLOAD_BYTES = 500  # 500 bytes

    try:
        oversized_data = SAMPLE_WEBM + (b"\x00" * 1000)  # ~1064 bytes

        # 1. Attempt upload with oversized payload
        resp_oversized = client.post(
            f"/api/v1/knowledge-versions/{version.id}/media",
            headers={settings.CSRF_HEADER_NAME: csrf_a},
            files={"file": ("large.webm", oversized_data, "audio/webm")},
        )
        assert resp_oversized.status_code == 413
        assert resp_oversized.json()["error"]["code"] == "payload_too_large"

        # Verify no file or temp file left in storage
        storage_files = list(Path(temp_storage_env.media_root).glob("**/*"))
        regular_files = [p for p in storage_files if p.is_file()]
        assert len(regular_files) == 0, f"Found leftover files in storage: {regular_files}"

        # Verify no DB row created
        assets = MediaRepository.list_by_version_id(db_session, version.id)
        assert len(assets) == 0

    finally:
        settings.MAX_UPLOAD_BYTES = old_max


def test_download_streaming_and_headers(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    expert_b = db_session.query(User).filter(User.email == settings.EXPERT_B_EMAIL).first()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).first()

    item_a, version_a = _create_item_and_version(db_session, expert_a, status_val=STATUS_DRAFT)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Upload PDF and Audio assets to version_a
    resp_pdf = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("manual.pdf", SAMPLE_PDF, "application/pdf")},
    )
    assert resp_pdf.status_code == 201
    pdf_id = resp_pdf.json()["id"]

    resp_audio = client.post(
        f"/api/v1/knowledge-versions/{version_a.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("sound.wav", SAMPLE_WAV, "audio/wav")},
    )
    assert resp_audio.status_code == 201
    audio_id = resp_audio.json()["id"]

    # 1. Author streams own draft media -> 200
    resp_stream = client.get(f"/api/v1/media/{audio_id}")
    assert resp_stream.status_code == 200
    assert resp_stream.content == SAMPLE_WAV
    assert resp_stream.headers["Content-Type"] == "audio/wav"
    assert resp_stream.headers["Content-Length"] == str(len(SAMPLE_WAV))
    assert resp_stream.headers["Accept-Ranges"] == "bytes"
    assert resp_stream.headers["X-Content-Type-Options"] == "nosniff"
    assert resp_stream.headers["Cache-Control"] == "private, no-store"
    assert "Content-Disposition" in resp_stream.headers

    # PDF response contains sandbox CSP
    resp_pdf_stream = client.get(f"/api/v1/media/{pdf_id}")
    assert resp_pdf_stream.status_code == 200
    assert resp_pdf_stream.headers["Content-Security-Policy"] == "sandbox"

    # 2. Expert B gets 404 for Expert A's draft media
    _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    resp_b = client.get(f"/api/v1/media/{audio_id}")
    assert resp_b.status_code == 404

    # 3. Trainee gets 404 for draft media
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_t = client.get(f"/api/v1/media/{audio_id}")
    assert resp_t.status_code == 404

    # 4. Trainee gets 200 for media attached to the current published version
    item_pub, ver_pub = _create_item_and_version(
        db_session, expert_a, title="Published Item", status_val=STATUS_PUBLISHED
    )
    item_pub.current_published_version_id = ver_pub.id
    db_session.commit()

    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    # Upload media directly attached to ver_pub via service (since HTTP upload checks editable status)
    pub_asset = MediaService.upload(
        db=db_session,
        user=expert_a,
        permissions=[PERM_KNOWLEDGE_CREATE],
        version_id=ver_pub.id,
        upload_file=io.BytesIO(SAMPLE_PNG),
        declared_content_type="image/png",
        original_name="published_photo.png",
    ) if False else None

    # Attach asset to ver_pub via MediaRepository
    storage = set_storage_service(None) or LocalStorageService(settings.MEDIA_ROOT)
    set_storage_service(storage)
    key_pub = "11/22/33333333333333333333333333333333.png"
    storage.save(key_pub, io.BytesIO(SAMPLE_PNG))
    asset_pub = MediaRepository.create(
        db=db_session,
        version_id=ver_pub.id,
        kind="image",
        storage_key=key_pub,
        original_name="published_photo.png",
        mime="image/png",
        size_bytes=len(SAMPLE_PNG),
        uploaded_by=expert_a.id,
        commit=True,
    )

    # Trainee can stream published media
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_t_pub = client.get(f"/api/v1/media/{asset_pub.id}")
    assert resp_t_pub.status_code == 200
    assert resp_t_pub.content == SAMPLE_PNG

    # 5. In_review media visible to reviewer (Expert B)
    item_rev, ver_rev = _create_item_and_version(
        db_session, expert_a, title="Review Item", status_val=STATUS_IN_REVIEW
    )
    key_rev = "44/55/66666666666666666666666666666666.pdf"
    storage.save(key_rev, io.BytesIO(SAMPLE_PDF))
    asset_rev = MediaRepository.create(
        db=db_session,
        version_id=ver_rev.id,
        kind="document",
        storage_key=key_rev,
        original_name="review.pdf",
        mime="application/pdf",
        size_bytes=len(SAMPLE_PDF),
        uploaded_by=expert_a.id,
        commit=True,
    )

    # Expert B has knowledge.approve -> 200
    _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    resp_b_rev = client.get(f"/api/v1/media/{asset_rev.id}")
    assert resp_b_rev.status_code == 200
    assert resp_b_rev.content == SAMPLE_PDF

    # Trainee -> 404 for in_review media
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_t_rev = client.get(f"/api/v1/media/{asset_rev.id}")
    assert resp_t_rev.status_code == 404


def test_http_range_support(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Upload video with known bytes (100 bytes of data)
    test_data = SAMPLE_MP4  # 132 bytes
    total_len = len(test_data)

    resp_up = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("video.mp4", test_data, "video/mp4")},
    )
    assert resp_up.status_code == 201
    media_id = resp_up.json()["id"]

    # 1. bytes=0-49 (first 50 bytes) -> 206
    resp_r1 = client.get(f"/api/v1/media/{media_id}", headers={"Range": "bytes=0-49"})
    assert resp_r1.status_code == 206
    assert resp_r1.content == test_data[0:50]
    assert resp_r1.headers["Content-Length"] == "50"
    assert resp_r1.headers["Content-Range"] == f"bytes 0-49/{total_len}"

    # 2. bytes=50- (from byte 50 to end) -> 206
    resp_r2 = client.get(f"/api/v1/media/{media_id}", headers={"Range": "bytes=50-"})
    assert resp_r2.status_code == 206
    assert resp_r2.content == test_data[50:]
    assert resp_r2.headers["Content-Range"] == f"bytes 50-{total_len - 1}/{total_len}"

    # 3. bytes=-30 (suffix range, last 30 bytes) -> 206
    resp_r3 = client.get(f"/api/v1/media/{media_id}", headers={"Range": "bytes=-30"})
    assert resp_r3.status_code == 206
    assert resp_r3.content == test_data[-30:]
    assert resp_r3.headers["Content-Range"] == f"bytes {total_len - 30}-{total_len - 1}/{total_len}"

    # 4. Unsatisfiable range (start >= total) -> 416
    resp_unsat = client.get(f"/api/v1/media/{media_id}", headers={"Range": f"bytes={total_len + 10}-"})
    assert resp_unsat.status_code == 416
    assert resp_unsat.headers["Content-Range"] == f"bytes */{total_len}"

    # 5. Multi-range -> ignored, returns full 200 response
    resp_multi = client.get(f"/api/v1/media/{media_id}", headers={"Range": "bytes=0-10,20-30"})
    assert resp_multi.status_code == 200
    assert resp_multi.content == test_data


def test_delete_flow_and_audit(client: TestClient, db_session: Session, temp_storage_env: LocalStorageService):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    resp_up = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("photo.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_up.status_code == 201
    media_id = resp_up.json()["id"]

    asset = MediaRepository.get_by_id(db_session, media_id)
    assert asset is not None
    storage_key = asset.storage_key
    assert temp_storage_env.exists(storage_key) is True

    # 1. Trainee attempt to delete -> 403
    csrf_t = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_t_del = client.delete(
        f"/api/v1/media/{media_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_t},
    )
    assert resp_t_del.status_code == 403

    # 2. Expert B attempt to delete Expert A's media -> 404
    csrf_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    resp_b_del = client.delete(
        f"/api/v1/media/{media_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
    )
    assert resp_b_del.status_code == 404

    # 3. Author deletes own media -> 204
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    resp_del = client.delete(
        f"/api/v1/media/{media_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
    )
    assert resp_del.status_code == 204

    # Row is gone in DB
    assert MediaRepository.get_by_id(db_session, media_id) is None
    # Storage file is unlinked
    assert temp_storage_env.exists(storage_key) is False

    # Audit log entry exists
    audit_log = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "media.delete", AuditLog.entity_id == media_id)
        .first()
    )
    assert audit_log is not None
    assert audit_log.actor_id == expert_a.id
    assert audit_log.detail["kind"] == "image"
    assert "key" not in audit_log.detail or audit_log.detail.get("key") == "[REDACTED]"

    # 4. Deleting twice returns 404
    resp_del_again = client.delete(
        f"/api/v1/media/{media_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
    )
    assert resp_del_again.status_code == 404


def test_storage_path_traversal_rejection(temp_storage_env: LocalStorageService):
    # 1. Invalid key formats
    with pytest.raises(ValueError):
        temp_storage_env.save("../traversal.png", io.BytesIO(b"data"))

    with pytest.raises(ValueError):
        temp_storage_env.save("/etc/passwd", io.BytesIO(b"data"))

    with pytest.raises(ValueError):
        temp_storage_env.save("ab/cd/../escape.png", io.BytesIO(b"data"))

    # 2. Valid key format succeeds
    valid_key = "ab/cd/0123456789abcdef0123456789abcdef.png"
    bytes_written = temp_storage_env.save(valid_key, io.BytesIO(b"valid content"))
    assert bytes_written == len(b"valid content")
    assert temp_storage_env.exists(valid_key) is True


def test_reconciliation_script(db_session: Session, temp_storage_env: LocalStorageService):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)

    # 1. Create a DB record whose file does NOT exist on disk (missing file)
    missing_key = "aa/bb/11111111111111111111111111111111.png"
    asset_missing = MediaRepository.create(
        db=db_session,
        version_id=version.id,
        kind="image",
        storage_key=missing_key,
        original_name="missing.png",
        mime="image/png",
        size_bytes=100,
        uploaded_by=expert_a.id,
        commit=True,
    )

    # 2. Create an orphaned file in storage with no DB record
    orphan_key = "cc/dd/22222222222222222222222222222222.png"
    temp_storage_env.save(orphan_key, io.BytesIO(SAMPLE_PNG))

    # Run reconcile in dry-run mode with safety_seconds=0
    orphans, missing = reconcile_media(safety_seconds=0, delete_orphans=False, db=db_session)
    assert orphan_key in orphans
    assert missing_key in missing

    # Orphaned file still exists after dry-run
    assert temp_storage_env.exists(orphan_key) is True

    # Run reconcile with delete_orphans=True
    orphans_del, _ = reconcile_media(safety_seconds=0, delete_orphans=True, db=db_session)
    assert orphan_key in orphans_del
    # Now orphaned file was removed
    assert temp_storage_env.exists(orphan_key) is False

    # DB record for missing asset is untouched
    assert MediaRepository.get_by_id(db_session, asset_missing.id) is not None


def test_failure_injection_db_error_cleans_file(
    db_session: Session, temp_storage_env: LocalStorageService, monkeypatch
):
    nested = db_session.begin_nested()
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)

    # Monkeypatch MediaRepository.create to raise an error
    def _mock_create(*args, **kwargs):
        raise RuntimeError("Simulated DB connection drop")

    monkeypatch.setattr(MediaRepository, "create", _mock_create)

    with pytest.raises(RuntimeError):
        MediaService.upload(
            db=db_session,
            user=expert_a,
            permissions=[PERM_KNOWLEDGE_CREATE],
            version_id=version.id,
            upload_file=io.BytesIO(SAMPLE_PNG),
            declared_content_type="image/png",
            original_name="photo.png",
            storage=temp_storage_env,
        )

    # Confirm storage has no files remaining
    storage_files = [p for p in Path(temp_storage_env.media_root).glob("**/*") if p.is_file()]
    assert len(storage_files) == 0, f"Leftover files found in storage: {storage_files}"


def test_failure_injection_storage_delete_failure(
    client: TestClient, db_session: Session, temp_storage_env: LocalStorageService, monkeypatch
):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Upload an asset normally
    resp_up = client.post(
        f"/api/v1/knowledge-versions/{version.id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("photo.png", SAMPLE_PNG, "image/png")},
    )
    assert resp_up.status_code == 201
    media_id = resp_up.json()["id"]

    # Monkeypatch storage.delete to fail
    def _mock_delete(*args, **kwargs):
        raise OSError("Simulated disk read-only or lock error")

    monkeypatch.setattr(temp_storage_env, "delete", _mock_delete)

    # Deleting via endpoint should still return 204 (DB first committed)
    resp_del = client.delete(
        f"/api/v1/media/{media_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
    )
    assert resp_del.status_code == 204

    # DB row is gone
    assert MediaRepository.get_by_id(db_session, media_id) is None


def test_missing_file_on_disk_safe_error(client: TestClient, db_session: Session, temp_storage_env: LocalStorageService):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item, version = _create_item_and_version(db_session, expert_a)
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Create DB row pointing to missing key
    asset = MediaRepository.create(
        db=db_session,
        version_id=version.id,
        kind="image",
        storage_key="ee/ff/33333333333333333333333333333333.png",
        original_name="missing.png",
        mime="image/png",
        size_bytes=100,
        uploaded_by=expert_a.id,
        commit=True,
    )

    resp = client.get(f"/api/v1/media/{asset.id}")
    assert resp.status_code == 404
    error_msg = resp.json()["error"]["message"]
    # Verify no absolute paths or storage keys in error message
    assert "C:" not in error_msg
    assert "/" not in error_msg
    assert "\\" not in error_msg

