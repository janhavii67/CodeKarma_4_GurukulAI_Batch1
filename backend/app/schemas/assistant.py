from datetime import datetime
from enum import Enum
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.audio import AudioAnalysisJobResponse


class FeedbackReason(str, Enum):
    incorrect = "incorrect"
    missing_source = "missing_source"
    outdated = "outdated"
    irrelevant = "irrelevant"
    conflicting = "conflicting"
    insufficient = "insufficient"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, description="User query or message")
    conversation_id: Optional[str] = Field(None, description="Optional existing conversation ID")
    machine_id: Optional[str] = Field(None, description="Optional machine context ID")
    audio_analysis_job_id: Optional[str] = Field(None, description="Owned audio analysis result to explain using its approved reference")
    image_media_id: Optional[str] = Field(None, description="Optional uploaded image media asset ID to analyze")


class SourceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chunk_id: str
    source_id: str
    title: str
    section_label: Optional[str] = None
    snippet: str
    score: float
    rank: int
    source_type: str = "knowledge_version"
    machine_id: Optional[str] = None


class TutorHandoffSuggestion(BaseModel):
    kind: Literal["workflow", "troubleshooting"]
    target_id: str = Field(..., min_length=1, max_length=36)
    title: str = Field(..., min_length=1, max_length=256)
    reason: str


class TutorHandoffStartRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=36)
    message_id: str = Field(..., min_length=1, max_length=36)


class TutorHandoffStartResponse(BaseModel):
    kind: Literal["workflow", "troubleshooting"]
    session_id: str
    title: str
    resumed: bool = False


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceItem]
    insufficient_evidence: bool
    provider_unavailable: bool = False
    conversation_id: str
    message_id: str
    audio_analysis: Optional[AudioAnalysisJobResponse] = None
    handoffs: List[TutorHandoffSuggestion] = Field(default_factory=list)


class MessageItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    content: str
    is_ai_generated: bool
    evidence_status: str
    provider_unavailable: bool = False
    created_at: datetime
    sources: List[SourceItem] = []
    audio_analysis: Optional[AudioAnalysisJobResponse] = None
    conversation_id: Optional[str] = None
    handoffs: List[TutorHandoffSuggestion] = Field(default_factory=list)


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    machine_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    machine_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[MessageItem]


class FeedbackRequest(BaseModel):
    message_id: str = Field(..., description="ID of the assistant chat message")
    rating: Optional[int] = Field(None, ge=1, le=5, description="1 to 5 rating scale")
    reason: FeedbackReason = Field(..., description="Reason category for feedback")
    comment: Optional[str] = Field(None, max_length=1000, description="Optional user comment")


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    message_id: str
    user_id: str
    rating: Optional[int] = None
    category: str
    comment: Optional[str] = None
    status: str
    created_at: datetime


class SourceChunkItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chunk_index: int
    text: str
    section_label: Optional[str] = None
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None


class SourceDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    source_type: str
    source_ref_id: str
    status: str
    machine_id: Optional[str] = None
    indexed_at: datetime
    chunks: List[SourceChunkItem] = []


class IngestRequest(BaseModel):
    folder_path: str = Field(default="Knowledge Base", description="Relative or absolute path to folder")


class IngestedItemSchema(BaseModel):
    name: str
    chunk_count: int
    status: str


class SkippedItemSchema(BaseModel):
    name: str
    reason: str


class IngestResponse(BaseModel):
    folder_path: str
    ingested_files: List[IngestedItemSchema]
    skipped_files: List[SkippedItemSchema]
    total_chunks: int
