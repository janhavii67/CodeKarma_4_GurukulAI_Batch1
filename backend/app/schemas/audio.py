from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeSourceCitation(BaseModel):
    knowledge_item_id: str
    knowledge_version_id: str
    title: str
    version_no: Optional[int] = None
    source_type: str = "knowledge"


class AudioCandidate(BaseModel):
    reference_id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    model_name: Optional[str] = None
    component: Optional[str] = None
    operation: Optional[str] = None
    operating_conditions: Optional[str] = None
    interpretation: str
    similarity_score: float = Field(ge=0.0, le=1.0)
    knowledge_version_id: str
    knowledge_item_id: Optional[str] = None
    knowledge_sources: List[KnowledgeSourceCitation] = Field(default_factory=list)
    related_links: List[dict[str, Any]] = Field(default_factory=list)


class AudioReferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    interpretation: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    model_name: Optional[str] = None
    component: Optional[str] = None
    operation: Optional[str] = None
    duration_seconds: float
    sample_rate: int
    operating_conditions: Optional[str] = None
    recording_source: Optional[str] = None
    recorded_at: Optional[datetime] = None
    status: str
    knowledge_version_id: Optional[str] = None
    knowledge_item_id: Optional[str] = None
    media_asset_id: Optional[str] = None
    audio_url: Optional[str] = None
    related_links: List[dict[str, Any]] = Field(default_factory=list)
    source_references: List[KnowledgeSourceCitation] = Field(default_factory=list)
    uploaded_by: str
    created_at: datetime


class AudioAnalysisJobResponse(BaseModel):
    id: str
    status: str
    matched_reference: Optional[AudioCandidate] = None
    similarity_score: Optional[float] = None
    reason_code: str
    message: str
    limitation: str = "Similarity is not a diagnosis, fault probability, or machine-safety determination."
    requires_expert_review: bool
    candidate_matches: List[AudioCandidate] = Field(default_factory=list)
    review_status: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class AudioReferenceUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    machine_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=4000)
    model_name: Optional[str] = Field(None, max_length=256)
    component: Optional[str] = Field(None, max_length=256)
    operation: Optional[str] = Field(None, max_length=256)
    operating_conditions: Optional[str] = Field(None, max_length=2000)
    recording_source: Optional[str] = Field(None, max_length=256)
    related_links: Optional[List[dict[str, Any]]] = None
    interpretation: Optional[str] = Field(None, max_length=4000)


class AudioReferenceDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|changes_requested)$")
    comment: Optional[str] = Field(None, max_length=2000)


class AudioReviewSubmissionResponse(BaseModel):
    id: str
    status: str
    review_status: Optional[str] = None
    submitted_at: datetime
    message: str


class AudioReviewQueueItem(BaseModel):
    id: str
    title: Optional[str] = None
    machine_id: Optional[str] = None
    status: str
    reason_code: str
    created_at: datetime
    uploaded_by: str
    media_asset_id: Optional[str] = None
