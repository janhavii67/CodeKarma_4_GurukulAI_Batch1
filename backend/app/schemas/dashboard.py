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


class DashboardStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_machines: int
    approved_articles: int
    procedures_count: int
    pending_reviews: int
    audio_references: int
    active_simulations: int
    recent_articles: List[RecentActivityItem]

