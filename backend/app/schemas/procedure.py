from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ProcedureStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    step_order: int
    title: str
    instruction: str
    expected_observation: Optional[str] = None
    safety_warning: Optional[str] = None
    is_critical: bool
    details: Dict[str, Any] = Field(default_factory=dict)


class ProcedureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    machine_model: Optional[str] = None
    author_id: str
    status: str
    version: int
    prerequisites: Optional[str] = None
    required_tools: Optional[str] = None
    safety_warnings: Optional[str] = None
    operating_conditions: Optional[str] = None
    operation: Optional[str] = None
    troubleshooting_guidance: Optional[str] = None
    knowledge_version_id: Optional[str] = None
    source_refs: List[Dict[str, Any]] = Field(default_factory=list)
    steps: List[ProcedureStepResponse] = []
    created_at: datetime
    updated_at: datetime


class ProcedureRunStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    step_id: str
    is_completed: bool
    operator_notes: Optional[str] = None
    verified_at: Optional[datetime] = None


class ProcedureRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    procedure_id: str
    operator_id: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    current_step_order: int = 1
    issues: List[Dict[str, Any]] = Field(default_factory=list)
    workflow: Optional[ProcedureResponse] = None
    step_executions: List[ProcedureRunStepResponse] = []


class StepCompletionRequest(BaseModel):
    is_completed: bool = True
    operator_notes: Optional[str] = Field(None, max_length=500)


class WorkflowStepNavigationRequest(BaseModel):
    step_order: int = Field(..., ge=1)


class WorkflowIssueRequest(BaseModel):
    step_id: str
    description: str = Field(..., min_length=3, max_length=1000)


class WorkflowSourceResponse(BaseModel):
    version_id: str
    item_id: str
    version_no: int
    title: str
    summary: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    steps_count: int


class WorkflowDraftResponse(BaseModel):
    item_id: str
    version_id: str
    title: str
    status: str
    source_refs: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowIssueResult(BaseModel):
    issue: Dict[str, Any]
    guidance: List[Dict[str, Any]] = Field(default_factory=list)
    guidance_status: str
