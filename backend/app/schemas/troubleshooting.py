from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class TroubleshootingNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    node_type: str
    title: str
    description: str
    safety_warning: Optional[str] = None
    is_root: bool


class TroubleshootingEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_node_id: str
    to_node_id: str
    label: str


class TroubleshootingCaseListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    symptom: str
    severity: str
    is_published: bool
    created_at: datetime


class TroubleshootingCaseDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    symptom: str
    severity: str
    is_published: bool
    nodes: List[TroubleshootingNodeResponse] = []
    edges: List[TroubleshootingEdgeResponse] = []
    created_at: datetime


class TroubleshootingTopicResponse(BaseModel):
    item_id: str
    version_id: str
    version_no: int
    source_id: str
    title: str
    category: Optional[str] = None
    source_type: Optional[str] = None
    summary: Optional[str] = None
    excerpt: str
    section: Optional[str] = None
    score: float
    machine_id: Optional[str] = None


class TroubleshootingSessionCreateRequest(BaseModel):
    reported_symptom: str = Field(..., min_length=3, max_length=2000)
    machine_id: Optional[str] = None
    process_id: Optional[str] = None
    problem_category: Optional[str] = Field(None, max_length=64)
    operation_context: Optional[str] = Field(None, max_length=1000)
    checked_already: Optional[str] = Field(None, max_length=2000)
    workflow_run_id: Optional[str] = None
    workflow_issue_id: Optional[str] = None


class TroubleshootingCheckOutcomeRequest(BaseModel):
    outcome: Literal["pass", "fail", "unknown", "issue_persists", "resolved"]
    observation: Optional[str] = Field(None, max_length=2000)


class TroubleshootingCheckNavigationRequest(BaseModel):
    check_index: int = Field(..., ge=0)


class TroubleshootingEscalationRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)


class TroubleshootingKnowledgeDraftResponse(BaseModel):
    item_id: str
    version_id: str
    title: str
    status: str


class TroubleshootingExpertDispositionRequest(BaseModel):
    resolution_note: str = Field(..., min_length=3, max_length=2000)
    status: Literal["resolved", "unresolved"]
