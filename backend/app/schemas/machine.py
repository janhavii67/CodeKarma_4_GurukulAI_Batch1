from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict, Field


class MachineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    code: str = Field(..., min_length=1, max_length=64)
    category: str = Field(..., min_length=1, max_length=64)
    is_demo: bool = False

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MachineCreate(MachineBase):
    pass


class MachineResponse(MachineBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MachineListResponse(BaseModel):
    items: List[MachineResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(from_attributes=True)
