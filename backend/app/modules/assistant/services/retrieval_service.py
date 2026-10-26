import re
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_, func
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk
from app.models.knowledge import KnowledgeVersion
from app.modules.assistant.services.eligibility import get_eligibility_service
from app.core.config import settings
from app.core.logging import logger


@dataclass
class RetrievalQuery:
    query: str
    user_id: str
    machine_id: Optional[str] = None
    process_id: Optional[str] = None
    knowledge_item_id: Optional[str] = None
    top_k: int = 6
    min_score: float = 0.05


@dataclass
class RetrievedChunk:
    chunk_id: str
    source_id: str
    knowledge_version_id: Optional[str]
    title: str
    section_label: Optional[str]
    text: str
    score: float
    rank: int
    source_type: str = "knowledge_version"
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    machine_id: Optional[str] = None
    process_id: Optional[str] = None
    metadata: Dict[str, Any] = None


class RetrievalService:
    """
    Retrieval engine connecting Knowledge Capture to the AI Assistant.
    Retrieves and ranks relevant chunks grounded strictly in approved, published knowledge.
    """

    @staticmethod
    def retrieve_chunks(
        query_params: RetrievalQuery,
        db: Session,
    ) -> List[RetrievedChunk]:
        """
        Executes SQL full-text / keyword retrieval with eligibility filtering INSIDE the query.
        Returns top-k ranked chunks with scores and citations.
        """
        clean_q = query_params.query.strip()
        if not clean_q:
            return []

        # 1. Eligibility SQL filter (Enforces: only published, non-withdrawn, active chunks visible to user)
        eligibility = get_eligibility_service()
        sql_filters = eligibility.get_sql_filter(query_params.user_id, db)

        # 2. Extract significant query keywords
        tokens = [w.lower() for w in re.sub(r"[^\w\s]", " ", clean_q).split() if len(w) > 1]
        if not tokens:
            return []

        # 3. Build candidate selection query
        # Word matching conditions
        keyword_clauses = []
        for t in tokens:
            keyword_clauses.append(KnowledgeChunk.text.ilike(f"%{t}%"))
            keyword_clauses.append(KnowledgeChunk.search_vector.ilike(f"%{t}%"))
            keyword_clauses.append(KnowledgeSource.title.ilike(f"%{t}%"))

        stmt = (
            select(KnowledgeChunk, KnowledgeSource)
            .join(KnowledgeSource, KnowledgeChunk.source_id == KnowledgeSource.id)
            .outerjoin(KnowledgeVersion, KnowledgeSource.knowledge_version_id == KnowledgeVersion.id)
            .where(*sql_filters)
            .where(or_(*keyword_clauses))
        )

        # Optional filters
        if query_params.machine_id:
            stmt = stmt.where(
                or_(
                    KnowledgeSource.machine_id == query_params.machine_id,
                    KnowledgeSource.machine_id.is_(None),
                )
            )

        if query_params.knowledge_item_id:
            stmt = stmt.where(
                or_(
                    KnowledgeVersion.item_id == query_params.knowledge_item_id,
                    KnowledgeSource.source_ref_id == query_params.knowledge_item_id,
                )
            )

        candidates = db.execute(stmt).all()
        if not candidates:
            return []

        # 4. Rank and score candidates in memory
        scored_results: List[RetrievedChunk] = []
        unique_tokens = set(tokens)

        for chunk, src in candidates:
            chunk_text_lower = chunk.text.lower()
            src_title_lower = src.title.lower()
            section_lower = (chunk.section_label or "").lower()

            # Token overlap score
            matched_tokens = 0
            for t in unique_tokens:
                if t in chunk_text_lower or t in src_title_lower or t in section_lower:
                    matched_tokens += 1

            token_score = matched_tokens / max(len(unique_tokens), 1)

            # Exact phrase bonus
            exact_bonus = 0.3 if clean_q.lower() in chunk_text_lower else 0.0

            # Title match bonus
            title_bonus = 0.15 if any(t in src_title_lower for t in unique_tokens) else 0.0

            # Machine / Context alignment bonus
            machine_bonus = 0.0
            if query_params.machine_id and src.machine_id == query_params.machine_id:
                machine_bonus = 0.2

            total_score = round(token_score * 0.5 + exact_bonus + title_bonus + machine_bonus, 4)

            if total_score >= query_params.min_score:
                scored_results.append(
                    RetrievedChunk(
                        chunk_id=chunk.id,
                        source_id=src.id,
                        source_type=src.source_type,
                        knowledge_version_id=src.knowledge_version_id,
                        title=src.title,
                        section_label=chunk.section_label,
                        text=chunk.text,
                        score=total_score,
                        rank=0,
                        timestamp_start=chunk.timestamp_start,
                        timestamp_end=chunk.timestamp_end,
                        machine_id=src.machine_id,
                        process_id=src.process_id,
                        metadata=chunk.metadata_json or {},
                    )
                )

        # Sort descending by score
        scored_results.sort(key=lambda r: r.score, reverse=True)

        # Slice top-k and assign rank 1..k
        top_results = scored_results[: query_params.top_k]
        for idx, r in enumerate(top_results, start=1):
            r.rank = idx

        logger.info(f"Retrieved {len(top_results)} chunks for query: '{clean_q[:50]}' (user_id={query_params.user_id}).")
        return top_results
