"""Expose only the four current medical instruments as active inventory.

Revision ID: 019_medical_machine_inventory
Revises: 018_backfill_medical_machine_categories
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "019_medical_machine_inventory"
down_revision: Union[str, None] = "018_backfill_medical_machine_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DISPLAY_NAMES = (
    ("mri", "MRI"),
    ("cityscan", "CT-Scan"),
    ("ct-scan", "CT-Scan"),
    ("xray", "X-Ray"),
    ("x-ray", "X-Ray"),
    ("ecg", "ECG"),
)


def upgrade() -> None:
    op.add_column(
        "machines",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    bind = op.get_bind()
    machines = sa.table(
        "machines",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String(128)),
        sa.column("is_active", sa.Boolean()),
    )

    aliases = tuple(alias for alias, _ in DISPLAY_NAMES)
    bind.execute(
        sa.update(machines)
        .where(sa.func.lower(sa.func.trim(machines.c.name)).not_in(aliases))
        .values(is_active=False)
    )
    for alias, display_name in DISPLAY_NAMES:
        bind.execute(
            sa.update(machines)
            .where(sa.func.lower(sa.func.trim(machines.c.name)) == alias)
            .values(name=display_name, is_active=True)
        )


def downgrade() -> None:
    bind = op.get_bind()
    machines = sa.table(
        "machines",
        sa.column("name", sa.String(128)),
    )
    bind.execute(
        sa.update(machines)
        .where(sa.func.lower(sa.func.trim(machines.c.name)) == "ct-scan")
        .values(name="CityScan")
    )
    bind.execute(
        sa.update(machines)
        .where(sa.func.lower(sa.func.trim(machines.c.name)) == "x-ray")
        .values(name="Xray")
    )
    op.drop_column("machines", "is_active")
