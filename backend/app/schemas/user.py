from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class RoleResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role_id: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
