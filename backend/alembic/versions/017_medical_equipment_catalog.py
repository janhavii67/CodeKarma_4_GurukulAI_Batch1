"""Seed active medical equipment categories while preserving legacy categories.

Revision ID: 017_medical_equipment_catalog
Revises: 016_merge_frontend_redesign_branches
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "017_medical_equipment_catalog"
down_revision: Union[str, None] = "016_merge_frontend_redesign_branches"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CATEGORIES = (
    ("diagnostic-imaging", "Diagnostic Imaging", "Medical equipment used for diagnostic imaging."),
    ("mri-systems", "MRI Systems", "Magnetic resonance imaging systems and related equipment."),
    ("ct-scan-systems", "CT / CT-Scan Systems", "Computed tomography systems and related equipment."),
    ("x-ray-systems", "X-Ray Systems", "Radiographic and fluoroscopic imaging systems."),
    ("ultrasound-systems", "Ultrasound Systems", "Diagnostic and point-of-care ultrasound equipment."),
    ("ecg-cardiac-monitoring", "ECG / Cardiac Monitoring", "Electrocardiography and cardiac monitoring equipment."),
    ("patient-monitoring", "Patient Monitoring", "Vital-sign and bedside patient monitoring equipment."),
    ("laboratory-equipment", "Laboratory Equipment", "Clinical laboratory and diagnostic analysis equipment."),
    ("life-support-equipment", "Life-Support Equipment", "Ventilation, anesthesia, and other life-support equipment."),
    ("surgical-equipment", "Surgical Equipment", "Equipment used in operating rooms and surgical procedures."),
    ("rehabilitation-equipment", "Rehabilitation Equipment", "Physical medicine and rehabilitation equipment."),
    ("other-medical-equipment", "Other Medical Equipment", "Medical equipment that does not fit another category."),
)


def upgrade() -> None:
    op.add_column(
        "machine_categories",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    bind = op.get_bind()
    categories = sa.table(
        "machine_categories",
        sa.column("id", sa.String(64)),
        sa.column("name", sa.String(128)),
        sa.column("description", sa.Text()),
        sa.column("is_active", sa.Boolean()),
    )

    # Keep existing category records and machine relationships intact while
    # removing the legacy manufacturing categories from active selectors.
    bind.execute(sa.update(categories).values(is_active=False))
    for category_id, name, description in CATEGORIES:
        existing = bind.execute(
            sa.select(categories.c.id).where(categories.c.id == category_id)
        ).first()
        if existing:
            bind.execute(
                sa.update(categories)
                .where(categories.c.id == category_id)
                .values(name=name, description=description, is_active=True)
            )
        else:
            bind.execute(
                sa.insert(categories).values(
                    id=category_id,
                    name=name,
                    description=description,
                    is_active=True,
                )
            )


def downgrade() -> None:
    # Category records are retained because newly registered machines may
    # reference them. Dropping only the visibility flag preserves those links.
    op.drop_column("machine_categories", "is_active")
