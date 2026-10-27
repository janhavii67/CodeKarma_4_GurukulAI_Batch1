import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)


def login(email: str, password: str):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_dashboard_stats_requires_auth():
    # Attempt accessing /dashboard/stats without session cookie
    unauth_client = TestClient(app)
    resp = unauth_client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 401
    err = resp.json()
    assert err["error"]["code"] == "unauthenticated"


def test_dashboard_stats_expert_metrics():
    # Login as Expert A (Author)
    res = login(settings.EXPERT_A_EMAIL, settings.EXPERT_A_PASSWORD)
    assert res.status_code == 200

    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()

    # Global metrics preserved
    assert data["total_machines"] >= 1
    assert data["approved_articles"] >= 1

    # User-scoped metrics
    assert "user_sops_created" in data
    assert "user_sops_approved" in data
    assert "user_sops_pending" in data
    assert "user_sops_draft" in data
    assert "user_revisions_count" in data
    assert "user_machines_contributed" in data
    assert "user_captured_duration_seconds" in data
    assert "pending_reviews_for_user" in data
    assert "user_reviews_completed" in data
    assert "user_procedures_completed" in data

    # Recent articles structure
    assert isinstance(data["recent_articles"], list)
    if len(data["recent_articles"]) > 0:
        item = data["recent_articles"][0]
        assert "id" in item
        assert "title" in item
        assert "status" in item
        assert "author_name" in item
        assert "machine_name" in item
        assert "version_no" in item


def test_dashboard_stats_trainee_scoping():
    # Login as Trainee
    res = login(settings.TRAINEE_EMAIL, settings.TRAINEE_PASSWORD)
    assert res.status_code == 200

    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()

    # Trainees do not have knowledge.approve permission, so pending reviews for them is 0
    assert data["pending_reviews_for_user"] == 0
    assert data["user_reviews_completed"] == 0
