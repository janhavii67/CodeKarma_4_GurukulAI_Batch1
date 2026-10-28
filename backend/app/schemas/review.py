from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ReviewDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(APPROVED|REJECTED)$")
    comments: Optional[str] = Field(None, max_length=1000)
    acknowledged_ai_draft: bool = False


class ReviewQueueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    article_id: str
    title: str
    category: str
    machine_name: Optional[str] = None
    author_id: str
    author_name: str
    version: int
    submitted_at: datetime
    content_preview: str
    requires_ai_draft_acknowledgment: bool = False
