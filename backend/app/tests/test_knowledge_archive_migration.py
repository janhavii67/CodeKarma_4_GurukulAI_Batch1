import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, String, Table, create_engine, insert, text


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "020_archive_knowledge_on_machine_delete.py"
)
SPEC = importlib.util.spec_from_file_location("knowledge_archive_migration", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_existing_knowledge_defaults_to_unarchived():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    items = Table(
        "knowledge_items",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("title", String(255), nullable=False),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(insert(items), {"id": "existing-item", "title": "Keep existing knowledge"})
        with Operations.context(MigrationContext.configure(connection)):
            MIGRATION.upgrade()
        assert connection.execute(
            text("select is_archived from knowledge_items where id = 'existing-item'")
        ).scalar_one() in (False, 0)

    engine.dispose()
