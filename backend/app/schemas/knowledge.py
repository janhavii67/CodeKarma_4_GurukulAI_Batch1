from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class KnowledgeRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version: int
    title: str
    content: str
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None
    author_id: str
    changelog: Optional[str] = None
    created_at: datetime


class KnowledgeArticleCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=256)
    machine_id: Optional[str] = None
    category: str = Field("GENERAL", max_length=64)
    tags: Optional[str] = None
    content: str = Field(..., min_length=10)
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None


class KnowledgeArticleUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=256)
    machine_id: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    content: Optional[str] = Field(None, min_length=10)
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None
    changelog: Optional[str] = None


class ReviewRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reviewer_id: str
    reviewer_name: Optional[str] = None
    status: str
    comments: Optional[str] = None
    created_at: datetime


class KnowledgeArticleDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    category: str
    tags: Optional[str] = None
    status: str
    current_version: int
    author_id: str
    author_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    current_revision: Optional[KnowledgeRevisionResponse] = None
    reviews: List[ReviewRecordResponse] = []


class KnowledgeArticleListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    category: str
    tags: Optional[str] = None
    status: str
    current_version: int
    author_name: str
    created_at: datetime
    updated_at: datetime


class KnowledgeListResponse(BaseModel):
    items: List[KnowledgeArticleListItem]
    total: int
    page: int
    page_size: int
    total_pages: int = 1

