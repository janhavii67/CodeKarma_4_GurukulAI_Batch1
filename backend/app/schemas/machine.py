from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tool_number: str
    description: Optional[str] = None
    specifications: Optional[str] = None


class MachineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    code: Optional[str] = Field(None, min_length=1, max_length=64)
    model_number: Optional[str] = Field(None, min_length=1, max_length=64)
    category: Optional[str] = Field(None, max_length=64)
    category_id: Optional[str] = None
    serial_number: Optional[str] = Field(None, max_length=64)
    manufacturer: Optional[str] = Field(None, max_length=128)
    location: Optional[str] = Field(None, max_length=128)
    status: str = Field("ACTIVE", max_length=32)
    specifications: Optional[str] = None
    is_demo: bool = False

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def populate_defaults(cls, data):
        if isinstance(data, dict):
            if "code" in data and not data.get("model_number"):
                data["model_number"] = data["code"]
            elif "model_number" in data and not data.get("code"):
                data["code"] = data["model_number"]
            if "category" in data and not data.get("category_id"):
                data["category_id"] = data["category"]
            elif "category_id" in data and not data.get("category"):
                data["category"] = data["category_id"]
        return data


class MachineCreate(MachineBase):
    pass


class MachineResponse(MachineBase):
    id: str
    code: str = ""
    category: str = ""
    category_name: Optional[str] = None
    tools: List[ToolResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def set_response_fields(cls, data):
        if hasattr(data, "code") and hasattr(data, "model_number"):
            if not getattr(data, "code", None) and getattr(data, "model_number", None):
                setattr(data, "code", getattr(data, "model_number"))
        if hasattr(data, "category") and hasattr(data, "category_id"):
            if not getattr(data, "category", None) and getattr(data, "category_id", None):
                setattr(data, "category", getattr(data, "category_id"))
        return data


class MachineCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None


class MachineListResponse(BaseModel):
    items: List[MachineResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(from_attributes=True)
