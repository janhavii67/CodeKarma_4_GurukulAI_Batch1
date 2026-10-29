"""Backfill recognized legacy medical equipment to active categories.

Revision ID: 018_backfill_medical_machine_categories
Revises: 017_medical_equipment_catalog
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018_backfill_medical_machine_categories"
down_revision: Union[str, None] = "017_medical_equipment_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MAPPINGS = (
    ("%mri%", "mri-systems"),
    ("%cityscan%", "ct-scan-systems"),
    ("%ct-scan%", "ct-scan-systems"),
    ("%ct scan%", "ct-scan-systems"),
    ("%computed tomography%", "ct-scan-systems"),
    ("%xray%", "x-ray-systems"),
    ("%x-ray%", "x-ray-systems"),
    ("%x ray%", "x-ray-systems"),
    ("%ecg%", "ecg-cardiac-monitoring"),
    ("%electrocardiogram%", "ecg-cardiac-monitoring"),
    ("%analyz%", "laboratory-equipment"),
    ("%analys%", "laboratory-equipment"),
    ("%laboratory%", "laboratory-equipment"),
)


def upgrade() -> None:
    bind = op.get_bind()
    machines = sa.table(
        "machines",
        sa.column("id", sa.String(36)),
        sa.column("name", sa.String(128)),
        sa.column("category_id", sa.String(64)),
    )
    categories = sa.table(
        "machine_categories",
        sa.column("id", sa.String(64)),
        sa.column("is_active", sa.Boolean()),
    )
    active_ids = [
        row[0]
        for row in bind.execute(sa.select(categories.c.id).where(categories.c.is_active.is_(True)))
    ]
    if not active_ids:
        return

    # Keep valid active choices as-is. Only recognized machines with a null,
    # generic, orphaned, or retired category reference are backfilled.
    needs_category = sa.or_(
        machines.c.category_id.is_(None),
        machines.c.category_id.not_in(active_ids),
    )
    for pattern, category_id in MAPPINGS:
        bind.execute(
            sa.update(machines)
            .where(sa.func.lower(machines.c.name).like(pattern))
            .where(needs_category)
            .values(category_id=category_id)
        )


def downgrade() -> None:
    # Category IDs are now valid foreign keys and may have been used since the
    # upgrade. Keep those references intact during a downgrade.
    pass
