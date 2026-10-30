"""Request schemas for the decision tree builder (experts) and walk-through (trainees)."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

NodeType = Literal["start", "question", "action", "safety", "media", "workflow", "result",
                   "answer", "check", "stop", "escalation", "end"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Difficulty = Literal["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]


class DecisionTreeGuideCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=256)
    problem_category: str = Field(..., min_length=2, max_length=64)
    machine_id: Optional[str] = None
    severity: Severity = "MEDIUM"
    description: Optional[str] = Field(None, max_length=4000)
    difficulty: Difficulty = "INTERMEDIATE"
    tags: List[str] = Field(default_factory=list, max_length=20)
    cover_media_id: Optional[str] = None
    estimated_minutes: Optional[int] = Field(None, ge=1, le=600)
    simulation: Optional[Dict[str, Any]] = None


class DecisionTreeGuideUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=256)
    problem_category: Optional[str] = Field(None, min_length=2, max_length=64)
    machine_id: Optional[str] = None
    severity: Optional[Severity] = None
    description: Optional[str] = Field(None, max_length=4000)
    difficulty: Optional[Difficulty] = None
    tags: Optional[List[str]] = Field(None, max_length=20)
    cover_media_id: Optional[str] = None
    estimated_minutes: Optional[int] = Field(None, ge=1, le=600)
    simulation: Optional[Dict[str, Any]] = None


class DecisionTreeVersionCreate(BaseModel):
    revision_reason: Optional[str] = Field(None, max_length=500)


class VersionStatusChange(BaseModel):
    action: Literal["submit_review", "withdraw_submission", "approve", "reject", "withdraw"]
    reason: Optional[str] = Field(None, max_length=1000)


class NodeFields(BaseModel):
    node_type: Optional[NodeType] = None
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    instructions: Optional[str] = Field(None, max_length=8000)
    safety_warning: Optional[str] = Field(None, max_length=4000)
    help_text: Optional[str] = Field(None, max_length=4000)
    expected_observation: Optional[str] = Field(None, max_length=4000)
    input_type: Optional[Literal["yes_no", "choice", "numeric"]] = None
    input_rules: Optional[str] = Field(None, max_length=2000)
    is_start: Optional[bool] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    linked_knowledge_version_id: Optional[str] = None
    linked_workflow_version_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    media_asset_ids: Optional[List[str]] = Field(None, max_length=30)


class ConnectFrom(BaseModel):
    node_id: str
    edge_id: Optional[str] = None
    label: Optional[str] = Field(None, max_length=128)


class DecisionTreeNodeCreate(NodeFields):
    node_type: NodeType = "question"
    title: str = Field("Untitled step", min_length=1, max_length=256)
    connect_from: Optional[ConnectFrom] = None


class DecisionTreeNodeUpdate(NodeFields):
    mark_reviewed: bool = False


class DecisionTreeEdgeCreate(BaseModel):
    from_node_id: str
    to_node_id: Optional[str] = None
    label: Optional[str] = Field(None, max_length=128)
    condition: Optional[str] = Field(None, max_length=1000)


class DecisionTreeEdgeUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=128)
    condition: Optional[str] = Field(None, max_length=1000)
    to_node_id: Optional[str] = None


class AnswerOrder(BaseModel):
    edge_ids: List[str] = Field(..., max_length=50)


class NodePositionPatch(BaseModel):
    id: str
    position_x: float
    position_y: float


class BatchPositionUpdate(BaseModel):
    positions: List[NodePositionPatch] = Field(..., min_length=1, max_length=500)


class GraphSnapshot(BaseModel):
    nodes: List[Dict[str, Any]] = Field(..., max_length=500)
    edges: List[Dict[str, Any]] = Field(..., max_length=2000)


class AIDraftRequest(BaseModel):
    prompt: str = Field("", max_length=2000)
    replace: bool = False


class TraineeTreeStart(BaseModel):
    guide_id: str


class TraineeAnswerSubmit(BaseModel):
    edge_id: str


class TraineeGoBack(BaseModel):
    step_index: int = Field(..., ge=0)


class TraineeEscalate(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)


class TraineeExplain(BaseModel):
    question: str = Field("", max_length=1000)
