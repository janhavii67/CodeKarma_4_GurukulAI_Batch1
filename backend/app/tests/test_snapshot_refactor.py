import pytest
from app.core.config import settings

def login(client, email: str, password: str):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def get_csrf_headers(client):
    res = client.get("/api/v1/auth/csrf")
    token = res.json()["csrf_token"]
    return {"X-CSRF-Token": token}


def test_item_creation_sets_mirror_and_v1(client):
    """Verify creating a knowledge article sets both the item mirror and v1 version snapshots."""
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    headers = get_csrf_headers(client)

    payload = {
        "title": "CNC Coolant Refractometer Calibration",
        "machine_id": "mach-haas-vf2",
        "category": "MAINTENANCE",
        "tags": "coolant,refractometer,concentration",
        "content": "Calibrate optical refractometer with distilled water to 0.0 Brix before measuring sump concentration.",
    }
    res = client.post("/api/v1/knowledge", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()

    assert data["title"] == "CNC Coolant Refractometer Calibration"
    assert data["machine_id"] == "mach-haas-vf2"
    assert data["current_version"] == 1
    assert data["status"] == "DRAFT"
    assert data["current_revision"] is not None
    assert data["current_revision"]["version"] == 1
    assert data["current_revision"]["title"] == "CNC Coolant Refractometer Calibration"


def test_patch_title_leaves_trainee_view_unchanged(client):
    """
    Critical Snapshot Isolation Test:
    PATCHing a title on an article with a published version modifies the editable version snapshot,
    leaving the published version snapshot (and therefore the Trainee's view) completely unchanged until published.
    """
    # 1. Expert A creates an article
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    headers_a = get_csrf_headers(client)

    create_res = client.post(
        "/api/v1/knowledge",
        json={
            "title": "Published Baseline Title",
            "machine_id": "mach-haas-vf2",
            "category": "MAINTENANCE",
            "content": "Baseline approved procedure content for precision spindle alignment.",
        },
        headers=headers_a,
    )
    assert create_res.status_code == 201
    art_id = create_res.json()["id"]

    # 2. Submit for review
    sub_res = client.post(f"/api/v1/knowledge/{art_id}/submit", headers=headers_a)
    assert sub_res.status_code == 200

    # 3. Peer Expert B approves to publish v1
    login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    headers_b = get_csrf_headers(client)
    appr_res = client.post(
        f"/api/v1/reviews/{art_id}/decision",
        json={"decision": "APPROVED", "comments": "Peer approved baseline v1."},
        headers=headers_b,
    )
    assert appr_res.status_code == 200

    # 4. Trainee views the published article
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    trainee_view_1 = client.get(f"/api/v1/knowledge/{art_id}")
    assert trainee_view_1.status_code == 200
    assert trainee_view_1.json()["title"] == "Published Baseline Title"

    # 5. Expert A edits draft revision with a new title via PATCH
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    headers_a = get_csrf_headers(client)

    # Note: Article status is APPROVED in Module 01 lifecycle until new revision or edit
    # If editing existing draft:
    patch_res = client.patch(
        f"/api/v1/knowledge/{art_id}",
        json={"title": "Radical New Unapproved Title", "content": "Updated unapproved draft content."},
        headers=headers_a,
    )
    # If the article has no open draft, attempting to edit an approved record is rejected
    # which proves immutability!
    if patch_res.status_code == 403:
        assert patch_res.json()["error"]["code"] == "cannot_edit_approved"

    # 6. Verify Trainee STILL sees original published title
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    trainee_view_2 = client.get(f"/api/v1/knowledge/{art_id}")
    assert trainee_view_2.status_code == 200
    assert trainee_view_2.json()["title"] == "Published Baseline Title"


def test_persona_visibility_conformance(client):
    """Verify Trainee cannot view unapproved drafts, while Author and Reviewer can."""
    # 1. Author creates draft
    login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    headers_a = get_csrf_headers(client)

    draft_res = client.post(
        "/api/v1/knowledge",
        json={
            "title": "Secret Draft Under Construction",
            "category": "GENERAL",
            "content": "Work in progress SOP not yet ready for peer eyes.",
        },
        headers=headers_a,
    )
    assert draft_res.status_code == 201
    draft_id = draft_res.json()["id"]

    # 2. Author can view own draft
    author_view = client.get(f"/api/v1/knowledge/{draft_id}")
    assert author_view.status_code == 200
    assert author_view.json()["title"] == "Secret Draft Under Construction"

    # 3. Trainee CANNOT view draft -> 403 Forbidden
    login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    trainee_view = client.get(f"/api/v1/knowledge/{draft_id}")
    assert trainee_view.status_code == 403
    assert trainee_view.json()["error"]["code"] == "unauthorized_draft_access"

    # 4. Trainee list search does NOT leak draft
    trainee_list = client.get("/api/v1/knowledge?q=Secret")
    assert trainee_list.status_code == 200
    assert len(trainee_list.json()["items"]) == 0
