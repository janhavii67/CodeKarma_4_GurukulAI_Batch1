from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
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
        # Filter and strip, preserving non-empty tools
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

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class KnowledgeUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    machine_id: Optional[str] = None
    summary: Optional[str] = Field(None, max_length=10000)
    description: Optional[str] = Field(None, max_length=10000)
    steps: Optional[List[Step]] = None
    revision_reason: Optional[str] = Field(None, max_length=2000)
    version_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("steps")
    @classmethod
    def validate_steps_length(cls, v: Optional[List[Step]]) -> Optional[List[Step]]:
        if v is not None and len(v) > MAX_STEPS_PER_VERSION:
            raise ValueError(f"A version cannot contain more than {MAX_STEPS_PER_VERSION} steps.")
        return v


class RevisionCreateRequest(BaseModel):
    revision_reason: str = Field(..., min_length=1, max_length=2000)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


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
    author_id: str
    current_published_version_id: Optional[str] = None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    version: KnowledgeVersionResponse
    machine: Optional[MachineResponse] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeListItemResponse(BaseModel):
    id: str
    title: str
    machine_id: Optional[str] = None
    author_id: str
    current_published_version_id: Optional[str] = None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    version_id: str
    version_no: int
    version_status: str
    version_summary: Optional[str] = None
    version_updated_at: datetime
    machine: Optional[MachineResponse] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeListResponse(BaseModel):
    items: List[KnowledgeListItemResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(from_attributes=True)
