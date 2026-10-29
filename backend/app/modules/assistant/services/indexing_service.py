import uuid
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED
from app.models.machine import Machine
from app.models.transcript import Transcript, TranscriptSegment
from app.models.processing_job import ProcessingJob, JOB_TYPE_KNOWLEDGE_INDEX
from app.modules.assistant.models import (
    KnowledgeSource,
    KnowledgeChunk,
    SOURCE_TYPE_KNOWLEDGE_VERSION,
    SOURCE_TYPE_TRANSCRIPT,
)
from app.modules.assistant.providers.embedding_base import EmbeddingRequest, get_embedding_provider
from app.modules.assistant.chunking.chunker import (
    chunk_knowledge_version,
    chunk_transcript_segments,
)
from app.core.logging import logger
from app.db.base import utc_now
from app.services.synthetic_demo import is_synthetic_demo_machine


class IndexingService:
    """
    Manages indexing and chunking of knowledge versions and transcripts
    into search-ready KnowledgeSource and KnowledgeChunk records.
    """

    @staticmethod
    def index_knowledge_version(
        version_id: str,
        db: Session,
        user_id: Optional[str] = None,
    ) -> KnowledgeSource:
        """
        Idempotently indexes a KnowledgeVersion into a KnowledgeSource and its chunks.
        Re-indexing replaces all previous chunks for that source.
        """
        version = db.get(KnowledgeVersion, version_id)
        if not version:
            raise ValueError(f"KnowledgeVersion '{version_id}' not found.")

        item = db.get(KnowledgeItem, version.item_id) if version.item_id else None
        if item and item.is_demo:
            machine = db.get(Machine, version.machine_id or item.machine_id)
            if not is_synthetic_demo_machine(machine, db=db):
                raise ValueError("Synthetic demo knowledge can be indexed only in the isolated synthetic demo database.")
        title = item.title if item else f"Knowledge Article v{version.version_no}"
        # The published version is the RAG snapshot. Older knowledge items can
        # have a machine only on the version, while newer editor flows keep both
        # fields aligned. Prefer the version association and fall back to the
        # parent item for legacy records.
        machine_id = (version.machine_id or item.machine_id) if item else version.machine_id

        # 1. Get or create KnowledgeSource
        source = (
            db.query(KnowledgeSource)
            .filter(
                KnowledgeSource.source_type == SOURCE_TYPE_KNOWLEDGE_VERSION,
                KnowledgeSource.source_ref_id == version_id,
            )
            .first()
        )

        if not source:
            source = KnowledgeSource(
                source_type=SOURCE_TYPE_KNOWLEDGE_VERSION,
                source_ref_id=version_id,
                knowledge_version_id=version.id,
                title=title,
                machine_id=machine_id,
                status=version.status,
                index_version="v1",
            )
            db.add(source)
            db.flush()
        else:
            source.title = title
            source.machine_id = machine_id
            source.status = version.status
            source.indexed_at = utc_now()
            # Remove previous chunks for clean re-indexing
            db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).delete()
            db.flush()

        # 2. Generate chunks from ALL captured knowledge fields
        payloads = chunk_knowledge_version(
            title=title,
            summary=version.summary,
            description=version.description,
            steps=version.steps,
            version_no=version.version_no,
            content=getattr(version, "content", None),
            safety_warnings=getattr(version, "safety_warnings", None),
            operating_conditions=getattr(version, "operating_conditions", None),
            prerequisites=getattr(version, "prerequisites", None),
            common_mistakes=getattr(version, "common_mistakes", None),
            corrective_actions=getattr(version, "corrective_actions", None),
            source_refs=getattr(version, "source_refs", None),
        )

        # Knowledge-version indexing is the primary review/publish pipeline.
        # Keep it aligned with folder ingestion so hybrid retrieval can use
        # the configured embedding provider when available, while preserving
        # keyword-only retrieval when a provider is offline or unavailable.
        embeddings = [None] * len(payloads)
        try:
            provider = get_embedding_provider()
            # The deterministic fake provider is useful for exercising the
            # embedding interface, but its hash vectors are not semantic
            # evidence. Persisting them makes hybrid retrieval surface noise.
            if provider.__class__.__name__ != "FakeEmbeddingProvider":
                response = provider.embed_texts(EmbeddingRequest(texts=[p.text for p in payloads]))
                if response and response.embeddings and len(response.embeddings) == len(payloads):
                    embeddings = response.embeddings
        except Exception as exc:
            logger.warning(
                "Embedding generation unavailable for knowledge version %s (%s); continuing keyword-only.",
                version_id,
                type(exc).__name__,
            )

        # 3. Insert chunks
        is_active = (version.status == STATUS_PUBLISHED)
        for index, p in enumerate(payloads):
            metadata = dict(p.metadata)
            if embeddings[index]:
                metadata["embedding"] = embeddings[index]
            chunk = KnowledgeChunk(
                source_id=source.id,
                chunk_index=p.chunk_index,
                text=p.text,
                section_label=p.section_label,
                timestamp_start=p.timestamp_start,
                timestamp_end=p.timestamp_end,
                token_count=p.token_count,
                search_vector=p.search_vector,
                metadata_json=metadata,
                is_active=is_active,
            )
            db.add(chunk)

        db.commit()
        db.refresh(source)
        logger.info(f"Indexed KnowledgeVersion {version_id}: created {len(payloads)} chunks (active={is_active}).")
        return source

    @staticmethod
    def index_transcript(
        transcript_id: str,
        db: Session,
        title: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> KnowledgeSource:
        """
        Indexes an audio transcript and its segments preserving exact timestamps.
        """
        transcript = db.get(Transcript, transcript_id)
        if not transcript:
            raise ValueError(f"Transcript '{transcript_id}' not found.")

        segments = (
            db.query(TranscriptSegment)
            .filter(TranscriptSegment.transcript_id == transcript_id)
            .order_by(TranscriptSegment.idx.asc())
            .all()
        )

        doc_title = title or f"Audio Recording Transcript ({transcript_id[:8]})"

        from app.models.media import MediaAsset
        from app.models.knowledge import KnowledgeVersion
        media = db.get(MediaAsset, transcript.media_id) if transcript.media_id else None
        machine_id = media.machine_id if media else None
        version = db.get(KnowledgeVersion, transcript.version_id) if transcript.version_id else None
        approved = bool(version and version.status == STATUS_PUBLISHED)

        # Find or create source
        source = (
            db.query(KnowledgeSource)
            .filter(
                KnowledgeSource.source_type == SOURCE_TYPE_TRANSCRIPT,
                KnowledgeSource.source_ref_id == transcript_id,
            )
            .first()
        )

        if not source:
            source = KnowledgeSource(
                source_type=SOURCE_TYPE_TRANSCRIPT,
                source_ref_id=transcript_id,
                knowledge_version_id=transcript.version_id,
                title=doc_title,
                machine_id=machine_id,
                status=version.status if version else "draft",
                index_version="v1",
            )
            db.add(source)
            db.flush()
        else:
            source.title = doc_title
            source.machine_id = machine_id
            source.knowledge_version_id = version.id if version else None
            source.status = version.status if version else "draft"
            source.indexed_at = utc_now()
            db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).delete()
            db.flush()

        payloads = chunk_transcript_segments(segments, transcript_title=doc_title)
        for p in payloads:
            chunk = KnowledgeChunk(
                source_id=source.id,
                chunk_index=p.chunk_index,
                text=p.text,
                section_label=p.section_label,
                timestamp_start=p.timestamp_start,
                timestamp_end=p.timestamp_end,
                token_count=p.token_count,
                search_vector=p.search_vector,
                metadata_json=p.metadata,
                is_active=approved,
            )
            db.add(chunk)

        db.commit()
        db.refresh(source)
        logger.info(f"Indexed Transcript {transcript_id}: created {len(payloads)} timestamped chunks.")
        return source

    @staticmethod
    def deactivate_source_for_version(version_id: str, db: Session, new_status: str = "withdrawn") -> bool:
        """
        Lifecycle hook: when a version is withdrawn or superseded,
        immediately deactivates its chunks so RAG queries cannot retrieve them.
        """
        source = (
            db.query(KnowledgeSource)
            .filter(
                KnowledgeSource.source_type == SOURCE_TYPE_KNOWLEDGE_VERSION,
                KnowledgeSource.source_ref_id == version_id,
            )
            .first()
        )
        if not source:
            return False

        source.status = new_status
        db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source.id).update(
            {"is_active": False}
        )
        db.commit()
        logger.info(f"Deactivated knowledge chunks for version {version_id} with status={new_status}.")
        return True

    @staticmethod
    def run_indexing_job(job_id: str, db: Session) -> ProcessingJob:
        """
        Executes a background ProcessingJob for indexing a knowledge version.
        """
        job = db.get(ProcessingJob, job_id)
        if not job:
            raise ValueError(f"ProcessingJob '{job_id}' not found.")

        job.status = "processing"
        job.progress = 25
        db.commit()

        try:
            if not job.version_id:
                raise ValueError("ProcessingJob version_id is required for knowledge indexing.")

            job.progress = 50
            db.commit()

            IndexingService.index_knowledge_version(job.version_id, db, user_id=job.created_by)

            job.progress = 100
            job.status = "completed"
            db.commit()
            return job
        except Exception as e:
            logger.error(f"Failed to process indexing job {job_id}: {e}", exc_info=True)
            job.status = "failed"
            job.error_safe = str(e)[:500]
            db.commit()
            return job
