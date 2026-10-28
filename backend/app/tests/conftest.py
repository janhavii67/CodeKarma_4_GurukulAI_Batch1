import os
import sys
import tempfile
from typing import Generator, Tuple
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Ensure project root and backend are on sys.path
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
for p in [root_dir, backend_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

from app.core.config import settings
# TestClient runs the FastAPI lifespan; keep its recovery hooks out of the
# configured developer database. The test fixtures provide their own databases.
settings.ENVIRONMENT = "test"
from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.core.config import settings
from infrastructure.scripts.seed import seed_database

# Enforce mock provider for automated test suite per Part 6 requirements
os.environ["LLM_PROVIDER"] = "mock"
settings.LLM_PROVIDER = "mock"
os.environ["STT_PROVIDER"] = "mock"
settings.STT_PROVIDER = "mock"

# ---------------------------------------------------------------------------
# Primary in-memory DB: used by the standard `client` + `db_session` fixtures.
# StaticPool keeps one connection alive so the in-memory DB persists across
# the session, but limits concurrent thread access to a single connection.
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Threadsafe fixtures: use a temporary file-based SQLite DB so that each
# request gets its own real connection (no StaticPool contention).
# The fixture exposes both a TestClient AND a seeded Session so test setup
# code can write directly to the same DB that the client reads from.
# ---------------------------------------------------------------------------

@pytest.fixture
def threadsafe_env() -> Generator[Tuple[TestClient, Session], None, None]:
    """Yields (client, db_session) both backed by the same file-based SQLite DB.

    Use for concurrent / multi-threaded tests. The session yielded here is for
    *test setup only* — do not share it with threads. The TestClient creates a
    fresh session per request, which is thread-safe.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    ts_db_url = f"sqlite:///{tmp.name}"

    ts_engine = create_engine(
        ts_db_url,
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    Base.metadata.create_all(bind=ts_engine)
    TsSession = sessionmaker(autocommit=False, autoflush=False, bind=ts_engine)

    # Seed demo users, roles, permissions, machines
    seed_db = TsSession()
    try:
        seed_database(seed_db)
    finally:
        seed_db.close()

    # Session for test setup (single-threaded use only)
    setup_session = TsSession()

    def _override_get_db():
        db = TsSession()  # fresh session per request
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c, setup_session

    setup_session.close()
    app.dependency_overrides.clear()
    ts_engine.dispose()
    try:
        os.unlink(tmp.name)
    except OSError:
        pass


@pytest.fixture
def threadsafe_client(threadsafe_env) -> TestClient:
    """Convenience alias: yields just the TestClient from threadsafe_env."""
    client, _ = threadsafe_env
    return client
