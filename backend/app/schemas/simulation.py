from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class SimulationChoice(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=500)
    consequence: str = Field(min_length=1)
    observation: Optional[str] = None
    explanation: str = Field(min_length=1)
    next_decision_id: Optional[str] = None
    terminal: bool = False
    preferred: bool = False
    safety_critical: bool = False
    source_refs: List[str] = Field(default_factory=list)


class SimulationDecisionPoint(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    situation: str = Field(min_length=1)
    evidence: List[str] = Field(default_factory=list)
    choices: List[SimulationChoice] = Field(min_length=2, max_length=20)


class SimulationScenarioContent(BaseModel):
    title: str = Field(min_length=3, max_length=256)
    description: str = Field(min_length=1)
    operation: Optional[str] = None
    machine_id: Optional[str] = None
    difficulty: str = "INTERMEDIATE"
    initial_situation: str = Field(min_length=1)
    learning_objectives: List[str] = Field(min_length=1)
    prerequisites: List[str] = Field(default_factory=list)
    safety_precautions: List[str] = Field(default_factory=list)
    start_decision_id: str = Field(min_length=1, max_length=100)
    decision_points: List[SimulationDecisionPoint] = Field(min_length=1, max_length=100)
    source_version_ids: List[str] = Field(min_length=1, max_length=50)
    related_workflow_ids: List[str] = Field(default_factory=list)
    related_troubleshooting_ids: List[str] = Field(default_factory=list)


class SimulationDraftCreate(BaseModel):
    content: SimulationScenarioContent


class SimulationDraftUpdate(BaseModel):
    content: SimulationScenarioContent


class SimulationDecisionRequest(BaseModel):
    choice_id: str = Field(min_length=1, max_length=100)


class SimulationReportRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    decision_id: Optional[str] = None


class SimulationReportDisposition(BaseModel):
    status: str = Field(pattern="^(reviewed|scenario_update_needed|no_change)$")
    reviewer_note: str = Field(min_length=3, max_length=2000)


class SimulationRevisionSummary(BaseModel):
    id: str
    revision_no: int
    status: str
    created_at: datetime
    published_at: Optional[datetime] = None


class SimulationScenarioSummary(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str
    operation: Optional[str] = None
    machine_id: Optional[str] = None
    revision_id: str
    revision_no: int
    learning_objectives: List[str]


class SimulationSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    scenario_id: str
    revision_id: Optional[str]
    status: str
    current_decision_id: Optional[str]
    current_decision: Optional[Dict[str, Any]] = None
    initial_situation: Optional[str] = None
    learning_objectives: List[str] = Field(default_factory=list)
    safety_precautions: List[str] = Field(default_factory=list)
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    report: Optional[Dict[str, Any]] = None
    started_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
