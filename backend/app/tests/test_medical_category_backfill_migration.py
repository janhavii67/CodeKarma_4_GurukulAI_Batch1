import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Boolean, Column, MetaData, String, Table, create_engine, insert, select


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "018_backfill_medical_machine_categories.py"
)
SPEC = importlib.util.spec_from_file_location("medical_category_backfill", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_backfill_recognizes_legacy_medical_machines_and_preserves_valid_or_unknown_rows():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    categories = Table(
        "machine_categories",
        metadata,
        Column("id", String(64), primary_key=True),
        Column("is_active", Boolean, nullable=False),
    )
    machines = Table(
        "machines",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("name", String(128), nullable=False),
        Column("category_id", String(64)),
    )
    metadata.create_all(engine)

    active_category_ids = (
        "mri-systems",
        "ct-scan-systems",
        "x-ray-systems",
        "ecg-cardiac-monitoring",
        "laboratory-equipment",
        "other-medical-equipment",
    )
    with engine.begin() as connection:
        connection.execute(
            insert(categories),
            [
                {"id": category_id, "is_active": True}
                for category_id in active_category_ids
            ]
            + [{"id": "Medical Equipment", "is_active": False}],
        )
        connection.execute(
            insert(machines),
            [
                {"id": "mri-legacy", "name": "MRI System", "category_id": "Medical Equipment"},
                {"id": "ct-legacy", "name": "CityScan CT", "category_id": "General"},
                {"id": "xray-legacy", "name": "X-Ray Scanner", "category_id": None},
                {"id": "ecg-valid", "name": "ECG Monitor", "category_id": "ecg-cardiac-monitoring"},
                {"id": "industrial", "name": "HAAS VF-2", "category_id": "cnc-milling"},
                {"id": "unknown", "name": "Unclassified Equipment", "category_id": "General"},
                {"id": "valid-category", "name": "MRI Training Simulator", "category_id": "other-medical-equipment"},
            ],
        )

        with Operations.context(MigrationContext.configure(connection)):
            MIGRATION.upgrade()

        result = {
            row.id: row.category_id
            for row in connection.execute(select(machines.c.id, machines.c.category_id))
        }

    assert result == {
        "mri-legacy": "mri-systems",
        "ct-legacy": "ct-scan-systems",
        "xray-legacy": "x-ray-systems",
        "ecg-valid": "ecg-cardiac-monitoring",
        "industrial": "cnc-milling",
        "unknown": "General",
        "valid-category": "other-medical-equipment",
    }
    engine.dispose()
