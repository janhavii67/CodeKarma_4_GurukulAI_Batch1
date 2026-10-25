from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.db.session import get_db
from app.core.permissions import get_current_user, AuthenticatedContext
from app.models import (
    Machine,
    KnowledgeArticle,
    Procedure,
    AudioReference,
    SimulationScenario,
    User,
)
from app.schemas.dashboard import DashboardStatsResponse, RecentActivityItem

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve real database-backed metrics for the industrial operations dashboard."""
    total_machines = db.query(func.count(Machine.id)).scalar() or 0
    approved_articles = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(KnowledgeArticle.status == "APPROVED")
        .scalar()
        or 0
    )
    procedures_count = db.query(func.count(Procedure.id)).scalar() or 0
    pending_reviews = (
        db.query(func.count(KnowledgeArticle.id))
        .filter(KnowledgeArticle.status == "PENDING_REVIEW")
        .scalar()
        or 0
    )
    audio_references = db.query(func.count(AudioReference.id)).scalar() or 0
    active_simulations = db.query(func.count(SimulationScenario.id)).scalar() or 0

    recent_articles_query = (
        db.query(KnowledgeArticle, User.name.label("author_name"))
        .join(User, KnowledgeArticle.author_id == User.id)
        .order_by(desc(KnowledgeArticle.updated_at))
        .limit(5)
        .all()
    )

    recent_items = [
        RecentActivityItem(
            id=art.id,
            title=art.title,
            category=art.category,
            status=art.status,
            author_name=author_name or "Unknown Expert",
            created_at=art.updated_at,
        )
        for art, author_name in recent_articles_query
    ]

    return DashboardStatsResponse(
        total_machines=total_machines,
        approved_articles=approved_articles,
        procedures_count=procedures_count,
        pending_reviews=pending_reviews,
        audio_references=audio_references,
        active_simulations=active_simulations,
        recent_articles=recent_items,
    )
