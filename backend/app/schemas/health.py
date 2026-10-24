from typing import Optional
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    latency_ms: Optional[float] = None
