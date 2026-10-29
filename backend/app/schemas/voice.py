from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class TranscriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    transcript_id: str
    idx: int
    start_s: float
    end_s: float
    original_text: str
    edited_text: Optional[str] = None
    needs_review: bool = False


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    media_id: str
    version_id: Optional[str] = None
    language: str = "en"
    provider: str
    full_text: str
    status: str
    created_at: datetime
    segments: List[TranscriptSegmentResponse] = []


class TranscriptTextUpdate(BaseModel):
    full_text: str = Field(..., min_length=1, max_length=200_000)


class MediaAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    machine_id: Optional[str] = None
    version_id: Optional[str] = None
    kind: str
    file_path: str
    original_name: str
    mime_type: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    uploaded_by: str
    created_at: datetime


class ProcessingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    media_id: str
    version_id: Optional[str] = None
    status: str  # queued, processing, needs_review, completed, failed, cancelled
    progress: Optional[int] = 0
    error_safe: Optional[str] = None
    transcript_saved: bool = False
    can_resume_structuring: bool = False
    attempts: int = 0
    created_by: str
    created_at: datetime
    updated_at: datetime


class TranscriptSegmentUpdate(BaseModel):
    edited_text: Optional[str] = None
    needs_review: Optional[bool] = None


class VoiceUploadResponse(BaseModel):
    media: MediaAssetResponse
    job: ProcessingJobResponse


class VectorSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query for tribal knowledge retrieval")
    top_k: int = Field(default=5, ge=1, le=50, description="Maximum number of relevant knowledge chunks to return")
    machine_id: Optional[str] = Field(None, description="Optional machine filter to scope knowledge retrieval")
    source_type: Optional[str] = Field(None, description="Optional filter: voice_segment, voice_transcript, etc.")


class VectorSearchItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_type: str
    source_id: str
    chunk_text: str
    similarity_score: float
    media_id: Optional[str] = None
    media_title: Optional[str] = None
    file_path: Optional[str] = None
    version_id: Optional[str] = None
    machine_id: Optional[str] = None
    start_s: Optional[float] = None
    end_s: Optional[float] = None
    metadata: Dict[str, Any] = {}


class VectorSearchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    query: str
    total: int
    results: List[VectorSearchItemResponse]


class StepDraftResponse(BaseModel):
    title: str
    instruction: str
    tools: List[str] = []
    safety_warning: Optional[str] = None
    expected_result: Optional[str] = None
    stop_condition: Optional[str] = None
    source_segment_ids: List[int] = []
    needs_review: bool = False
    note: Optional[str] = None


class StepsListResponse(BaseModel):
    media_id: str
    version_id: Optional[str] = None
    item_id: Optional[str] = None
    summary: Optional[str] = None
    detailed_summary: Optional[str] = None
    origin: str = "ai_draft"
    steps: List[StepDraftResponse] = []
    unclear_segments: List[int] = []
    flagged_count: int = 0
    can_submit: bool = True
    is_demo: bool = False
    submission_gate_status: str = "OPEN"


class CreateDraftFromVoiceResponse(BaseModel):
    item_id: str
    version_id: str
    title: str
    status: str
    origin: str
    steps_count: int

