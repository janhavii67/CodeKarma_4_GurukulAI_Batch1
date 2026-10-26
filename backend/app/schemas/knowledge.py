from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.machine import MachineResponse

MAX_STEPS_PER_VERSION = 100
MAX_TOOLS_PER_STEP = 50


class Step(BaseModel):
    order: int = Field(default=1, ge=1)
    title: str = Field(default="", max_length=255)
    instruction: str = Field(default="", max_length=5000)
    tools: List[str] = Field(default_factory=list)
    safety_warning: Optional[str] = Field(None, max_length=2000)
    expected_result: Optional[str] = Field(None, max_length=2000)
    stop_condition: Optional[str] = Field(None, max_length=2000)
    needs_review: bool = False
    source_segment_ids: List[int] = Field(default_factory=list)
    ai_generated: bool = False
    note: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("tools")
    @classmethod
    def validate_tools(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_TOOLS_PER_STEP:
            raise ValueError(f"A step cannot have more than {MAX_TOOLS_PER_STEP} tools.")
        cleaned = []
        for t in v:
            stripped = t.strip()
            if stripped and stripped not in cleaned:
                if len(stripped) > 100:
                    raise ValueError("Tool name must not exceed 100 characters.")
                cleaned.append(stripped)
        return cleaned


class KnowledgeCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    machine_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=10000)
    summary: Optional[str] = Field(None, max_length=10000)
    category: Optional[str] = Field("GENERAL", max_length=64)
    tags: Optional[str] = None
    content: Optional[str] = None
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class KnowledgeUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    machine_id: Optional[str] = None
    summary: Optional[str] = Field(None, max_length=10000)
    description: Optional[str] = Field(None, max_length=10000)
    steps: Optional[List[Step]] = None
    revision_reason: Optional[str] = Field(None, max_length=2000)
    version_id: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    content: Optional[str] = None
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None
    changelog: Optional[str] = None

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    @field_validator("steps")
    @classmethod
    def validate_steps_length(cls, v: Optional[List[Step]]) -> Optional[List[Step]]:
        if v is not None and len(v) > MAX_STEPS_PER_VERSION:
            raise ValueError(f"A version cannot contain more than {MAX_STEPS_PER_VERSION} steps.")
        return v


class RevisionCreateRequest(BaseModel):
    revision_reason: str = Field(..., min_length=1, max_length=2000)

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class KnowledgeVersionResponse(BaseModel):
    id: str
    item_id: str
    version_no: int
    status: str
    summary: Optional[str] = None
    description: Optional[str] = None
    steps: List[Step] = Field(default_factory=list)
    origin: str
    revision_reason: Optional[str] = None
    created_by: str
    submitted_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def sanitize_steps(cls, data):
        if isinstance(data, dict):
            steps_val = data.get("steps")
            if isinstance(steps_val, str):
                data["steps"] = [{"order": 1, "title": "Operational Protocol", "instruction": steps_val}]
            elif steps_val is None:
                data["steps"] = []
        elif hasattr(data, "__dict__"):
            steps_val = getattr(data, "steps", None)
            if isinstance(steps_val, str):
                try:
                    data.steps = [{"order": 1, "title": "Operational Protocol", "instruction": steps_val}]
                except Exception:
                    pass
            elif steps_val is None:
                try:
                    data.steps = []
                except Exception:
                    pass
        return data


class KnowledgeVersionSummaryResponse(BaseModel):
    id: str
    item_id: str
    version_no: int
    status: str
    summary: Optional[str] = None
    origin: str
    revision_reason: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeItemDetailResponse(BaseModel):
    id: str
    title: str
    machine_id: Optional[str] = None
    category: Optional[str] = "GENERAL"
    tags: Optional[str] = None
    status: Optional[str] = "DRAFT"
    current_version: int = 1
    author_id: str
    current_published_version_id: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    version: Optional[KnowledgeVersionResponse] = None
    summary: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    machine: Optional[MachineResponse] = None
    current_revision: Optional[KnowledgeRevisionResponse] = None
    reviews: List[ReviewRecordResponse] = Field(default_factory=list)
    rag_indexed: bool = False
    rag_chunks_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class KnowledgeListItemResponse(BaseModel):
    id: str
    title: str
    machine_id: Optional[str] = None
    author_id: str
    current_published_version_id: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    version_id: str = ""
    version_no: int = 1
    version_status: str = "draft"
    version_summary: Optional[str] = None
    version_updated_at: Optional[datetime] = None
    machine: Optional[MachineResponse] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version: int = 1
    title: str = ""
    content: str = ""
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None
    author_id: str = ""
    changelog: Optional[str] = None
    created_at: datetime


class KnowledgeArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    machine_id: Optional[str] = None
    category: str = Field("GENERAL", max_length=64)
    tags: Optional[str] = None
    content: Optional[str] = None
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class KnowledgeArticleUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    machine_id: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    content: Optional[str] = None
    operating_conditions: Optional[str] = None
    prerequisites: Optional[str] = None
    safety_warnings: Optional[str] = None
    common_mistakes: Optional[str] = None
    corrective_actions: Optional[str] = None
    changelog: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


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
    category: str = "GENERAL"
    tags: Optional[str] = None
    status: str = "DRAFT"
    current_version: int = 1
    author_id: str
    author_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    current_revision: Optional[KnowledgeRevisionResponse] = None
    version: Optional[KnowledgeVersionResponse] = None
    reviews: List[ReviewRecordResponse] = []


class KnowledgeArticleListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    category: str = "GENERAL"
    tags: Optional[str] = None
    status: str = "DRAFT"
    current_version: int = 1
    author_name: str = "Expert"
    created_at: datetime
    updated_at: datetime


class KnowledgeListResponse(BaseModel):
    items: List[Any] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 1

    model_config = ConfigDict(from_attributes=True)
