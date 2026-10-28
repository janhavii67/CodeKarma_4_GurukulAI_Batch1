import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models.user import User
from app.models.knowledge import KnowledgeArticle


ROLE_CASES = [
    (
        "admin@demo.local",
        "Admin@Gurukul2026!",
        "ADMIN",
        {"knowledge.create", "knowledge.approve", "procedure.create", "procedure.execute", "assistant.use", "audio.analyze", "simulation.attempt", "troubleshoot.use", "machine.manage", "admin.manage"},
        set(),
    ),
    (
        settings.EXPERT_A_EMAIL,
        settings.EXPERT_A_PASSWORD,
        "EXPERT",
        {"knowledge.create", "knowledge.approve", "procedure.create", "procedure.execute", "assistant.use", "audio.analyze", "simulation.attempt", "troubleshoot.use", "machine.manage"},
        {"admin.manage"},
    ),
    (
        "operator@demo.local",
        "Operator@Gurukul2026!",
        "OPERATOR",
        {"knowledge.view_published", "procedure.execute", "assistant.use", "audio.analyze", "troubleshoot.use"},
        {"knowledge.create", "knowledge.approve", "procedure.create", "simulation.attempt", "machine.manage"},
    ),
    (
        settings.TRAINEE_EMAIL,
        settings.TRAINEE_PASSWORD,
        "TRAINEE",
        {"knowledge.view_published", "procedure.execute", "assistant.use", "audio.analyze", "troubleshoot.use", "simulation.attempt"},
        {"knowledge.create", "knowledge.approve", "procedure.create", "machine.manage"},
    ),
]


@pytest.mark.parametrize("email,password,role,expected,denied", ROLE_CASES)
def test_role_matrix_and_direct_api_access(
    client: TestClient,
    email: str,
    password: str,
    role: str,
    expected: set[str],
    denied: set[str],
):
    login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200

    profile = client.get("/api/v1/auth/me")
    assert profile.status_code == 200
    assert profile.json()["user"]["role_id"] == role
    permissions = set(profile.json()["permissions"])
    assert expected <= permissions
    assert not (denied & permissions)

    # Every role can reach published knowledge and execute published workflows.
    assert client.get("/api/v1/machines").status_code == 200
    assert client.get("/api/v1/knowledge").status_code == 200
    assert client.get("/api/v1/procedures").status_code == 200
    assert client.get("/api/v1/troubleshooting").status_code == 200
    assert client.get("/api/v1/learning/dashboard").status_code == 200

    reviewer_status = client.get("/api/v1/reviews/queue").status_code
    assert reviewer_status == (200 if "knowledge.approve" in expected else 403)

    authoring_status = client.get("/api/v1/procedures/mine/drafts").status_code
    assert authoring_status == (200 if "procedure.create" in expected else 403)

    simulation_status = client.get("/api/v1/simulator/scenarios").status_code
    assert simulation_status == (200 if "simulation.attempt" in expected else 403)


def test_role_change_is_loaded_from_current_user_record(client: TestClient, db_session):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.TRAINEE_EMAIL, "password": settings.TRAINEE_PASSWORD},
    )
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me").json()["user"]["role_id"] == "TRAINEE"

    user = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    user.role_id = "OPERATOR"
    db_session.commit()

    updated = client.get("/api/v1/auth/me")
    assert updated.status_code == 200
    assert updated.json()["user"]["role_id"] == "OPERATOR"
    assert "audio.analyze" in updated.json()["permissions"]


def test_protected_api_requires_authentication(client: TestClient):
    assert client.get("/api/v1/reviews/queue").status_code == 401
    assert client.get("/api/v1/procedures").status_code == 401


def test_dashboard_recent_activity_does_not_reveal_other_users_drafts(client: TestClient, db_session):
    expert = db_session.query(User).filter(User.email == settings.EXPERT_A_EMAIL).one()
    trainee = db_session.query(User).filter(User.email == settings.TRAINEE_EMAIL).one()
    private_draft = KnowledgeArticle(
        title="Private expert draft for RBAC test",
        category="GENERAL",
        status="draft",
        author_id=expert.id,
    )
    published_article = KnowledgeArticle(
        title="Published machine procedure for RBAC test",
        category="GENERAL",
        status="published",
        author_id=expert.id,
    )
    db_session.add_all([private_draft, published_article])
    db_session.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"email": trainee.email, "password": settings.TRAINEE_PASSWORD},
    )
    assert login.status_code == 200
    response = client.get("/api/v1/dashboard/stats")
    assert response.status_code == 200
    titles = {article["title"] for article in response.json()["recent_articles"]}
    assert "Private expert draft for RBAC test" not in titles
    assert "Published machine procedure for RBAC test" in titles
