from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ToolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tool_number: str
    description: Optional[str] = None
    specifications: Optional[str] = None


class MachineCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    model_number: str = Field(..., min_length=2, max_length=64)
    serial_number: Optional[str] = Field(None, max_length=64)
    manufacturer: Optional[str] = Field(None, max_length=128)
    category_id: str
    location: Optional[str] = Field(None, max_length=128)
    status: str = Field("ACTIVE", max_length=32)
    specifications: Optional[str] = None


class MachineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    model_number: str
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    category_id: str
    category_name: Optional[str] = None
    location: Optional[str] = None
    status: str
    specifications: Optional[str] = None
    tools: List[ToolResponse] = []
    created_at: datetime
    updated_at: datetime


class MachineCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
