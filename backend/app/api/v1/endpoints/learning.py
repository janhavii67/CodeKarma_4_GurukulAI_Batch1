from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.db.session import get_db
from app.db.base import utc_now
from app.core.permissions import get_current_user, AuthenticatedContext
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models import (
    LearningPath,
    LearningItem,
    LearningAssignment,
    Procedure,
    ProcedureStep,
    ProcedureRun,
    ProcedureRunStep,
    Machine,
    Notification,
    SimulationScenario,
)
from app.schemas.learning import (
    TraineeDashboardMetrics,
    LearningAssignmentResponse,
    LearningItemResponse,
    LearningPathResponse,
    InProgressProcedureResponse,
    UpcomingAssessmentResponse,
    NotificationResponse,
)

router = APIRouter(prefix="/learning", tags=["Learning & Trainee"])


@router.get("/dashboard", response_model=TraineeDashboardMetrics)
def get_trainee_dashboard(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve real database-backed trainee metrics:
    Assigned learning paths, active procedure runs, upcoming assessments, and notifications.
    Strictly scoped to the authenticated caller's own records.
    """
    user_id = auth_ctx.user.id

    # 1. Fetch Assigned Learning Paths
    assignments = (
        db.query(LearningAssignment)
        .filter(LearningAssignment.user_id == user_id)
        .order_by(desc(LearningAssignment.assigned_at))
        .all()
    )

    assigned_paths_res: List[LearningAssignmentResponse] = []
    for a in assignments:
        path = db.get(LearningPath, a.path_id)
        if not path:
            continue
        items_res = [
            LearningItemResponse(
                id=item.id,
                item_type=item.item_type,
                reference_id=item.reference_id,
                order_index=item.order_index,
                title=item.title,
            )
            for item in path.items
        ]
        assigned_paths_res.append(
            LearningAssignmentResponse(
                id=a.id,
                path_id=a.path_id,
                path_title=path.title,
                path_description=path.description,
                status=a.status,
                progress_percentage=a.progress_percentage,
                assigned_at=a.assigned_at,
                due_at=a.due_at,
                completed_at=a.completed_at,
                total_items=len(items_res),
                items=items_res,
            )
        )

    # 2. Fetch Active In-Progress Procedure Runs
    active_runs = (
        db.query(ProcedureRun)
        .filter(ProcedureRun.operator_id == user_id, ProcedureRun.status == "IN_PROGRESS")
        .order_by(desc(ProcedureRun.started_at))
        .all()
    )

    in_progress_procedures: List[InProgressProcedureResponse] = []
    for r in active_runs:
        proc = db.get(Procedure, r.procedure_id)
        if not proc:
            continue
        mach = db.get(Machine, proc.machine_id) if proc.machine_id else None
        total_steps = len(proc.steps)
        completed_steps = sum(1 for s in r.step_executions if s.is_completed)
        progress = int((completed_steps / total_steps * 100)) if total_steps > 0 else 0

        in_progress_procedures.append(
            InProgressProcedureResponse(
                run_id=r.id,
                procedure_id=proc.id,
                procedure_title=proc.title,
                machine_name=mach.name if mach else None,
                status=r.status,
                started_at=r.started_at,
                completed_steps=completed_steps,
                total_steps=total_steps,
                progress_percentage=progress,
            )
        )

    # 3. Completed Tasks Count
    completed_runs_count = (
        db.query(func.count(ProcedureRun.id))
        .filter(ProcedureRun.operator_id == user_id, ProcedureRun.status == "COMPLETED")
        .scalar()
        or 0
    )
    completed_assignments_count = (
        db.query(func.count(LearningAssignment.id))
        .filter(LearningAssignment.user_id == user_id, LearningAssignment.status == "COMPLETED")
        .scalar()
        or 0
    )
    completed_tasks_count = completed_runs_count + completed_assignments_count

    # 4. Upcoming Assessments (Simulations in assigned paths or active)
    upcoming_assessments: List[UpcomingAssessmentResponse] = []
    seen_sim_ids = set()
    for a in assigned_paths_res:
        for itm in a.items:
            if itm.item_type == "SIMULATION" and itm.reference_id not in seen_sim_ids:
                sim = db.get(SimulationScenario, itm.reference_id)
                if sim:
                    seen_sim_ids.add(sim.id)
                    upcoming_assessments.append(
                        UpcomingAssessmentResponse(
                            id=sim.id,
                            title=sim.title,
                            type="SIMULATION",
                            difficulty=sim.difficulty,
                            due_at=a.due_at,
                        )
                    )

    # 5. Available Approved Procedures Count
    available_procedures_count = (
        db.query(func.count(Procedure.id))
        .filter(Procedure.status == "APPROVED")
        .scalar()
        or 0
    )

    # 6. Notifications
    notifications_query = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(desc(Notification.created_at))
        .limit(10)
        .all()
    )
    unread_notifications_count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .scalar()
        or 0
    )
    notifications_res = [
        NotificationResponse.model_validate(n) for n in notifications_query
    ]

    # 7. Recent Training Activity
    recent_runs = (
        db.query(ProcedureRun)
        .filter(ProcedureRun.operator_id == user_id)
        .order_by(desc(ProcedureRun.started_at))
        .limit(5)
        .all()
    )
    recent_activity = []
    for r in recent_runs:
        proc = db.get(Procedure, r.procedure_id)
        recent_activity.append(
            {
                "id": r.id,
                "type": "PROCEDURE_RUN",
                "title": proc.title if proc else "Standard Procedure",
                "status": r.status,
                "timestamp": r.completed_at.isoformat() if r.completed_at else r.started_at.isoformat(),
            }
        )

    return TraineeDashboardMetrics(
        welcome_message="Welcome back. Continue your manufacturing training and track your progress.",
        user_name=auth_ctx.user.name,
        role_id=auth_ctx.user.role_id,
        assigned_paths_count=len(assigned_paths_res),
        in_progress_procedures_count=len(in_progress_procedures),
        completed_tasks_count=completed_tasks_count,
        upcoming_assessments_count=len(upcoming_assessments),
        available_procedures_count=available_procedures_count,
        unread_notifications_count=unread_notifications_count,
        assigned_paths=assigned_paths_res,
        in_progress_procedures=in_progress_procedures,
        upcoming_assessments=upcoming_assessments,
        recent_activity=recent_activity,
        notifications=notifications_res,
    )


@router.get("/assignments", response_model=List[LearningAssignmentResponse])
def list_my_assignments(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all learning curriculum paths assigned to the current operator/trainee."""
    assignments = (
        db.query(LearningAssignment)
        .filter(LearningAssignment.user_id == auth_ctx.user.id)
        .order_by(desc(LearningAssignment.assigned_at))
        .all()
    )

    results = []
    for a in assignments:
        path = db.get(LearningPath, a.path_id)
        if not path:
            continue
        items_res = [
            LearningItemResponse(
                id=item.id,
                item_type=item.item_type,
                reference_id=item.reference_id,
                order_index=item.order_index,
                title=item.title,
            )
            for item in path.items
        ]
        results.append(
            LearningAssignmentResponse(
                id=a.id,
                path_id=a.path_id,
                path_title=path.title,
                path_description=path.description,
                status=a.status,
                progress_percentage=a.progress_percentage,
                assigned_at=a.assigned_at,
                due_at=a.due_at,
                completed_at=a.completed_at,
                total_items=len(items_res),
                items=items_res,
            )
        )
    return results


@router.get("/my-progress")
def get_my_learning_progress(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve detailed learning progress, completed procedures, and skill milestones."""
    user_id = auth_ctx.user.id

    runs = (
        db.query(ProcedureRun)
        .filter(ProcedureRun.operator_id == user_id)
        .order_by(desc(ProcedureRun.started_at))
        .all()
    )

    run_items = []
    for r in runs:
        proc = db.get(Procedure, r.procedure_id)
        mach = db.get(Machine, proc.machine_id) if proc and proc.machine_id else None
        completed_count = sum(1 for s in r.step_executions if s.is_completed)
        total_count = len(proc.steps) if proc else 0
        run_items.append(
            {
                "run_id": r.id,
                "procedure_title": proc.title if proc else "Procedure",
                "machine_name": mach.name if mach else None,
                "status": r.status,
                "started_at": r.started_at,
                "completed_at": r.completed_at,
                "completed_steps": completed_count,
                "total_steps": total_count,
            }
        )

    assignments = (
        db.query(LearningAssignment)
        .filter(LearningAssignment.user_id == user_id)
        .all()
    )
    assignment_items = []
    for a in assignments:
        path = db.get(LearningPath, a.path_id)
        assignment_items.append(
            {
                "assignment_id": a.id,
                "path_title": path.title if path else "Curriculum",
                "status": a.status,
                "progress_percentage": a.progress_percentage,
                "assigned_at": a.assigned_at,
                "completed_at": a.completed_at,
            }
        )

    return {
        "user_id": user_id,
        "name": auth_ctx.user.name,
        "role_id": auth_ctx.user.role_id,
        "procedure_runs": run_items,
        "assignments": assignment_items,
    }


@router.get("/notifications", response_model=List[NotificationResponse])
def list_notifications(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all notifications addressed to the authenticated user."""
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == auth_ctx.user.id)
        .order_by(desc(Notification.created_at))
        .all()
    )
    return [NotificationResponse.model_validate(n) for n in notifications]


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_200_OK)
def mark_notification_as_read(
    notification_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a user notification as read."""
    n = db.get(Notification, notification_id)
    if not n:
        raise NotFoundError(code="notification_not_found", message="Notification not found.")
    if n.user_id != auth_ctx.user.id:
        raise ForbiddenError(code="forbidden", message="You may only update your own notifications.")

    n.is_read = True
    db.commit()
    return {"status": "success", "id": notification_id}


@router.post("/notifications/mark-all-read", status_code=status.HTTP_200_OK)
def mark_all_notifications_as_read(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all pending notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == auth_ctx.user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"status": "success"}
