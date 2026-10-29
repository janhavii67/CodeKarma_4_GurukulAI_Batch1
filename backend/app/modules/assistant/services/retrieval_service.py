import re
import math
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_, func
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.modules.assistant.services.eligibility import get_eligibility_service
from app.core.config import settings
from app.core.logging import logger
from app.modules.assistant.providers.embedding_base import get_embedding_provider


_SOUND_QUERY_TERMS = {
    "acoustic",
    "audio",
    "buzz",
    "buzzing",
    "clatter",
    "hum",
    "humming",
    "noise",
    "noises",
    "noisy",
    "rattle",
    "rattling",
    "recording",
    "recordings",
    "sound",
    "sounds",
    "squeak",
    "squeaking",
    "squeal",
    "squealing",
    "vibration",
    "vibrations",
    "vibrating",
    "whine",
    "whining",
}

# Words that carry no subject matter; they are dropped before keyword matching.
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "could", "do", "does", "for", "from",
    "how", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "please", "should", "tell",
    "that", "the", "this", "to", "was", "we", "what", "when", "where", "which", "who", "why",
    "will", "with", "would", "you", "your", "about", "any", "there", "their", "them", "then",
}

# Cosine similarity a chunk needs when it shares no keyword with the question.
MIN_SEMANTIC_RELEVANCE = 0.35


def _requests_sound_evidence(query: str) -> bool:
    """Return whether a query explicitly asks about machine acoustics."""
    query_terms = set(re.findall(r"[a-z0-9]+", query.casefold()))
    return bool(query_terms & _SOUND_QUERY_TERMS)


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
        clean_q = query_params.query.strip().strip('"\'').strip()
        if not clean_q:
            return []

        # 1. Eligibility SQL filter (Enforces: only published, non-withdrawn, active chunks visible to user)
        eligibility = get_eligibility_service()
        sql_filters = eligibility.get_sql_filter(query_params.user_id, db)

        # 2. Extract significant query keywords. Function words ("what", "is", "the") match almost every
        # chunk as substrings, which let unrelated questions "find" evidence; they are not search terms.
        tokens = [w.lower() for w in re.sub(r"[^\w\s]", " ", clean_q).split() if len(w) > 1 and w.lower() not in _STOPWORDS]
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
            .outerjoin(KnowledgeItem, KnowledgeItem.id == KnowledgeVersion.item_id)
            .where(*sql_filters)
        )
        hybrid = getattr(settings, "RETRIEVAL_MODE", "keyword").lower() in {"hybrid", "semantic"}
        query_vector = None
        if hybrid:
            try:
                query_vector = get_embedding_provider().embed_query(clean_q)
            except Exception as exc:
                logger.warning("Semantic retrieval unavailable (%s); using keyword retrieval", type(exc).__name__)
        if not query_vector:
            stmt = stmt.where(or_(*keyword_clauses))

        # Optional filters
        if query_params.machine_id:
            # A machine-scoped question must not receive unassigned chunks.
            # There is no explicit global-scope marker in the current schema,
            # so NULL machine IDs cannot be assumed applicable to every unit.
            stmt = stmt.where(KnowledgeSource.machine_id == query_params.machine_id)

        if query_params.knowledge_item_id:
            stmt = stmt.where(
                or_(
                    KnowledgeVersion.item_id == query_params.knowledge_item_id,
                    KnowledgeSource.source_ref_id == query_params.knowledge_item_id,
                )
            )

        # Recorded sound references can support acoustic questions and
        # audio-matched requests, but are not evidence for general machine
        # purpose, operation, or maintenance questions.
        if not query_params.knowledge_item_id and not _requests_sound_evidence(clean_q):
            stmt = stmt.where(
                or_(
                    KnowledgeItem.category.is_(None),
                    func.upper(KnowledgeItem.category) != "MACHINE_SOUND_REFERENCE",
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

            keyword_score = min(1.0, token_score * 0.65 + exact_bonus + title_bonus)
            semantic_score = 0.0
            stored_vector = (chunk.metadata_json or {}).get("embedding")
            if query_vector and isinstance(stored_vector, list) and len(stored_vector) == len(query_vector):
                qnorm = math.sqrt(sum(float(v) ** 2 for v in query_vector)) or 1.0
                dnorm = math.sqrt(sum(float(v) ** 2 for v in stored_vector)) or 1.0
                semantic_score = sum(float(a) * float(b) for a, b in zip(query_vector, stored_vector)) / (qnorm * dnorm)
            # Without any content relevance a chunk is not evidence, whatever machine it belongs to.
            if matched_tokens == 0 and semantic_score < MIN_SEMANTIC_RELEVANCE:
                continue
            total_score = round((0.55 * keyword_score + 0.45 * max(0.0, semantic_score)) if query_vector else keyword_score, 4)
            if query_params.machine_id and src.machine_id == query_params.machine_id:
                total_score = min(1.0, total_score + 0.1)

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
