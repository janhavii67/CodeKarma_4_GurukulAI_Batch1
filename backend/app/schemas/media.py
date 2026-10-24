from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class MediaAssetResponse(BaseModel):
    id: str
    version_id: str
    kind: str
    original_name: str
    mime: str
    size_bytes: int
    uploaded_by: str
    created_at: datetime
    url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MediaConfigResponse(BaseModel):
    max_upload_bytes: int = Field(..., description="Maximum allowed upload payload size in bytes")
    allowed_mime_types: Dict[str, List[str]] = Field(
        ..., description="Allow-listed MIME types grouped by kind (audio, video, image, document)"
    )
    max_media_per_version: int = Field(
        ..., description="Maximum number of media assets attachable to a single version"
    )
