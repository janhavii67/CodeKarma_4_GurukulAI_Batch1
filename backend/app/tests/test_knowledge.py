import concurrent.futures
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.audit import AuditLog
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_CHANGES_REQUESTED,
    STATUS_REJECTED,
    STATUS_APPROVED,
    STATUS_PUBLISHED,
    STATUS_SUPERSEDED,
    STATUS_WITHDRAWN,
    ORIGIN_EXPERT,
)
from app.models.machine import Machine
from app.models.user import User
from app.services.knowledge_service import KnowledgeService


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    return resp.cookies.get(settings.CSRF_COOKIE_NAME)


def test_knowledge_create_flow_and_permissions(client: TestClient, db_session: Session):
    # 1. Trainee cannot create knowledge -> 403
    csrf_t = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_trainee = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_t},
        json={"title": "Trainee Attempt"},
    )
    assert resp_trainee.status_code == 403
    assert resp_trainee.json()["error"]["code"] == "forbidden"

    # 2. Expert A creates knowledge -> 201
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # Invalid title (empty) -> 422
    resp_empty_title = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "   "},
    )
    assert resp_empty_title.status_code == 422

    # Invalid machine_id -> 422
    resp_bad_machine = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Valid Title", "machine_id": "non-existent-machine-id"},
    )
    assert resp_bad_machine.status_code == 422
    assert resp_bad_machine.json()["error"]["code"] == "validation_error"

    # Valid creation
    resp_valid = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "title": "CNC Setup and Calibration Procedure",
            "description": "Standard setup protocol for 3-axis CNC machines.",
        },
    )
    assert resp_valid.status_code == 201
    data = resp_valid.json()
    assert data["title"] == "CNC Setup and Calibration Procedure"
    assert data["current_published_version_id"] is None
    assert data["version"]["version_no"] == 1
    assert data["version"]["status"] == "draft"
    assert data["version"]["origin"] == "expert"
    assert data["version"]["description"] == "Standard setup protocol for 3-axis CNC machines."
    assert data["version"]["steps"] == []

    # Audit log verified
    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "knowledge.create", AuditLog.entity_id == data["id"])
        .first()
    )
    assert audit is not None
    assert audit.entity_type == "knowledge_item"


def test_knowledge_library_hides_items_for_inactive_machines(client: TestClient, db_session: Session):
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    machine = Machine(
        id="inactive-machine-knowledge-list",
        name="Archived equipment",
        code="ARCHIVED-KNOWLEDGE-001",
        is_active=False,
    )
    item = KnowledgeItem(
        id="inactive-machine-knowledge-item",
        title="Legacy equipment diary",
        machine_id=machine.id,
        author_id=expert.id,
        category="GENERAL",
        status="DRAFT",
    )
    version = KnowledgeVersion(
        id="inactive-machine-knowledge-version",
        item_id=item.id,
        version_no=1,
        title=item.title,
        status=STATUS_DRAFT,
        origin=ORIGIN_EXPERT,
        created_by=expert.id,
    )
    db_session.add_all([machine, item, version])
    db_session.flush()

    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    response = client.get("/api/v1/knowledge")

    assert response.status_code == 200
    assert all(row["title"] != item.title for row in response.json()["items"])


def test_update_and_persistence(client: TestClient):
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)

    # 1. Create draft
    create_resp = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Spindle Inspection"},
    )
    assert create_resp.status_code == 201
    item_id = create_resp.json()["id"]

    # 2. Patch draft with steps, summary, title
    patch_resp = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "title": "Spindle Inspection and Alignment",
            "summary": "Step-by-step spindle diagnostic SOP.",
            "steps": [
                {
                    "order": 99,  # Should be normalized to 1
                    "title": "Lock Out Machine",
                    "instruction": "Engage E-stop and padlock the main breaker.",
                    "tools": ["Safety Lockout Padlock", "Tagout Tag"],
                    "safety_warning": "High voltage hazard.",
                    "needs_review": False,
                },
                {
                    "order": 42,  # Should be normalized to 2
                    "title": "Mount Dial Indicator",
                    "instruction": "Secure magnetic base indicator to spindle nose.",
                    "tools": ["Dial Indicator", "Magnetic Base"],
                    "expected_result": "Total runout < 0.005mm.",
                    "stop_condition": "Runout exceeds 0.015mm, halt and alert supervisor.",
                },
            ],
        },
    )
    assert patch_resp.status_code == 200
    v_data = patch_resp.json()
    assert v_data["summary"] == "Step-by-step spindle diagnostic SOP."
    assert len(v_data["steps"]) == 2
    assert v_data["steps"][0]["order"] == 1
    assert v_data["steps"][0]["title"] == "Lock Out Machine"
    assert v_data["steps"][1]["order"] == 2
    assert v_data["steps"][1]["title"] == "Mount Dial Indicator"

    # 3. Reload GET /knowledge/{id} and assert identical data
    get_resp = client.get(f"/api/v1/knowledge/{item_id}")
    assert get_resp.status_code == 200
    reloaded = get_resp.json()
    assert reloaded["title"] == "Spindle Inspection and Alignment"
    assert reloaded["version"]["summary"] == "Step-by-step spindle diagnostic SOP."
    assert len(reloaded["version"]["steps"]) == 2
    assert reloaded["version"]["steps"][0]["order"] == 1
    assert reloaded["version"]["steps"][1]["order"] == 2


def test_step_schema_validation_and_invariants(client: TestClient):
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    create_resp = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Step Validation Test"},
    )
    item_id = create_resp.json()["id"]

    # 1. Unknown fields are rejected (extra="forbid") -> 422
    bad_step_resp = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "steps": [
                {
                    "title": "Step 1",
                    "instruction": "Instruction 1",
                    "unknown_field": "disallowed",
                }
            ]
        },
    )
    assert bad_step_resp.status_code == 422

    # 2. needs_review=true and ai_generated=true are preserved exactly
    save_resp = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "steps": [
                {
                    "title": "AI Drafted Step",
                    "instruction": "Unchecked instruction",
                    "needs_review": True,
                    "ai_generated": True,
                    "source_segment_ids": [101, 102],
                }
            ]
        },
    )
    assert save_resp.status_code == 200
    steps = save_resp.json()["steps"]
    assert steps[0]["needs_review"] is True
    assert steps[0]["ai_generated"] is True
    assert steps[0]["source_segment_ids"] == [101, 102]

    # 3. Re-saving without clearing preserves needs_review
    save_again = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={
            "steps": [
                {
                    "title": "AI Drafted Step",
                    "instruction": "Unchecked instruction",
                    "needs_review": True,
                    "ai_generated": True,
                    "source_segment_ids": [101, 102],
                }
            ]
        },
    )
    assert save_again.status_code == 200
    assert save_again.json()["steps"][0]["needs_review"] is True


def test_ownership_and_visibility_isolation(client: TestClient):
    # Expert A creates draft
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    create_resp = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Expert A Confidential Draft"},
    )
    item_id = create_resp.json()["id"]
    version_id = create_resp.json()["version"]["id"]

    # 1. Expert B accessing Expert A's draft -> 404 (NOT 403, no leakage)
    csrf_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    resp_b_get = client.get(f"/api/v1/knowledge/{item_id}")
    assert resp_b_get.status_code == 404
    assert resp_b_get.json()["error"]["code"] == "not_found"

    resp_b_patch = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"summary": "Unauthorized Edit Attempt"},
    )
    assert resp_b_patch.status_code == 404

    # Expert B listing versions -> 404
    resp_b_versions = client.get(f"/api/v1/knowledge/{item_id}/versions")
    assert resp_b_versions.status_code == 404

    # 2. Trainee accessing Expert A's draft -> 404
    csrf_t = _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    resp_t_get = client.get(f"/api/v1/knowledge/{item_id}")
    assert resp_t_get.status_code in (403, 404)

    resp_t_get_ver = client.get(f"/api/v1/knowledge/{item_id}?version_id={version_id}")
    assert resp_t_get_ver.status_code in (403, 404)

    # Trainee write attempt -> 403
    resp_t_patch = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_t},
        json={"summary": "Trainee Edit Attempt"},
    )
    assert resp_t_patch.status_code == 403


def test_frozen_versions_reject_edits(client: TestClient, db_session: Session):
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    create_resp = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Frozen State Testing"},
    )
    item_id = create_resp.json()["id"]
    version_id = create_resp.json()["version"]["id"]

    frozen_statuses = [
        STATUS_IN_REVIEW,
        STATUS_APPROVED,
        STATUS_REJECTED,
        STATUS_PUBLISHED,
        STATUS_SUPERSEDED,
        STATUS_WITHDRAWN,
    ]

    ver = db_session.get(KnowledgeVersion, version_id)

    for st in frozen_statuses:
        ver.status = st
        db_session.commit()

        # Author attempts to edit frozen version -> 409
        resp = client.patch(
            f"/api/v1/knowledge/{item_id}",
            headers={settings.CSRF_HEADER_NAME: csrf_a},
            json={"summary": f"Edit attempt while {st}"},
        )
        assert resp.status_code == 409, f"Status {st} should reject edits with 409"
        assert resp.json()["error"]["code"] == "frozen_version"

    # changes_requested allows editing
    ver.status = STATUS_CHANGES_REQUESTED
    db_session.commit()

    resp_ok = client.patch(
        f"/api/v1/knowledge/{item_id}",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"summary": "Edit allowed during changes_requested"},
    )
    assert resp_ok.status_code == 200
    assert resp_ok.json()["summary"] == "Edit allowed during changes_requested"


def test_visibility_matrix_and_list_leakage(client: TestClient, db_session: Session):
    # Create Item 1: Published live (Fixture directly in DB)
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    pub_item = KnowledgeItem(
        title="Published Factory Manual",
        author_id=expert_a.id,
        is_demo=False,
    )
    db_session.add(pub_item)
    db_session.flush()

    pub_ver = KnowledgeVersion(
        item_id=pub_item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Verified and published procedures.",
        steps=[{"order": 1, "title": "Step 1", "instruction": "Do it"}],
        origin=ORIGIN_EXPERT,
        created_by=expert_a.id,
    )
    db_session.add(pub_ver)
    db_session.flush()

    pub_item.current_published_version_id = pub_ver.id
    db_session.commit()

    # Create Item 2: Expert A private draft
    csrf_a = _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    resp_draft = client.post(
        "/api/v1/knowledge",
        headers={settings.CSRF_HEADER_NAME: csrf_a},
        json={"title": "Expert A Private Calibration Draft"},
    )
    draft_item_id = resp_draft.json()["id"]

    # 1. Trainee GET /knowledge: sees published item ONLY, never sees draft item
    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    trainee_list = client.get("/api/v1/knowledge").json()
    titles = [it["title"] for it in trainee_list["items"]]
    assert "Published Factory Manual" in titles
    assert "Expert A Private Calibration Draft" not in titles

    # 2. Expert B GET /knowledge: sees published item, never sees Expert A private draft
    _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)
    b_list = client.get("/api/v1/knowledge").json()
    b_titles = [it["title"] for it in b_list["items"]]
    assert "Published Factory Manual" in b_titles
    assert "Expert A Private Calibration Draft" not in b_titles

    # 3. in_review version: visible to Reviewer (knowledge.approve)
    # Set draft to in_review
    draft_ver = db_session.query(KnowledgeVersion).filter(KnowledgeVersion.item_id == draft_item_id).first()
    draft_ver.status = STATUS_IN_REVIEW
    db_session.commit()

    # Expert B (has knowledge.approve) can now view the in_review version
    resp_b_review = client.get(f"/api/v1/knowledge/{draft_item_id}")
    assert resp_b_review.status_code == 200
    assert resp_b_review.json()["version"]["status"] == STATUS_IN_REVIEW


def test_revisions_flow(client: TestClient, db_session: Session):
    expert_a = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()

    # Seed published item with v1
    item = KnowledgeItem(
        title="Lathe Operation SOP",
        author_id=expert_a.id,
        is_demo=False,
    )
    db_session.add(item)
    db_session.flush()

    v1 = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="V1 summary content",
        description="V1 description",
        steps=[{"order": 1, "title": "Inspect chuck", "instruction": "Check 3 jaws."}],
        origin=ORIGIN_EXPERT,
        created_by=expert_a.id,
    )
    db_session.add(v1)
    db_session.flush()

    item.current_published_version_id = v1.id
    db_session.commit()

    # Expert B creates revision v2
    csrf_b = _login(client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)

    # Empty revision reason -> 422
    resp_empty_reason = client.post(
        f"/api/v1/knowledge/{item.id}/versions",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"revision_reason": "   "},
    )
    assert resp_empty_reason.status_code == 422

    # Valid revision creation
    resp_rev = client.post(
        f"/api/v1/knowledge/{item.id}/versions",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"revision_reason": "Updating safety warnings for high-speed carbide tooling."},
    )
    assert resp_rev.status_code == 201
    v2_data = resp_rev.json()
    assert v2_data["version_no"] == 2
    assert v2_data["status"] == "draft"
    assert v2_data["origin"] == "expert"
    assert v2_data["summary"] == "V1 summary content"
    assert v2_data["description"] == "V1 description"
    assert len(v2_data["steps"]) == 1
    assert v2_data["steps"][0]["title"] == "Inspect chuck"

    # Attempting to create another revision while v2 is open -> 409
    resp_dup_draft = client.post(
        f"/api/v1/knowledge/{item.id}/versions",
        headers={settings.CSRF_HEADER_NAME: csrf_b},
        json={"revision_reason": "Another parallel draft attempt"},
    )
    assert resp_dup_draft.status_code == 409
    assert resp_dup_draft.json()["error"]["code"] == "open_draft_exists"

    # Published pointer untouched
    db_session.refresh(item)
    assert item.current_published_version_id == v1.id


def test_version_lookup_and_compare_return_saved_snapshots_and_enforce_visibility(client: TestClient, db_session: Session):
    from app.db.base import utc_now

    author = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()
    item = KnowledgeItem(title="Revision comparison", author_id=author.id, is_demo=False)
    db_session.add(item); db_session.flush()
    v1 = KnowledgeVersion(
        item_id=item.id, version_no=1, status=STATUS_PUBLISHED,
        title="Inspection v1", machine_id=None, summary="Check the spindle.",
        description="First description", safety_warnings="Stop power first.",
        content="Shared inspection instructions.",
        steps=[{"order": 1, "title": "Inspect", "instruction": "Look for visible wear."}],
        origin=ORIGIN_EXPERT, created_by=author.id, published_at=utc_now(),
    )
    db_session.add(v1); db_session.flush(); item.current_published_version_id = v1.id
    v2 = KnowledgeVersion(
        item_id=item.id, version_no=2, status=STATUS_DRAFT,
        title="Inspection v2", machine_id=None, summary="Inspect spindle and chuck.",
        description="Second description", safety_warnings="Isolate power and verify zero energy.",
        content="Shared inspection instructions.",
        steps=[
            {"order": 1, "title": "Inspect", "instruction": "Look for visible wear."},
            {"order": 2, "title": "Measure", "instruction": "Record runout."},
        ],
        origin=ORIGIN_EXPERT, created_by=author.id,
    )
    db_session.add(v2); db_session.commit()

    _login(client, settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    version_lookup = client.get(f"/api/v1/knowledge/{item.id}/versions/2")
    comparison = client.get(f"/api/v1/knowledge/{item.id}/compare?base_version=1&target_version=2")
    same_version = client.get(f"/api/v1/knowledge/{item.id}/compare?base_version=1&target_version=1")

    assert version_lookup.status_code == 200
    assert version_lookup.json()["title"] == "Inspection v2"
    assert comparison.status_code == 200
    payload = comparison.json()
    assert payload["base"]["version_no"] == 1 and payload["target"]["version_no"] == 2
    assert payload["base"]["steps"] != payload["target"]["steps"]
    assert set(payload["changed_fields"]) == {"title", "summary", "description", "safety_warnings", "steps"}
    assert same_version.status_code == 422
    assert same_version.json()["error"]["code"] == "identical_versions"

    _login(client, settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    private_compare = client.get(f"/api/v1/knowledge/{item.id}/compare?base_version=1&target_version=2")
    missing = client.get(f"/api/v1/knowledge/{item.id}/versions/99")
    assert private_compare.status_code == 403
    assert missing.status_code == 404


def test_concurrency_revision_creation(threadsafe_env):
    ts_client, ts_db = threadsafe_env
    expert_a = ts_db.query(User).filter(User.email == settings.EXPERT_A_EMAIL).first()

    # Seed published item into the same DB the client reads from
    item = KnowledgeItem(
        title="Concurrent Test Machine Item",
        author_id=expert_a.id,
        is_demo=False,
    )
    ts_db.add(item)
    ts_db.flush()

    v1 = KnowledgeVersion(
        item_id=item.id,
        version_no=1,
        status=STATUS_PUBLISHED,
        summary="Concurrent Base V1",
        steps=[],
        origin=ORIGIN_EXPERT,
        created_by=expert_a.id,
    )
    ts_db.add(v1)
    ts_db.flush()

    item.current_published_version_id = v1.id
    ts_db.commit()

    csrf_b = _login(ts_client, settings.EXPERT_B_EMAIL, settings.EXPERT_B_PASSWORD)

    # Fire 5 parallel revision creation requests
    results = []
    item_id = str(item.id)

    def make_request(idx):
        return ts_client.post(
            f"/api/v1/knowledge/{item_id}/versions",
            headers={settings.CSRF_HEADER_NAME: csrf_b},
            json={"revision_reason": f"Parallel revision attempt {idx}"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(make_request, i) for i in range(5)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    status_codes = [r.status_code for r in results]
    assert status_codes.count(201) == 1, f"Exactly one request should succeed 201: {status_codes}"
    assert status_codes.count(409) == 4, f"The rest should return 409: {status_codes}"


def test_validate_for_submission():
    # 1. Empty summary and no steps -> problem
    v1 = KnowledgeVersion(summary="", steps=[])
    problems = KnowledgeService.validate_for_submission(v1, item_title="Valid Title")
    assert any("summary or at least one step" in p for p in problems)

    # 2. Empty title -> problem
    problems_title = KnowledgeService.validate_for_submission(v1, item_title="   ")
    assert any("Title cannot be empty" in p for p in problems_title)

    # 3. Step with missing instruction -> problem
    v2 = KnowledgeVersion(
        summary="Has summary",
        steps=[{"title": "Step 1", "instruction": "   "}],
    )
    problems_step = KnowledgeService.validate_for_submission(v2, item_title="Valid Title")
    assert any("missing an instruction" in p for p in problems_step)

    # 4. Valid version -> empty problems list
    v3 = KnowledgeVersion(
        summary="Valid summary",
        steps=[{"title": "Step 1", "instruction": "Valid instruction."}],
    )
    valid_problems = KnowledgeService.validate_for_submission(v3, item_title="Valid Title")
    assert valid_problems == []
