from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class RecentActivityItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    category: str
    status: str
    author_name: str
    created_at: datetime
    machine_name: Optional[str] = None
    version_no: Optional[int] = 1


class DashboardStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Global platform metrics (preserved for backwards-compatibility)
    total_machines: int
    approved_articles: int
    procedures_count: int
    pending_reviews: int
    audio_references: int
    active_simulations: int
    recent_articles: List[RecentActivityItem]

    # User-scoped contribution metrics (LeetCode-style real data)
    user_sops_created: int = 0
    user_sops_approved: int = 0
    user_sops_pending: int = 0
    user_sops_draft: int = 0
    user_revisions_count: int = 0
    user_machines_contributed: int = 0
    user_captured_duration_seconds: float = 0.0
    pending_reviews_for_user: int = 0
    user_reviews_completed: int = 0
    user_procedures_completed: int = 0
    latest_draft_id: Optional[str] = None
    latest_draft_title: Optional[str] = None

