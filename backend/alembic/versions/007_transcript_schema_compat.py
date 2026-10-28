"""Align legacy transcript tables with the current ORM without discarding data."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007_transcript_schema_compat"
down_revision: Union[str, None] = "006_backfill_machine_media"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    transcript_columns = _column_names("transcripts")
    with op.batch_alter_table("transcripts") as batch:
        if "raw_text" not in transcript_columns:
            batch.add_column(sa.Column("raw_text", sa.Text(), nullable=False, server_default=""))
        if "full_text" not in transcript_columns:
            batch.add_column(
                sa.Column("full_text", sa.Text(), nullable=False, server_default=""),
            )
        if "status" not in transcript_columns:
            batch.add_column(
                sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
            )
        if "version_id" not in transcript_columns:
            batch.add_column(
                sa.Column(
                    "version_id",
                    sa.String(length=36),
                    sa.ForeignKey(
                        "knowledge_versions.id",
                        ondelete="SET NULL",
                        name="fk_transcripts_version_id_knowledge_versions",
                    ),
                    nullable=True,
                ),
            )
        if "updated_at" not in transcript_columns:
            batch.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    if "full_text" not in transcript_columns:
        if "raw_text" in transcript_columns:
            op.execute(sa.text("UPDATE transcripts SET full_text = raw_text"))
    if "raw_text" not in transcript_columns:
        op.execute(sa.text("UPDATE transcripts SET raw_text = full_text"))
    if "updated_at" not in transcript_columns:
        op.execute(sa.text("UPDATE transcripts SET updated_at = created_at WHERE updated_at IS NULL"))
        with op.batch_alter_table("transcripts") as batch:
            batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)

    segment_columns = _column_names("transcript_segments")
    legacy_segment_fields = (
        ("idx", sa.Integer(), "segment_order", "0"),
        ("start_s", sa.Float(), "start_time_seconds", "0"),
        ("end_s", sa.Float(), "end_time_seconds", "0"),
        ("original_text", sa.Text(), "text", ""),
    )
    with op.batch_alter_table("transcript_segments") as batch:
        for current_name, field_type, _legacy_name, default in legacy_segment_fields:
            if current_name not in segment_columns:
                batch.add_column(
                    sa.Column(current_name, field_type, nullable=False, server_default=default),
                )
        if "edited_text" not in segment_columns:
            batch.add_column(sa.Column("edited_text", sa.Text(), nullable=True))
        if "needs_review" not in segment_columns:
            batch.add_column(
                sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "segment_order" not in segment_columns:
            batch.add_column(sa.Column("segment_order", sa.Integer(), nullable=False, server_default="0"))
        if "start_time_seconds" not in segment_columns:
            batch.add_column(sa.Column("start_time_seconds", sa.Float(), nullable=False, server_default="0"))
        if "end_time_seconds" not in segment_columns:
            batch.add_column(sa.Column("end_time_seconds", sa.Float(), nullable=False, server_default="0"))
        if "text" not in segment_columns:
            batch.add_column(sa.Column("text", sa.Text(), nullable=False, server_default=""))
    for current_name, _field_type, legacy_name, _default in legacy_segment_fields:
        if current_name not in segment_columns and legacy_name in segment_columns:
            op.execute(
                sa.text(f'UPDATE transcript_segments SET "{current_name}" = "{legacy_name}"')
            )
        elif legacy_name not in segment_columns:
            op.execute(
                sa.text(f'UPDATE transcript_segments SET "{legacy_name}" = "{current_name}"')
            )


def downgrade() -> None:
    # Keep added fields and copied transcript content to avoid losing data.
    # This compatibility migration is intentionally irreversible.
    pass
