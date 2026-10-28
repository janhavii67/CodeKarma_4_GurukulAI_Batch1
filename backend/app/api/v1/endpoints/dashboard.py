from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from app.db.session import get_db
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_APPROVE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
    PERM_KNOWLEDGE_CREATE,
)
from app.models import (
    Machine,
    KnowledgeArticle,
    KnowledgeVersion,
    Procedure,
    ProcedureRun,
    ApprovalRecord,
    MediaAsset,
    AudioReference,
    SimulationScenario,
    User,
)
from app.schemas.dashboard import DashboardStatsResponse, RecentActivityItem

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_VIEW_PUBLISHED)),
    db: Session = Depends(get_db),
):
    """Retrieve real database-backed metrics for the industrial operations dashboard."""
    user_id = auth_ctx.user.id
    user_permissions = set(auth_ctx.permissions)

    # Global platform metrics (preserved for backwards-compatibility / administrative views)
    total_machines = db.query(func.count(Machine.id)).scalar() or 0
    approved_articles = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(func.lower(KnowledgeArticle.status).in_(["approved", "published"]))
        .scalar()
        or 0
    )
    procedures_count = db.query(func.count(Procedure.id)).scalar() or 0
    pending_reviews = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(func.lower(KnowledgeArticle.status).in_(["pending_review", "in_review"]))
        .scalar()
        or 0
    )
    audio_references = db.query(func.count(AudioReference.id)).scalar() or 0
    active_simulations = db.query(func.count(SimulationScenario.id)).scalar() or 0

    # User-scoped contribution metrics (authoritative real data)
    user_sops_created = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(KnowledgeArticle.author_id == user_id)
        .scalar()
        or 0
    )
    user_sops_approved = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(
            KnowledgeArticle.author_id == user_id,
            func.lower(KnowledgeArticle.status).in_(["approved", "published"]),
        )
        .scalar()
        or 0
    )
    user_sops_pending = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(
            KnowledgeArticle.author_id == user_id,
            func.lower(KnowledgeArticle.status).in_(["pending_review", "in_review"]),
        )
        .scalar()
        or 0
    )
    user_sops_draft = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(
            KnowledgeArticle.author_id == user_id,
            func.lower(KnowledgeArticle.status).in_(["draft", "changes_requested"]),
        )
        .scalar()
        or 0
    )
    user_revisions_count = (
        db.query(func.count(KnowledgeVersion.id))
        .filter(KnowledgeVersion.created_by == user_id)
        .scalar()
        or 0
    )
    user_machines_contributed = (
        db.query(func.count(func.distinct(KnowledgeArticle.machine_id)))
        .filter(
            KnowledgeArticle.author_id == user_id,
            KnowledgeArticle.machine_id.isnot(None),
        )
        .scalar()
        or 0
    )
    user_captured_duration = (
        db.query(func.sum(MediaAsset.duration_seconds))
        .filter(
            MediaAsset.uploaded_by == user_id,
            MediaAsset.duration_seconds.isnot(None),
            MediaAsset.kind.in_(["audio", "video"]),
        )
        .scalar()
        or 0.0
    )

    # Pending reviews specifically assigned or available to this user (two-person governance rule: reviewer != author)
    pending_reviews_for_user = 0
    if PERM_KNOWLEDGE_APPROVE in user_permissions:
        pending_reviews_for_user = (
            db.query(func.count(KnowledgeArticle.id))
            .filter(
                func.lower(KnowledgeArticle.status).in_(["pending_review", "in_review"]),
                KnowledgeArticle.author_id != user_id,
            )
            .scalar()
            or 0
        )

    user_reviews_completed = (
        db.query(func.count(ApprovalRecord.id))
        .filter(ApprovalRecord.reviewer_id == user_id)
        .scalar()
        or 0
    )

    user_procedures_completed = (
        db.query(func.count(ProcedureRun.id))
        .filter(
            ProcedureRun.operator_id == user_id,
            ProcedureRun.status == "COMPLETED",
        )
        .scalar()
        or 0
    )

    # Latest active draft by this author (for 1-click "Continue Draft" CTA)
    latest_draft_article = (
        db.query(KnowledgeArticle)
        .filter(
            KnowledgeArticle.author_id == user_id,
            func.lower(KnowledgeArticle.status).in_(["draft", "changes_requested"]),
        )
        .order_by(desc(KnowledgeArticle.updated_at))
        .first()
    )

    # Recent articles stream with machine association
    recent_query = (
        db.query(
            KnowledgeArticle,
            User.name.label("author_name"),
            Machine.name.label("machine_name"),
        )
        .join(User, KnowledgeArticle.author_id == User.id)
        .outerjoin(Machine, KnowledgeArticle.machine_id == Machine.id)
    )
    if auth_ctx.user.role_id == "ADMIN":
        visibility_filters = [KnowledgeArticle.id.isnot(None)]
    else:
        visibility_filters = []
        if PERM_KNOWLEDGE_VIEW_PUBLISHED in user_permissions:
            visibility_filters.append(func.lower(KnowledgeArticle.status).in_(["approved", "published"]))
        if PERM_KNOWLEDGE_CREATE in user_permissions:
            visibility_filters.append(KnowledgeArticle.author_id == user_id)
        if PERM_KNOWLEDGE_APPROVE in user_permissions:
            visibility_filters.append(
                (func.lower(KnowledgeArticle.status).in_(["pending_review", "in_review"]))
                & (KnowledgeArticle.author_id != user_id)
            )
    if visibility_filters:
        recent_query = recent_query.filter(or_(*visibility_filters))
    else:
        # Fail closed if a future role has no knowledge visibility grant.
        recent_query = recent_query.filter(KnowledgeArticle.id == "")
    recent_articles_query = recent_query.order_by(desc(KnowledgeArticle.updated_at)).limit(7).all()

    recent_items = [
        RecentActivityItem(
            id=art.id,
            title=art.title,
            category=art.category,
            status=art.status,
            author_name=author_name or "Unknown Expert",
            created_at=art.updated_at or art.created_at,
            machine_name=machine_name,
            version_no=getattr(art, "current_version", 1) or 1,
        )
        for art, author_name, machine_name in recent_articles_query
    ]

    return DashboardStatsResponse(
        total_machines=total_machines,
        approved_articles=approved_articles,
        procedures_count=procedures_count,
        pending_reviews=pending_reviews,
        audio_references=audio_references,
        active_simulations=active_simulations,
        recent_articles=recent_items,
        user_sops_created=user_sops_created,
        user_sops_approved=user_sops_approved,
        user_sops_pending=user_sops_pending,
        user_sops_draft=user_sops_draft,
        user_revisions_count=user_revisions_count,
        user_machines_contributed=user_machines_contributed,
        user_captured_duration_seconds=float(round(user_captured_duration, 1)),
        pending_reviews_for_user=pending_reviews_for_user,
        user_reviews_completed=user_reviews_completed,
        user_procedures_completed=user_procedures_completed,
        latest_draft_id=latest_draft_article.id if latest_draft_article else None,
        latest_draft_title=latest_draft_article.title if latest_draft_article else None,
    )
