from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class CandidateScore(BaseModel):
    reference_id: str
    title: str
    fault_label: str
    machine_name: Optional[str] = None
    similarity_score: float
    confidence_tier: str  # "HIGH", "MODERATE", "LOW", "MARGINAL"


class AudioReferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    duration_seconds: float
    sample_rate: int
    fault_label: str
    is_expert_verified: bool
    operating_conditions: Optional[str] = None
    uploaded_by: str
    created_at: datetime


class AudioAnalysisJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str  # QUEUED, MATCHED, NO_RELIABLE_MATCH, AMBIGUOUS_MATCH, UNSUITABLE_AUDIO, INVALID_FILE, FAILED
    matched_reference_id: Optional[str] = None
    matched_reference_title: Optional[str] = None
    fault_label: Optional[str] = None
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    similarity_score: Optional[float] = None
    reason_code: str
    message: str
    requires_expert_review: bool
    candidate_matches: List[CandidateScore] = []
    created_at: datetime
    completed_at: Optional[datetime] = None


class AudioSimulationAnalyzeRequest(BaseModel):
    scenario: str = Field(..., description="e.g. 'normal_spindle', 'bearing_whine', 'cavitation', 'silence', 'ambient_noise', 'speech'")
    machine_id: Optional[str] = None
