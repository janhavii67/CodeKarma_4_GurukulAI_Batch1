import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import (
    Column,
    Index,
    MetaData,
    String,
    Table,
    create_engine,
    inspect,
    insert,
    text,
)


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "021_relax_legacy_processing_job_user_id.py"
)
SPEC = importlib.util.spec_from_file_location("legacy_job_user_id_migration", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_migration_preserves_legacy_jobs_and_allows_current_job_insert():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    jobs = Table(
        "processing_jobs",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("user_id", String(36), nullable=False),
        Column("created_by", String(36), nullable=False),
        Column("idempotency_key", String(128), nullable=False, unique=True),
        Index("ix_processing_jobs_user_id", "user_id"),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            insert(jobs),
            {
                "id": "legacy-job",
                "user_id": "legacy-user",
                "created_by": "legacy-user",
                "idempotency_key": "legacy:job",
            },
        )
        with Operations.context(MigrationContext.configure(connection)):
            MIGRATION.upgrade()

        # This is the insert shape used by the current ORM: it writes
        # created_by but does not map the old physical user_id column.
        connection.execute(
            text(
                "INSERT INTO processing_jobs (id, created_by, idempotency_key) "
                "VALUES ('new-job', 'current-user', 'voice:new-job')"
            )
        )

        assert connection.execute(
            text("SELECT user_id FROM processing_jobs WHERE id = 'legacy-job'")
        ).scalar_one() == "legacy-user"
        assert connection.execute(
            text("SELECT user_id FROM processing_jobs WHERE id = 'new-job'")
        ).scalar_one() is None
        assert connection.execute(
            text("SELECT COUNT(*) FROM processing_jobs")
        ).scalar_one() == 2

        migrated_columns = {
            row["name"]: row for row in inspect(connection).get_columns("processing_jobs")
        }
        assert migrated_columns["user_id"]["nullable"] is True

    engine.dispose()
