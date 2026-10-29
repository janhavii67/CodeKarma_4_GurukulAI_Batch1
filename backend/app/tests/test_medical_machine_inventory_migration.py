import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, String, Table, create_engine, insert, text


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "019_medical_machine_inventory.py"
)
SPEC = importlib.util.spec_from_file_location("medical_machine_inventory", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_inventory_migration_keeps_four_medical_machines_active_and_archives_the_rest():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    machines = Table(
        "machines",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("name", String(128), nullable=False),
    )
    metadata.create_all(engine)
    original_ids = ("mri-id", "ct-id", "xray-id", "ecg-id", "legacy-id")

    with engine.begin() as connection:
        connection.execute(
            insert(machines),
            [
                {"id": "mri-id", "name": "MRI"},
                {"id": "ct-id", "name": "CityScan"},
                {"id": "xray-id", "name": "Xray"},
                {"id": "ecg-id", "name": "ECG"},
                {"id": "legacy-id", "name": "Demo Machine A (Lathe)"},
            ],
        )
        with Operations.context(MigrationContext.configure(connection)):
            MIGRATION.upgrade()

        rows = list(connection.execute(text("select id, name, is_active from machines")))

    assert [row.id for row in rows] == list(original_ids)
    assert {row.name for row in rows if bool(row.is_active)} == {"MRI", "CT-Scan", "X-Ray", "ECG"}
    assert bool(next(row for row in rows if row.id == "legacy-id").is_active) is False
    engine.dispose()
