from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class TroubleshootingNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    node_type: str
    title: str
    description: str
    safety_warning: Optional[str] = None
    is_root: bool


class TroubleshootingEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_node_id: str
    to_node_id: str
    label: str


class TroubleshootingCaseListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    symptom: str
    severity: str
    is_published: bool
    created_at: datetime


class TroubleshootingCaseDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    machine_id: Optional[str] = None
    machine_name: Optional[str] = None
    symptom: str
    severity: str
    is_published: bool
    nodes: List[TroubleshootingNodeResponse] = []
    edges: List[TroubleshootingEdgeResponse] = []
    created_at: datetime
