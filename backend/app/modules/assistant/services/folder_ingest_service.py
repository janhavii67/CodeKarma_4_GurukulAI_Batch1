import csv
import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.db.base import utc_now
from app.modules.assistant.chunking.chunker import chunk_text
from app.modules.assistant.models import KnowledgeChunk, KnowledgeSource
from app.modules.assistant.providers.embedding_base import (
    EmbeddingRequest,
    get_embedding_provider,
)
from app.services.audit_service import AuditService

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx"}


@dataclass
class IngestedFileResult:
    name: str
    chunk_count: int
    status: str  # "ingested", "unchanged", "updated"


@dataclass
class SkippedFileResult:
    name: str
    reason: str


@dataclass
class IngestSummary:
    folder_path: str
    ingested_files: List[IngestedFileResult] = field(default_factory=list)
    skipped_files: List[SkippedFileResult] = field(default_factory=list)
    total_chunks: int = 0


class FolderIngestService:
    """
    Ingests technical documentation from local folders (e.g. 'Knowledge Base/').
    Parses PDF, DOCX, TXT, MD, CSV, chunks text, computes embeddings, and
    records KnowledgeSource and KnowledgeChunk records with complete metadata.
    Enforces idempotency via SHA-256 content hashes.
    """

    @staticmethod
    def _compute_hash(file_bytes: bytes) -> str:
        """Computes SHA-256 hexadecimal digest of raw file bytes."""
        return hashlib.sha256(file_bytes).hexdigest()

    @staticmethod
    def _extract_text_and_sections(file_path: Path) -> List[Dict[str, Any]]:
        """
        Extracts text from supported file types.
        Returns a list of dicts: [{"text": str, "section_label": str, "page": Optional[int]}]
        """
        ext = file_path.suffix.lower()
        items: List[Dict[str, Any]] = []

        if ext == ".pdf":
            import pypdf
            reader = pypdf.PdfReader(str(file_path))
            for page_idx, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    items.append({
                        "text": page_text.strip(),
                        "section_label": f"Page {page_idx}",
                        "page": page_idx,
                    })
        elif ext == ".docx":
            import docx
            doc = docx.Document(str(file_path))
            current_section = "Overview"
            current_lines = []
            for p in doc.paragraphs:
                text = p.text.strip()
                if not text:
                    continue
                if p.style and p.style.name.startswith("Heading"):
                    if current_lines:
                        items.append({
                            "text": "\n".join(current_lines),
                            "section_label": current_section,
                            "page": None,
                        })
                        current_lines = []
                    current_section = text
                else:
                    current_lines.append(text)
            if current_lines:
                items.append({
                    "text": "\n".join(current_lines),
                    "section_label": current_section,
                    "page": None,
                })
        elif ext in (".txt", ".md"):
            raw_text = file_path.read_text(encoding="utf-8", errors="replace")
            if raw_text.strip():
                items.append({
                    "text": raw_text.strip(),
                    "section_label": "Document Content",
                    "page": None,
                })
        elif ext == ".csv":
            with open(str(file_path), "r", encoding="utf-8", errors="replace") as f:
                r = csv.reader(f)
                rows = list(r)
            if rows:
                formatted_lines = [", ".join(row) for row in rows if any(cell.strip() for cell in row)]
                if formatted_lines:
                    items.append({
                        "text": "\n".join(formatted_lines),
                        "section_label": "CSV Data Table",
                        "page": None,
                    })
        elif ext == ".xlsx":
            from openpyxl import load_workbook
            workbook = load_workbook(str(file_path), read_only=True, data_only=True)
            for sheet in workbook.worksheets:
                rows = [[str(cell).strip() if cell is not None else "" for cell in row] for row in sheet.iter_rows(values_only=True)]
                lines = [", ".join(row) for row in rows if any(row)]
                if lines:
                    items.append({"text": "\n".join(lines), "section_label": f"Sheet: {sheet.title}", "page": None})

        return items

    @classmethod
    def ingest_folder(
        cls,
        folder_path: str,
        db: Session,
        user_id: Optional[str] = None,
    ) -> IngestSummary:
        """
        Scans and ingests all supported files within folder_path.
        Idempotent: Identical content hashes will skip re-chunking.
        Updates create new active chunks while setting older chunks to is_active=False.
        """
        p = Path(folder_path)
        if not p.is_dir():
            raise FileNotFoundError(f"Knowledge base directory '{folder_path}' does not exist.")

        summary = IngestSummary(folder_path=str(p.resolve()))
        files = sorted(list(p.iterdir()), key=lambda x: x.name)

        # Retrieve embedding provider (graceful fallback if offline / mock)
        embedding_provider = None
        try:
            embedding_provider = get_embedding_provider()
        except Exception as e:
            logger.warning(f"Embedding provider unavailable during ingestion: {type(e).__name__}")

        for file_path in files:
            if not file_path.is_file():
                continue

            file_name = file_path.name
            ext = file_path.suffix.lower()

            # 1. Check supported extensions
            if ext not in SUPPORTED_EXTENSIONS:
                summary.skipped_files.append(
                    SkippedFileResult(name=file_name, reason=f"Unsupported file format '{ext}'")
                )
                continue

            # 2. Check file size limits
            file_size = file_path.stat().st_size
            max_bytes = getattr(settings, "MAX_INGEST_FILE_BYTES", 50 * 1024 * 1024)
            if file_size > max_bytes:
                summary.skipped_files.append(
                    SkippedFileResult(
                        name=file_name,
                        reason=f"File size ({file_size} bytes) exceeds limit ({max_bytes} bytes)",
                    )
                )
                continue

            # 3. Compute content hash
            file_bytes = file_path.read_bytes()
            content_hash = cls._compute_hash(file_bytes)

            source_ref_id = f"kb:{file_name}"
            existing_source = (
                db.query(KnowledgeSource)
                .filter(
                    KnowledgeSource.source_type == "knowledge_base_document",
                    KnowledgeSource.source_ref_id == source_ref_id,
                )
                .first()
            )

            # 4. Check idempotency: if source exists and active chunk has same hash
            if existing_source:
                active_chunk = (
                    db.query(KnowledgeChunk)
                    .filter(
                        KnowledgeChunk.source_id == existing_source.id,
                        KnowledgeChunk.is_active == True,
                    )
                    .first()
                )
                if active_chunk and active_chunk.metadata_json and active_chunk.metadata_json.get("content_hash") == content_hash:
                    # Content unchanged
                    chunk_count = (
                        db.query(KnowledgeChunk)
                        .filter(
                            KnowledgeChunk.source_id == existing_source.id,
                            KnowledgeChunk.is_active == True,
                        )
                        .count()
                    )
                    summary.ingested_files.append(
                        IngestedFileResult(name=file_name, chunk_count=chunk_count, status="unchanged")
                    )
                    summary.total_chunks += chunk_count
                    continue
                else:
                    # Content changed: supersede prior chunks
                    db.query(KnowledgeChunk).filter(
                        KnowledgeChunk.source_id == existing_source.id,
                    ).update({"is_active": False})
                    db.flush()
                    source = existing_source
                    source.indexed_at = utc_now()
                    source.status = "published" if getattr(settings, "INGEST_AS_PUBLISHED", True) else "draft"
                    status_str = "updated"
            else:
                source = KnowledgeSource(
                    source_type="knowledge_base_document",
                    source_ref_id=source_ref_id,
                    title=f"Knowledge base document: {file_name}",
                    product_family="knowledge_base_folder",
                    status="published" if getattr(settings, "INGEST_AS_PUBLISHED", True) else "draft",
                    index_version="v1",
                    indexed_at=utc_now(),
                )
                db.add(source)
                db.flush()
                status_str = "ingested"

            # 5. Extract text sections and chunk
            extracted_sections = cls._extract_text_and_sections(file_path)
            if not extracted_sections:
                summary.skipped_files.append(
                    SkippedFileResult(name=file_name, reason="No extractable text found in file")
                )
                continue

            chunk_payloads = []
            chunk_page_map = []
            for item in extracted_sections:
                section_text = item["text"]
                sec_label = item["section_label"]
                page_no = item["page"]

                # Chunk using standard chunker
                payloads = chunk_text(
                    text=section_text,
                    title=file_name,
                    target_words=250,
                    overlap_words=40,
                    section_label=sec_label,
                )
                for p_idx, pl in enumerate(payloads):
                    chunk_payloads.append(pl)
                    chunk_page_map.append(page_no)

            if not chunk_payloads:
                summary.skipped_files.append(
                    SkippedFileResult(name=file_name, reason="File produced 0 chunks after parsing")
                )
                continue

            # 6. Compute embeddings in batch if provider available
            embeddings_list: List[Optional[List[float]]] = [None] * len(chunk_payloads)
            if embedding_provider:
                try:
                    texts_to_embed = [cp.text for cp in chunk_payloads]
                    emb_resp = embedding_provider.embed_texts(EmbeddingRequest(texts=texts_to_embed))
                    if emb_resp and emb_resp.embeddings:
                        embeddings_list = emb_resp.embeddings
                except Exception as emb_err:
                    logger.warning(
                        f"Failed to generate embeddings for '{file_name}': {type(emb_err).__name__}. Continuing keyword-only."
                    )

            # 7. Persist KnowledgeChunks
            created_count = 0
            for idx, (cp, page_no) in enumerate(zip(chunk_payloads, chunk_page_map)):
                meta: Dict[str, Any] = {
                    "source_file": file_name,
                    "page": page_no,
                    "section": cp.section_label,
                    "content_hash": content_hash,
                    "source": "knowledge_base_folder",
                    "ingestion_time": utc_now().isoformat(),
                    "document_id": source.id,
                    "approval_status": source.status,
                    "revision": None,
                }
                if embeddings_list and idx < len(embeddings_list) and embeddings_list[idx]:
                    meta["embedding"] = embeddings_list[idx]

                chunk = KnowledgeChunk(
                    source_id=source.id,
                    chunk_index=idx,
                    text=cp.text,
                    section_label=cp.section_label,
                    token_count=cp.token_count,
                    search_vector=cp.search_vector,
                    metadata_json=meta,
                    is_active=True,
                )
                db.add(chunk)
                created_count += 1

            db.commit()
            summary.ingested_files.append(
                IngestedFileResult(name=file_name, chunk_count=created_count, status=status_str)
            )
            summary.total_chunks += created_count

        # Log audit entry
        AuditService.log(
            db=db,
            action="assistant.ingest_folder",
            entity_type="knowledge_source",
            entity_id=str(p),
            actor_id=user_id,
            detail={
                "folder": str(p),
                "ingested_count": len(summary.ingested_files),
                "skipped_count": len(summary.skipped_files),
                "total_chunks": summary.total_chunks,
            },
            commit=True,
        )

        return summary
