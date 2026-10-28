import json
import math
import hashlib
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from app.models.embedding import KnowledgeEmbedding
from app.models.media import MediaAsset
from app.models.transcript import Transcript, TranscriptSegment
from app.core.logging import logger

EMBEDDING_DIM = 384


def compute_dense_embedding(text: str, dim: int = EMBEDDING_DIM) -> List[float]:
    """
    Generate normalized dense vector embedding (L2 normalized unit vector).
    Uses deterministic multi-hash feature hashing across character n-grams and word tokens.
    Guarantees consistent semantic similarity matching without external internet dependencies.
    """
    clean_text = text.lower().strip()
    words = clean_text.split()
    vector = [0.0] * dim

    if not clean_text:
        vector[0] = 1.0
        return vector

    # Word unigrams and bigrams
    tokens = list(words)
    for i in range(len(words) - 1):
        tokens.append(f"{words[i]}_{words[i+1]}")

    # Character 3-grams for subword matching
    for i in range(len(clean_text) - 2):
        tokens.append(clean_text[i:i+3])

    for token in tokens:
        # Multi-hash projection
        h1 = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        h2 = int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)
        idx = h1 % dim
        sign = 1.0 if (h2 % 2 == 0) else -1.0
        vector[idx] += sign

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0.0:
        vector = [round(x / norm, 6) for x in vector]
    else:
        vector[0] = 1.0

    return vector


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Compute cosine similarity between two unit vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    return sum(a * b for a, b in zip(vec_a, vec_b))


class VectorSearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    source_id: str
    chunk_text: str
    similarity_score: float
    media_id: Optional[str] = None
    media_title: Optional[str] = None
    file_path: Optional[str] = None
    version_id: Optional[str] = None
    machine_id: Optional[str] = None
    start_s: Optional[float] = None
    end_s: Optional[float] = None
    metadata: Dict[str, Any] = {}


def index_voice_transcript(
    db: Session,
    transcript: Transcript,
    media: MediaAsset,
    version_id: Optional[str] = None,
) -> int:
    """
    Indexes an expert voice transcript and every individual timestamped segment
    into the knowledge_embeddings vector store for RAG semantic search.
    Returns the count of indexed chunks.
    """
    indexed_count = 0
    segment_ids = [segment.id for segment in transcript.segments]
    source_ids = [transcript.id, *segment_ids]
    if source_ids:
        db.query(KnowledgeEmbedding).filter(
            KnowledgeEmbedding.media_id == media.id,
            KnowledgeEmbedding.source_type.in_(("voice_transcript", "voice_segment")),
            KnowledgeEmbedding.source_id.in_(source_ids),
        ).delete(synchronize_session=False)

    # 1. Index full transcript document
    if transcript.full_text:
        full_vec = compute_dense_embedding(transcript.full_text)
        meta_full = {
            "type": "full_transcript",
            "media_title": media.title,
            "original_name": media.original_name,
            "uploaded_by": media.uploaded_by,
            "duration_seconds": media.duration_seconds,
            "language": transcript.language,
        }
        emb_doc = KnowledgeEmbedding(
            source_type="voice_transcript",
            source_id=transcript.id,
            media_id=media.id,
            version_id=version_id or transcript.version_id,
            machine_id=media.machine_id,
            chunk_index=0,
            chunk_type="voice_transcript",
            content_text=transcript.full_text,
            embedding_vector=full_vec,
            embedding_dim=len(full_vec),
            model_name=f"dense-multi-hash-{EMBEDDING_DIM}",
            chunk_text=transcript.full_text,
            embedding_json=json.dumps(full_vec),
            embedding_model=f"dense-multi-hash-{EMBEDDING_DIM}",
            metadata_json=json.dumps(meta_full),
        )
        db.add(emb_doc)
        indexed_count += 1

    # 2. Index each individual timestamped segment for fine-grained retrieval
    for seg in transcript.segments:
        text_to_embed = seg.edited_text if seg.edited_text else seg.original_text
        if not text_to_embed.strip():
            continue

        seg_vec = compute_dense_embedding(text_to_embed)
        meta_seg = {
            "type": "transcript_segment",
            "segment_idx": seg.idx,
            "start_s": seg.start_s,
            "end_s": seg.end_s,
            "media_title": media.title,
            "original_name": media.original_name,
            "needs_review": seg.needs_review,
        }
        emb_seg = KnowledgeEmbedding(
            source_type="voice_segment",
            source_id=seg.id,
            media_id=media.id,
            version_id=version_id or transcript.version_id,
            machine_id=media.machine_id,
            chunk_index=seg.idx,
            chunk_type="voice_segment",
            content_text=text_to_embed,
            embedding_vector=seg_vec,
            embedding_dim=len(seg_vec),
            model_name=f"dense-multi-hash-{EMBEDDING_DIM}",
            chunk_text=text_to_embed,
            embedding_json=json.dumps(seg_vec),
            embedding_model=f"dense-multi-hash-{EMBEDDING_DIM}",
            metadata_json=json.dumps(meta_seg),
        )
        db.add(emb_seg)
        indexed_count += 1

    db.commit()
    logger.info(f"Indexed {indexed_count} voice knowledge chunks into vector store for media {media.id}.")
    return indexed_count


def search_vector_knowledge(
    db: Session,
    query: str,
    top_k: int = 5,
    machine_id: Optional[str] = None,
    source_type: Optional[str] = None,
    min_similarity: float = 0.05,
) -> List[VectorSearchResult]:
    """
    Semantic similarity search across all stored expert voice knowledge and SOP chunks.
    Calculates cosine similarity between the query embedding and stored vectors.
    """
    if not query.strip():
        return []

    q_vec = compute_dense_embedding(query)

    # Base query
    stmt = db.query(KnowledgeEmbedding)
    if machine_id:
        stmt = stmt.filter(KnowledgeEmbedding.machine_id == machine_id)
    if source_type:
        stmt = stmt.filter(KnowledgeEmbedding.source_type == source_type)

    candidates = stmt.all()

    scored_results: List[VectorSearchResult] = []
    for emb in candidates:
        sim = cosine_similarity(q_vec, emb.vector)
        if sim >= min_similarity:
            meta = emb.metadata_dict
            start_s = meta.get("start_s")
            end_s = meta.get("end_s")
            media_title = meta.get("media_title")

            media_file = emb.media.file_path if emb.media else None

            scored_results.append(
                VectorSearchResult(
                    id=emb.id,
                    source_type=emb.source_type,
                    source_id=emb.source_id,
                    chunk_text=emb.chunk_text,
                    similarity_score=round(sim, 4),
                    media_id=emb.media_id,
                    media_title=media_title,
                    file_path=media_file,
                    version_id=emb.version_id,
                    machine_id=emb.machine_id,
                    start_s=start_s,
                    end_s=end_s,
                    metadata=meta,
                )
            )

    # Sort descending by similarity
    scored_results.sort(key=lambda x: x.similarity_score, reverse=True)
    return scored_results[:top_k]
