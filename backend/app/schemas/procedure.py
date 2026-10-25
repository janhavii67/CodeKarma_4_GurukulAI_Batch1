from typing import Optional, List
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


class ProcedureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    author_id: str
    status: str
    version: int
    prerequisites: Optional[str] = None
    required_tools: Optional[str] = None
    safety_warnings: Optional[str] = None
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
    step_executions: List[ProcedureRunStepResponse] = []


class StepCompletionRequest(BaseModel):
    is_completed: bool = True
    operator_notes: Optional[str] = Field(None, max_length=500)
