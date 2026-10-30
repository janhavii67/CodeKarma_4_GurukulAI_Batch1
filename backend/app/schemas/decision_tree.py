"""Pydantic schemas for the Decision Tree builder (expert) and walker (trainee)."""
from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ---- Guide (top-level container) ----

class DecisionTreeGuideCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=256)
    problem_category: str = Field(..., min_length=2, max_length=64)
    machine_id: Optional[str] = None
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"


class DecisionTreeGuideUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=256)
    problem_category: Optional[str] = Field(None, min_length=2, max_length=64)
    machine_id: Optional[str] = None
    severity: Optional[Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = None


class DecisionTreeGuideListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    problem_category: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    severity: str
    current_published_version_id: Optional[str] = None
    draft_version_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DecisionTreeGuideDetail(DecisionTreeGuideListItem):
    owner_id: str
    owner_name: Optional[str] = None
    versions: List["DecisionTreeVersionSummary"] = []


# ---- Version ----

class DecisionTreeVersionSummary(BaseModel):
    id: str
    version_number: int
    status: str
    author_id: str
    author_name: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None


class DecisionTreeVersionCreate(BaseModel):
    revision_reason: Optional[str] = Field(None, max_length=500)


# ---- Node ----

class DecisionTreeNodeCreate(BaseModel):
    node_type: Literal["check", "question", "action", "stop", "escalation", "end"] = "question"
    title: str = Field(..., min_length=1, max_length=256)
    instructions: str = ""
    safety_warning: Optional[str] = None
    help_text: Optional[str] = None
    expected_observation: Optional[str] = None
    input_type: Literal["yes_no", "choice", "numeric"] = "choice"
    input_rules: Optional[str] = None
    is_start: bool = False
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    linked_knowledge_version_id: Optional[str] = None
    linked_workflow_version_id: Optional[str] = None
    media_asset_ids: Optional[List[str]] = None


class DecisionTreeNodeUpdate(BaseModel):
    node_type: Optional[Literal["check", "question", "action", "stop", "escalation", "end"]] = None
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    instructions: Optional[str] = None
    safety_warning: Optional[str] = None
    help_text: Optional[str] = None
    expected_observation: Optional[str] = None
    input_type: Optional[Literal["yes_no", "choice", "numeric"]] = None
    input_rules: Optional[str] = None
    is_start: Optional[bool] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    linked_knowledge_version_id: Optional[str] = None
    linked_workflow_version_id: Optional[str] = None
    media_asset_ids: Optional[List[str]] = None


class DecisionTreeNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    node_type: str
    title: str
    instructions: str
    safety_warning: Optional[str] = None
    help_text: Optional[str] = None
    expected_observation: Optional[str] = None
    input_type: str
    input_rules: Optional[str] = None
    is_start: bool
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    linked_knowledge_version_id: Optional[str] = None
    linked_workflow_version_id: Optional[str] = None
    media: List[dict] = []


# ---- Edge ----

class DecisionTreeEdgeCreate(BaseModel):
    from_node_id: str
    to_node_id: str
    label: str = Field(..., min_length=1, max_length=128)
    condition: Optional[str] = None


class DecisionTreeEdgeUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=128)
    condition: Optional[str] = None


class DecisionTreeEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_node_id: str
    to_node_id: str
    label: str
    condition: Optional[str] = None


# ---- Full version detail (tree canvas data) ----

class DecisionTreeVersionDetail(BaseModel):
    id: str
    guide_id: str
    version_number: int
    status: str
    revision_reason: Optional[str] = None
    author_id: str
    author_name: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None
    nodes: List[DecisionTreeNodeResponse] = []
    edges: List[DecisionTreeEdgeResponse] = []


# ---- Batch position update ----

class NodePositionPatch(BaseModel):
    id: str
    position_x: float
    position_y: float


class BatchPositionUpdate(BaseModel):
    positions: List[NodePositionPatch] = Field(..., min_length=1, max_length=500)


# ---- Publish / status change ----

class VersionStatusChange(BaseModel):
    action: Literal["submit_review", "approve", "reject", "withdraw"]
    reason: Optional[str] = Field(None, max_length=500)


# ---- Trainee walk ----

class TraineeTreeStart(BaseModel):
    guide_id: str
    machine_id: Optional[str] = None


class TraineeAnswerSubmit(BaseModel):
    edge_id: str


class TraineeWalkState(BaseModel):
    session_id: str
    guide_id: str
    guide_title: str
    version_id: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    current_node: DecisionTreeNodeResponse
    available_edges: List[DecisionTreeEdgeResponse] = []
    path: List[dict] = []
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
