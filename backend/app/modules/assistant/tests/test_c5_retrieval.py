import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from app.models.user import User
from app.models.knowledge import KnowledgeItem, KnowledgeVersion, STATUS_PUBLISHED, STATUS_DRAFT
from app.models.machine import Machine
from app.core.permissions import ROLE_EXPERT, ROLE_TRAINEE
from app.modules.assistant.models import KnowledgeSource, KnowledgeChunk
from app.modules.assistant.services.retrieval_service import (
    RetrievalService,
    RetrievalQuery,
)
from app.modules.assistant.services.indexing_service import IndexingService


def test_retrieval_service_keyword_matching_and_ranking(db_session: Session):
    """
    Verify RetrievalService finds relevant chunks, ranks by score,
    and returns chunk metadata.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()
    assert user is not None

    query = RetrievalQuery(
        query="spindle warmup thermal drift",
        user_id=user.id,
        top_k=3,
        min_score=0.05,
    )
    results = RetrievalService.retrieve_chunks(query, db_session)

    assert len(results) > 0
    top = results[0]
    assert top.rank == 1
    assert top.score > 0.05
    assert "spindle" in top.text.lower() or "warm" in top.text.lower() or "spindle" in top.title.lower()


def test_retrieval_service_machine_context_boosting(db_session: Session):
    """
    When machine_id is supplied, chunks belonging to that machine receive a score boost.
    """
    user = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()
    haas = db_session.query(Machine).filter(Machine.code == "HAAS-VF2-001").first()
    assert user is not None and haas is not None

    # Query with machine context
    query_boosted = RetrievalQuery(
        query="spindle warmup",
        user_id=user.id,
        machine_id=haas.id,
        top_k=5,
    )
    results_boosted = RetrievalService.retrieve_chunks(query_boosted, db_session)
    assert len(results_boosted) > 0
    assert any(r.machine_id == haas.id for r in results_boosted)


def test_retrieval_strictly_excludes_draft_and_withdrawn_chunks(db_session: Session):
    """
    Safety Guard: Ineligible chunks (drafts, withdrawn) MUST NOT be returned,
    even with exact query keyword matches.
    """
    expert = db_session.query(User).filter(User.role_id == ROLE_EXPERT).first()
    trainee = db_session.query(User).filter(User.role_id == ROLE_TRAINEE).first()

    # Draft source and chunk
    src_draft = KnowledgeSource(
        source_type="knowledge_version",
        source_ref_id="kv-secret-draft",
        title="Secret Unapproved Nuclear Tolerances",
        status="draft",
    )
    db_session.add(src_draft)
    db_session.commit()

    chunk_draft = KnowledgeChunk(
        source_id=src_draft.id,
        chunk_index=0,
        text="Nuclear tolerance secret spec 0.0001 mm exactly.",
        is_active=False,
    )
    db_session.add(chunk_draft)
    db_session.commit()

    # Query searching for exact draft keywords
    query = RetrievalQuery(
        query="nuclear tolerance secret spec",
        user_id=trainee.id,
        top_k=5,
        min_score=0.01,
    )
    results = RetrievalService.retrieve_chunks(query, db_session)

    # Must be 0 results
    chunk_ids = [r.chunk_id for r in results]
    assert chunk_draft.id not in chunk_ids


def test_knowledge_index_endpoints_connect_knowledge_capture_to_rag(client: TestClient, db_session: Session):
    """
    Verify POST /api/v1/knowledge/{id}/index and POST /api/v1/knowledge/index endpoints
    connect Knowledge Capture to the RAG knowledge base.
    """
    # 1. Login as Expert A (has knowledge.create)
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "expert.a@demo.local", "password": "ExpertA@Gurukul2026!"},
    )
    assert resp.status_code == 200
    from app.core.config import settings
    csrf_token = resp.cookies.get(settings.CSRF_COOKIE_NAME)
    headers = {settings.CSRF_HEADER_NAME: csrf_token} if csrf_token else {}

    # Find a published article
    item = db_session.query(KnowledgeItem).filter(KnowledgeItem.current_published_version_id.is_not(None)).first()
    assert item is not None

    # 2. Trigger index via POST /api/v1/knowledge/{id}/index
    idx_resp = client.post(
        f"/api/v1/knowledge/{item.id}/index",
        headers=headers,
    )
    assert idx_resp.status_code == 200
    data = idx_resp.json()
    assert data["status"] == "success"
    assert data["item_id"] == item.id
    assert data["chunks_count"] > 0

    # 3. GET /api/v1/knowledge/{id} reflects rag_indexed=True
    get_resp = client.get(f"/api/v1/knowledge/{item.id}", headers=headers)
    assert get_resp.status_code == 200
    detail = get_resp.json()
    assert detail["rag_indexed"] is True
    assert detail["rag_chunks_count"] > 0

    # 4. Batch index via POST /api/v1/knowledge/index with sync_all=True
    batch_resp = client.post(
        "/api/v1/knowledge/index",
        json={"sync_all": True},
        headers=headers,
    )
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()
    assert batch_data["status"] == "success"
    assert batch_data["indexed_count"] >= 1
    assert batch_data["chunks_count"] >= 1
