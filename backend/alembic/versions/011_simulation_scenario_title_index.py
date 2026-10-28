"""Index legacy simulator titles for scenario discovery.

Revision ID: 011_simulation_scenario_title_index
Revises: 010_failure_simulator
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "011_simulation_scenario_title_index"
down_revision: Union[str, None] = "010_failure_simulator"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_simulation_scenarios_title", "simulation_scenarios", ["title"])


def downgrade() -> None:
    op.drop_index("ix_simulation_scenarios_title", table_name="simulation_scenarios")
