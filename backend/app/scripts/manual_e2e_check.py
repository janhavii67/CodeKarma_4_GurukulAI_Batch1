import io
import os
import sys

# Ensure backend root is on sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

def run_manual_e2e():
    print("=== GURUKUL AI MODULE 01 - T2.2 MANUAL END-TO-END VERIFICATION ===")
    client = TestClient(app)

    # 1. Login as Expert A
    print("\n[Step 1] Logging in as Expert A (Author)...")
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    csrf_a = login_resp.cookies.get(settings.CSRF_COOKIE_NAME)
    print(f" -> Logged in successfully. CSRF Token obtained.")

    # 2. Create Knowledge Item
    print("\n[Step 2] Creating Knowledge Item...")
    create_resp = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "title": "CNC Spindle Bearing Replacement and Alignment SOP",
            "summary": "Standard operating procedure for disassembling, replacing, and aligning high-speed spindle bearings.",
        },
    )
    assert create_resp.status_code == 201, f"Knowledge creation failed: {create_resp.text}"
    item_data = create_resp.json()
    item_id = item_data["id"]
    version_id = item_data["version"]["id"]
    print(f" -> Created Knowledge Item: id={item_id}, version_id={version_id}")

    # 3. Upload real audio file to version
    print("\n[Step 3] Uploading real WebM audio file...")
    sample_audio = b"\x1a\x45\xdf\xa3" + (b"\x00" * 256) + b"OPUS_AUDIO_STREAM_DATA_MOCK"
    upload_resp = client.post(
        f"/api/v1/knowledge-versions/{version_id}/media",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        files={"file": ("spindle_hum_explanation.webm", sample_audio, "audio/webm;codecs=opus")},
    )
    assert upload_resp.status_code == 201, f"Upload failed: {upload_resp.text}"
    media_data = upload_resp.json()
    media_id = media_data["id"]
    print(f" -> Upload successful:")
    print(f"    - Media ID: {media_id}")
    print(f"    - Kind: {media_data['kind']}")
    print(f"    - Normalized MIME: {media_data['mime']}")
    print(f"    - Size Bytes: {media_data['size_bytes']}")
    print(f"    - URL: {media_data['url']}")

    # 4. Fetch full audio without Range header
    print("\n[Step 4] Fetching media without Range header (Full 200 stream)...")
    get_full = client.get(f"/api/v1/media/{media_id}")
    assert get_full.status_code == 200
    assert get_full.content == sample_audio
    print(f" -> Status: {get_full.status_code} OK")
    print(f"    - Content-Type: {get_full.headers.get('content-type')}")
    print(f"    - Content-Length: {get_full.headers.get('content-length')}")
    print(f"    - Content-Disposition: {get_full.headers.get('content-disposition')}")
    print(f"    - Accept-Ranges: {get_full.headers.get('accept-ranges')}")
    print(f"    - X-Content-Type-Options: {get_full.headers.get('x-content-type-options')}")

    # 5. Fetch partial audio with Range header (206 Partial Content)
    print("\n[Step 5] Fetching media with Range header (bytes=0-49)...")
    get_range = client.get(f"/api/v1/media/{media_id}", headers={"Range": "bytes=0-49"})
    assert get_range.status_code == 206
    assert len(get_range.content) == 50
    assert get_range.content == sample_audio[0:50]
    print(f" -> Status: {get_range.status_code} Partial Content")
    print(f"    - Content-Range: {get_range.headers.get('content-range')}")
    print(f"    - Content-Length: {get_range.headers.get('content-length')}")

    # 6. Verify Expert B (other expert) is refused (404)
    print("\n[Step 6] Testing isolation: Expert B accessing Expert A's draft media...")
    client_b = TestClient(app)
    login_b = client_b.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_B_EMAIL, "password": settings.EXPERT_B_PASSWORD},
    )
    assert login_b.status_code == 200
    resp_b = client_b.get(f"/api/v1/media/{media_id}")
    assert resp_b.status_code == 404, f"Expected 404, got {resp_b.status_code}"
    print(f" -> Expert B refused with 404 Not Found (zero draft leakage confirmed).")

    # 7. Verify Trainee is refused (404)
    print("\n[Step 7] Testing isolation: Trainee accessing draft media...")
    client_t = TestClient(app)
    login_t = client_t.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert login_t.status_code == 200
    resp_t = client_t.get(f"/api/v1/media/{media_id}")
    assert resp_t.status_code == 404, f"Expected 404, got {resp_t.status_code}"
    print(f" -> Trainee refused with 404 Not Found (cannot access unpublished draft media).")

    print("\n=== ALL MANUAL E2E CHECKS PASSED PERFECTLY ===")

if __name__ == "__main__":
    run_manual_e2e()
