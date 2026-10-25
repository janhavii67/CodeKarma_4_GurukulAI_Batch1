from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class LearningItemResponse(BaseModel):
    id: str
    item_type: str
    reference_id: str
    order_index: int
    title: str

    model_config = ConfigDict(from_attributes=True)


class LearningPathResponse(BaseModel):
    id: str
    title: str
    description: str
    target_role: str
    items_count: int
    items: List[LearningItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class LearningAssignmentResponse(BaseModel):
    id: str
    path_id: str
    path_title: str
    path_description: str
    status: str
    progress_percentage: int
    assigned_at: datetime
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_items: int
    items: List[LearningItemResponse] = []


class InProgressProcedureResponse(BaseModel):
    run_id: str
    procedure_id: str
    procedure_title: str
    machine_name: Optional[str] = None
    status: str
    started_at: datetime
    completed_steps: int
    total_steps: int
    progress_percentage: int


class UpcomingAssessmentResponse(BaseModel):
    id: str
    title: str
    type: str
    difficulty: str
    due_at: Optional[datetime] = None


class NotificationResponse(BaseModel):
    id: str
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TraineeDashboardMetrics(BaseModel):
    welcome_message: str
    user_name: str
    role_id: str
    assigned_paths_count: int
    in_progress_procedures_count: int
    completed_tasks_count: int
    upcoming_assessments_count: int
    available_procedures_count: int
    unread_notifications_count: int
    assigned_paths: List[LearningAssignmentResponse]
    in_progress_procedures: List[InProgressProcedureResponse]
    upcoming_assessments: List[UpcomingAssessmentResponse]
    recent_activity: List[dict]
    notifications: List[NotificationResponse]
