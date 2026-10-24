import pytest
from fastapi.testclient import TestClient
from app.core.config import settings
from app.models.user import User


def test_valid_login_and_cookies(client: TestClient):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == settings.EXPERT_A_EMAIL.lower()
    assert data["user"]["role_id"] == "EXPERT"
    assert "knowledge.create" in data["permissions"]

    # Verify cookies set
    assert settings.SESSION_COOKIE_NAME in resp.cookies
    assert settings.CSRF_COOKIE_NAME in resp.cookies


def test_invalid_login_generic_error(client: TestClient):
    # Wrong password
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": "WrongPassword123!"},
    )
    assert resp.status_code == 401
    err = resp.json()["error"]
    assert err["code"] == "unauthenticated"
    assert err["message"] == "Invalid email or password."

    # Non-existent user (must yield same generic message)
    resp2 = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@demo.local", "password": "Password123!"},
    )
    assert resp2.status_code == 401
    assert resp2.json()["error"]["message"] == "Invalid email or password."


def test_auth_me_authenticated_and_unauthenticated(client: TestClient):
    # Unauthenticated
    resp_unauth = client.get("/api/v1/auth/me")
    assert resp_unauth.status_code == 401
    assert resp_unauth.json()["error"]["code"] == "unauthenticated"

    # Authenticate
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert login_resp.status_code == 200

    # Call /auth/me with session cookie
    resp_me = client.get("/api/v1/auth/me")
    assert resp_me.status_code == 200
    data = resp_me.json()
    assert data["user"]["email"] == settings.TRAINEE_EMAIL.lower()
    assert data["user"]["role_id"] == "TRAINEE"
    assert "knowledge.view_published" in data["permissions"]
    assert "knowledge.create" not in data["permissions"]


def test_logout_revokes_session(client: TestClient):
    # Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    assert login_resp.status_code == 200
    csrf_token = login_resp.cookies.get(settings.CSRF_COOKIE_NAME)

    # Logout with CSRF header
    logout_resp = client.post(
        "/api/v1/auth/logout",
        headers={settings.CSRF_HEADER_NAME: csrf_token},
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json()["status"] == "logged_out"

    # Attempting to access /auth/me after logout should now fail
    resp_after = client.get("/api/v1/auth/me")
    assert resp_after.status_code == 401


def test_registration_creates_trainee_only(client: TestClient):
    new_email = "new.worker@factory.local"
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": new_email,
            "name": "New Trainee Worker",
            "password": "SecurePassword123!",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["user"]["email"] == new_email
    assert data["user"]["role_id"] == "TRAINEE"
    assert "knowledge.create" not in data["permissions"]

    # Verify cookies set
    assert settings.SESSION_COOKIE_NAME in resp.cookies
    assert settings.CSRF_COOKIE_NAME in resp.cookies


def test_duplicate_registration_fails(client: TestClient):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": settings.TRAINEE_EMAIL,
            "name": "Devendra Duplicate",
            "password": "SecurePassword123!",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "already_exists"


def test_weak_password_validation(client: TestClient):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@factory.local",
            "name": "Weak User",
            "password": "weak",  # too short
        },
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_deactivated_user_blocked(client: TestClient, db_session):
    # Deactivate trainee
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).first()
    trainee.is_active = False
    db_session.commit()

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "user_deactivated"


def test_csrf_protection_on_state_change(client: TestClient):
    # Login as Expert
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    csrf_token = login_resp.cookies.get(settings.CSRF_COOKIE_NAME)

    # 1. POST without CSRF header -> 403 csrf_failed
    resp_no_csrf = client.post("/api/v1/protected/state-change")
    assert resp_no_csrf.status_code == 403
    assert resp_no_csrf.json()["error"]["code"] == "csrf_failed"

    # 2. POST with mismatched CSRF header -> 403 csrf_failed
    resp_bad_csrf = client.post(
        "/api/v1/protected/state-change",
        headers={settings.CSRF_HEADER_NAME: "wrong_csrf_token_value"},
    )
    assert resp_bad_csrf.status_code == 403
    assert resp_bad_csrf.json()["error"]["code"] == "csrf_failed"

    # 3. POST with correct CSRF header -> 200 OK
    resp_ok = client.post(
        "/api/v1/protected/state-change",
        headers={settings.CSRF_HEADER_NAME: csrf_token},
    )
    assert resp_ok.status_code == 200
    assert resp_ok.json()["status"] == "ok"


def test_role_and_permission_enforcement(client: TestClient):
    # 1. Login as Trainee
    client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    # Trainee attempts Expert action -> 403 forbidden
    resp_trainee = client.get("/api/v1/protected/expert-action")
    assert resp_trainee.status_code == 403
    assert resp_trainee.json()["error"]["code"] == "forbidden"

    # 2. Login as Expert
    client.post(
        "/api/v1/auth/login",
        json={"email": settings.EXPERT_A_EMAIL, "password": settings.EXPERT_A_PASSWORD},
    )
    # Expert attempts Expert action -> 200 OK
    resp_expert = client.get("/api/v1/protected/expert-action")
    assert resp_expert.status_code == 200
    assert resp_expert.json()["status"] == "ok"
