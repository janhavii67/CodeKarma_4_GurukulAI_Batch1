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
from app.api.v1.endpoints.knowledge import _build_detail_response

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
    from sqlalchemy import or_
    for art, mach_name, auth_name in query:
        latest_rev = (
            db.query(KnowledgeRevision)
            .filter(or_(KnowledgeRevision.item_id == art.id, KnowledgeRevision.article_id == art.id))
            .order_by(desc(KnowledgeRevision.version_no), desc(KnowledgeRevision.version))
            .first()
        )
        raw_text = ""
        if latest_rev:
            raw_text = latest_rev.content or latest_rev.summary or (latest_rev.title if latest_rev.title else "") or ""
            if not raw_text and latest_rev.steps:
                step_instructions = [s.get("instruction", "") for s in (latest_rev.steps or []) if isinstance(s, dict)]
                raw_text = " ".join([st for st in step_instructions if st])
        preview = (raw_text[:200] + "...") if len(raw_text) > 200 else raw_text
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

    # STRICT INVARIANT: Self-Review is strictly prohibited for standard authors.
    # Exception: Administrators (ROLE_ADMIN) possess governance override authority to review, audit, and unblock deployments.
    if article.author_id == auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(
            code="self_review_forbidden",
            message="Authors are strictly forbidden from approving or reviewing their own submissions (Invariant 3). A separate qualified peer expert must perform the review.",
        )

    from sqlalchemy import or_
    latest_rev = (
        db.query(KnowledgeRevision)
        .filter(or_(KnowledgeRevision.item_id == article.id, KnowledgeRevision.article_id == article.id))
        .order_by(desc(KnowledgeRevision.version_no), desc(KnowledgeRevision.version))
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
            # Transition any currently published version of this article to superseded
            from app.models.knowledge import KnowledgeVersion
            prev_published = (
                db.query(KnowledgeVersion)
                .filter(
                    KnowledgeVersion.item_id == article.id,
                    KnowledgeVersion.id != latest_rev.id,
                    KnowledgeVersion.status == "published",
                )
                .all()
            )
            for pv in prev_published:
                pv.status = "superseded"
            if prev_published:
                db.flush()

            latest_rev.status = "published"
            latest_rev.published_at = now
            article.current_published_version_id = latest_rev.id
            article.title = latest_rev.title
            article.machine_id = latest_rev.machine_id
        elif decision_lower == "rejected":
            latest_rev.status = "rejected"

    db.commit()
    db.refresh(article)
    if latest_rev:
        db.refresh(latest_rev)
        # If approved and published, immediately index into the Assistant Knowledge Base and deactivate superseded versions
        if decision_lower == "approved":
            try:
                from app.modules.assistant.services.indexing_service import IndexingService
                from app.modules.assistant.models import KnowledgeSource, SOURCE_TYPE_KNOWLEDGE_VERSION
                from app.models.knowledge import KnowledgeVersion

                prev_sources = (
                    db.query(KnowledgeSource)
                    .filter(
                        KnowledgeSource.source_type == SOURCE_TYPE_KNOWLEDGE_VERSION,
                        KnowledgeSource.knowledge_version_id != latest_rev.id,
                    )
                    .join(KnowledgeVersion, KnowledgeVersion.id == KnowledgeSource.knowledge_version_id)
                    .filter(KnowledgeVersion.item_id == article.id)
                    .all()
                )
                for ps in prev_sources:
                    IndexingService.deactivate_source_for_version(ps.source_ref_id, db, new_status="superseded")

                IndexingService.index_knowledge_version(latest_rev.id, db)
            except Exception as e:
                pass

    return _build_detail_response(db, article, latest_rev)

