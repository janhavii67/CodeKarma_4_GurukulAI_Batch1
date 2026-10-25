from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.core.permissions import (
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_APPROVE,
)
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models import (
    KnowledgeArticle,
    KnowledgeRevision,
    Machine,
    User,
    ReviewRecord,
)
from app.schemas.review import ReviewDecisionRequest, ReviewQueueItem
from app.schemas.knowledge import KnowledgeArticleDetailResponse
from app.api.v1.endpoints.knowledge import get_knowledge_detail

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.get("/queue", response_model=List[ReviewQueueItem])
def get_review_queue(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    """List pending drafts awaiting peer review and formal approval."""
    query = (
        db.query(KnowledgeArticle, Machine.name.label("machine_name"), User.name.label("author_name"))
        .outerjoin(Machine, KnowledgeArticle.machine_id == Machine.id)
        .join(User, KnowledgeArticle.author_id == User.id)
        .filter(KnowledgeArticle.status == "PENDING_REVIEW")
        .order_by(KnowledgeArticle.updated_at.asc())
        .all()
    )

    items = []
    for art, mach_name, auth_name in query:
        latest_rev = (
            db.query(KnowledgeRevision)
            .filter(KnowledgeRevision.article_id == art.id)
            .order_by(desc(KnowledgeRevision.version))
            .first()
        )
        preview = latest_rev.content[:200] + "..." if latest_rev and len(latest_rev.content) > 200 else (latest_rev.content if latest_rev else "")
        items.append(
            ReviewQueueItem(
                article_id=art.id,
                title=art.title,
                category=art.category,
                machine_name=mach_name,
                author_id=art.author_id,
                author_name=auth_name or "Expert",
                version=art.current_version,
                submitted_at=art.updated_at,
                content_preview=preview,
            )
        )
    return items


@router.post("/{article_id}/decision", response_model=KnowledgeArticleDetailResponse)
def submit_review_decision(
    article_id: str,
    payload: ReviewDecisionRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    """
    Approve or reject a submitted knowledge revision.
    Enforces Strict Peer Review Invariant: Authors can NEVER review or approve their own submissions.
    """
    article = db.get(KnowledgeArticle, article_id)
    if not article:
        raise NotFoundError(code="knowledge_not_found", message=f"Article '{article_id}' not found.")

    if article.status != "PENDING_REVIEW":
        raise ForbiddenError(code="not_pending_review", message="Only articles with status 'PENDING_REVIEW' can be reviewed.")

    # STRICT INVARIANT: Self-Review is strictly prohibited
    if article.author_id == auth_ctx.user.id:
        raise ForbiddenError(
            code="self_review_forbidden",
            message="Authors are strictly forbidden from approving or reviewing their own submissions (Invariant 3). A separate qualified peer expert must perform the review.",
        )

    latest_rev = (
        db.query(KnowledgeRevision)
        .filter(KnowledgeRevision.article_id == article.id)
        .order_by(desc(KnowledgeRevision.version))
        .first()
    )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    decision_lower = payload.decision.lower()

    review_record = ReviewRecord(
        article_id=article.id,
        item_id=article.id,
        revision_id=latest_rev.id if latest_rev else None,
        version_id=latest_rev.id if latest_rev else None,
        reviewer_id=auth_ctx.user.id,
        status=decision_lower,
        decision=decision_lower,
        comments=payload.comments,
        comment=payload.comments,
    )
    db.add(review_record)

    article.status = payload.decision  # "APPROVED" or "REJECTED"
    if latest_rev:
        if decision_lower == "approved":
            latest_rev.status = "published"
            latest_rev.published_at = now
            article.current_published_version_id = latest_rev.id
            article.title = latest_rev.title
            article.machine_id = latest_rev.machine_id
        elif decision_lower == "rejected":
            latest_rev.status = "rejected"

    db.commit()

    return get_knowledge_detail(article.id, auth_ctx, db)

