"""Preserve legacy processing and vector rows while aligning current ORM fields."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_reconcile_job_embedding_schema"
down_revision: Union[str, None] = "007_transcript_schema_compat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    job_columns = _column_names("processing_jobs")
    with op.batch_alter_table("processing_jobs") as batch:
        if "type" not in job_columns:
            batch.add_column(sa.Column("type", sa.String(64), nullable=False, server_default="voice_to_knowledge"))
        if "version_id" not in job_columns:
            batch.add_column(sa.Column(
                "version_id", sa.String(36),
                sa.ForeignKey("knowledge_versions.id", ondelete="SET NULL", name="fk_processing_jobs_version_id"),
                nullable=True,
            ))
        if "progress" not in job_columns:
            batch.add_column(sa.Column("progress", sa.Integer(), nullable=True, server_default="0"))
        if "error_safe" not in job_columns:
            batch.add_column(sa.Column("error_safe", sa.Text(), nullable=True))
        if "attempts" not in job_columns:
            batch.add_column(sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
        if "idempotency_key" not in job_columns:
            batch.add_column(sa.Column("idempotency_key", sa.String(128), nullable=True))
        if "created_by" not in job_columns:
            batch.add_column(sa.Column(
                "created_by", sa.String(36),
                sa.ForeignKey("users.id", name="fk_processing_jobs_created_by"),
                nullable=True,
            ))

    if "progress" not in job_columns and "progress_percent" in job_columns:
        op.execute(sa.text("UPDATE processing_jobs SET progress = progress_percent"))
    if "error_safe" not in job_columns and "error_message" in job_columns:
        op.execute(sa.text("UPDATE processing_jobs SET error_safe = error_message"))
    if "created_by" not in job_columns and "user_id" in job_columns:
        op.execute(sa.text("UPDATE processing_jobs SET created_by = user_id"))
    if "idempotency_key" not in job_columns:
        op.execute(sa.text("UPDATE processing_jobs SET idempotency_key = 'legacy:' || id"))
    elif op.get_bind().dialect.name == "postgresql":
        op.execute(sa.text("UPDATE processing_jobs SET idempotency_key = 'legacy:' || id WHERE idempotency_key IS NULL"))
    else:
        op.execute(sa.text("UPDATE processing_jobs SET idempotency_key = 'legacy:' || id WHERE idempotency_key IS NULL"))
    if "created_by" not in job_columns and "user_id" not in job_columns:
        raise RuntimeError("Cannot reconcile processing_jobs: neither created_by nor legacy user_id exists.")

    job_columns = _column_names("processing_jobs")
    with op.batch_alter_table("processing_jobs") as batch:
        if "idempotency_key" in job_columns:
            batch.alter_column("idempotency_key", existing_type=sa.String(128), nullable=False)
        if "created_by" in job_columns:
            batch.alter_column("created_by", existing_type=sa.String(36), nullable=False)
        if "user_id" in job_columns:
            # The current ORM aliases user_id to created_by; keep legacy values
            # in place but allow future ORM inserts to omit the deprecated column.
            batch.alter_column("user_id", existing_type=sa.String(36), nullable=True)
    index_names = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("processing_jobs")}
    if "uq_processing_jobs_idempotency_key" not in index_names:
        op.create_index("uq_processing_jobs_idempotency_key", "processing_jobs", ["idempotency_key"], unique=True)

    embedding_columns = _column_names("knowledge_embeddings")
    with op.batch_alter_table("knowledge_embeddings") as batch:
        if "source_type" not in embedding_columns:
            batch.add_column(sa.Column("source_type", sa.String(32), nullable=True))
        if "source_id" not in embedding_columns:
            batch.add_column(sa.Column("source_id", sa.String(36), nullable=True))
        if "media_id" not in embedding_columns:
            batch.add_column(sa.Column(
                "media_id", sa.String(36),
                sa.ForeignKey("media_assets.id", ondelete="CASCADE", name="fk_knowledge_embeddings_media_id"),
                nullable=True,
            ))
        if "machine_id" not in embedding_columns:
            batch.add_column(sa.Column(
                "machine_id", sa.String(36),
                sa.ForeignKey("machines.id", ondelete="SET NULL", name="fk_knowledge_embeddings_machine_id"),
                nullable=True,
            ))
        if "chunk_text" not in embedding_columns:
            batch.add_column(sa.Column("chunk_text", sa.Text(), nullable=True))
        if "embedding_json" not in embedding_columns:
            batch.add_column(sa.Column("embedding_json", sa.Text(), nullable=True))
        if "embedding_model" not in embedding_columns:
            batch.add_column(sa.Column("embedding_model", sa.String(64), nullable=True))
        if "metadata_json" not in embedding_columns:
            batch.add_column(sa.Column("metadata_json", sa.Text(), nullable=True))
        # Preserve the legacy 004 columns where present and keep the merged ORM
        # compatible when an existing database was already at the newer schema.
        if "chunk_index" not in embedding_columns:
            batch.add_column(sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"))
        if "chunk_type" not in embedding_columns:
            batch.add_column(sa.Column("chunk_type", sa.String(32), nullable=False, server_default="legacy"))
        if "content_text" not in embedding_columns:
            batch.add_column(sa.Column("content_text", sa.Text(), nullable=False, server_default=""))
        if "embedding_vector" not in embedding_columns:
            batch.add_column(sa.Column("embedding_vector", sa.JSON(), nullable=False, server_default="[]"))
        if "embedding_dim" not in embedding_columns:
            batch.add_column(sa.Column("embedding_dim", sa.Integer(), nullable=False, server_default="384"))
        if "model_name" not in embedding_columns:
            batch.add_column(sa.Column("model_name", sa.String(64), nullable=False, server_default="default-vector-v1"))

    if "source_type" not in embedding_columns and "chunk_type" in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET source_type = COALESCE(chunk_type, 'legacy')"))
    if "source_id" not in embedding_columns:
        id_sources = [column for column in ("version_id", "knowledge_item_id", "id") if column in embedding_columns]
        op.execute(sa.text(
            "UPDATE knowledge_embeddings SET source_id = COALESCE(" + ", ".join(id_sources) + ")"
        ))
    if "chunk_text" not in embedding_columns and "content_text" in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET chunk_text = COALESCE(content_text, '')"))
    if "embedding_json" not in embedding_columns and "embedding_vector" in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET embedding_json = CAST(embedding_vector AS TEXT)"))
    if "embedding_model" not in embedding_columns and "model_name" in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET embedding_model = COALESCE(model_name, 'legacy')"))
    if "chunk_type" not in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET chunk_type = COALESCE(source_type, 'legacy')"))
    if "content_text" not in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET content_text = COALESCE(chunk_text, '')"))
    if "model_name" not in embedding_columns:
        op.execute(sa.text("UPDATE knowledge_embeddings SET model_name = COALESCE(embedding_model, 'legacy')"))

    source_columns = _column_names("knowledge_embeddings")
    if "machine_id" in source_columns:
        machine_sources = []
        if "media_id" in source_columns:
            machine_sources.append("(SELECT machine_id FROM media_assets WHERE media_assets.id = knowledge_embeddings.media_id)")
        if "version_id" in source_columns:
            machine_sources.append("(SELECT machine_id FROM knowledge_versions WHERE knowledge_versions.id = knowledge_embeddings.version_id)")
        if "knowledge_item_id" in source_columns:
            machine_sources.append("(SELECT machine_id FROM knowledge_items WHERE knowledge_items.id = knowledge_embeddings.knowledge_item_id)")
        if machine_sources:
            op.execute(sa.text(
                "UPDATE knowledge_embeddings SET machine_id = COALESCE(" + ", ".join(machine_sources) + ") "
                "WHERE machine_id IS NULL"
            ))

    with op.batch_alter_table("knowledge_embeddings") as batch:
        for column, kind in (("source_type", sa.String(32)), ("source_id", sa.String(36)),
                             ("chunk_text", sa.Text()), ("embedding_json", sa.Text()),
                             ("embedding_model", sa.String(64))):
            batch.alter_column(column, existing_type=kind, nullable=False)


def downgrade() -> None:
    # The migration copies legacy values into fields used by the current ORM.
    # Keeping these compatibility fields avoids losing data on downgrade.
    pass
