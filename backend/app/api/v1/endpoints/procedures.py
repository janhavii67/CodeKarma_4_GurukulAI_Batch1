from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.base import utc_now
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_PROCEDURE_EXECUTE,
)
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep, Machine
from app.schemas.procedure import (
    ProcedureResponse,
    ProcedureStepResponse,
    ProcedureRunResponse,
    ProcedureRunStepResponse,
    StepCompletionRequest,
)

router = APIRouter(prefix="/procedures", tags=["Procedures"])


@router.get("", response_model=List[ProcedureResponse])
def list_procedures(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List approved standard operating procedures."""
    query = db.query(Procedure).filter(Procedure.status == "APPROVED")
    if machine_id:
        query = query.filter(Procedure.machine_id == machine_id)
    procedures = query.order_by(Procedure.title).all()

    res = []
    for p in procedures:
        mach = db.get(Machine, p.machine_id) if p.machine_id else None
        steps = [
            ProcedureStepResponse(
                id=s.id,
                step_order=s.step_order,
                title=s.title,
                instruction=s.instruction,
                expected_observation=s.expected_observation,
                safety_warning=s.safety_warning,
                is_critical=s.is_critical,
            )
            for s in p.steps
        ]
        res.append(
            ProcedureResponse(
                id=p.id,
                title=p.title,
                description=p.description,
                machine_id=p.machine_id,
                machine_name=mach.name if mach else None,
                author_id=p.author_id,
                status=p.status,
                version=p.version,
                prerequisites=p.prerequisites,
                required_tools=p.required_tools,
                safety_warnings=p.safety_warnings,
                steps=steps,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return res


@router.get("/{procedure_id}", response_model=ProcedureResponse)
def get_procedure(
    procedure_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve full procedure with ordered checklist steps and safety alerts."""
    p = db.get(Procedure, procedure_id)
    if not p:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")

    mach = db.get(Machine, p.machine_id) if p.machine_id else None
    steps = [
        ProcedureStepResponse(
            id=s.id,
            step_order=s.step_order,
            title=s.title,
            instruction=s.instruction,
            expected_observation=s.expected_observation,
            safety_warning=s.safety_warning,
            is_critical=s.is_critical,
        )
        for s in p.steps
    ]
    return ProcedureResponse(
        id=p.id,
        title=p.title,
        description=p.description,
        machine_id=p.machine_id,
        machine_name=mach.name if mach else None,
        author_id=p.author_id,
        status=p.status,
        version=p.version,
        prerequisites=p.prerequisites,
        required_tools=p.required_tools,
        safety_warnings=p.safety_warnings,
        steps=steps,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("/{procedure_id}/start", response_model=ProcedureRunResponse, status_code=status.HTTP_201_CREATED)
def start_procedure_run(
    procedure_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    """Initialize a guided execution run for a procedure."""
    p = db.get(Procedure, procedure_id)
    if not p:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")

    run = ProcedureRun(
        procedure_id=p.id,
        operator_id=auth_ctx.user.id,
        status="IN_PROGRESS",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Initialize run steps
    for step in p.steps:
        rs = ProcedureRunStep(
            run_id=run.id,
            step_id=step.id,
            is_completed=False,
        )
        db.add(rs)
    db.commit()

    return get_run_status(run.id, auth_ctx, db)


@router.get("/runs/{run_id}", response_model=ProcedureRunResponse)
def get_run_status(
    run_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch status and completion checklist of an active run."""
    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="run_not_found", message=f"Procedure run '{run_id}' not found.")

    if run.operator_id != auth_ctx.user.id and auth_ctx.user.role_id not in ["ADMIN", "EXPERT"]:
        raise ForbiddenError(code="unauthorized_run", message="You may only view your own procedure runs.")

    step_executions = [
        ProcedureRunStepResponse(
            id=s.id,
            step_id=s.step_id,
            is_completed=s.is_completed,
            operator_notes=s.operator_notes,
            verified_at=s.verified_at,
        )
        for s in run.step_executions
    ]

    return ProcedureRunResponse(
        id=run.id,
        procedure_id=run.procedure_id,
        operator_id=run.operator_id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        step_executions=step_executions,
    )


@router.get("/runs/my/all", response_model=List[ProcedureRunResponse])
def list_my_runs(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all procedure execution runs belonging to the current caller."""
    runs = (
        db.query(ProcedureRun)
        .filter(ProcedureRun.operator_id == auth_ctx.user.id)
        .order_by(ProcedureRun.started_at.desc())
        .all()
    )
    results = []
    for run in runs:
        step_executions = [
            ProcedureRunStepResponse(
                id=s.id,
                step_id=s.step_id,
                is_completed=s.is_completed,
                operator_notes=s.operator_notes,
                verified_at=s.verified_at,
            )
            for s in run.step_executions
        ]
        results.append(
            ProcedureRunResponse(
                id=run.id,
                procedure_id=run.procedure_id,
                operator_id=run.operator_id,
                status=run.status,
                started_at=run.started_at,
                completed_at=run.completed_at,
                step_executions=step_executions,
            )
        )
    return results


@router.post("/runs/{run_id}/step/{step_id}", response_model=ProcedureRunResponse)
def complete_run_step(
    run_id: str,
    step_id: str,
    payload: StepCompletionRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    """Mark a verification checkpoint or step as completed by the operator."""
    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="run_not_found", message=f"Procedure run '{run_id}' not found.")

    if run.operator_id != auth_ctx.user.id:
        raise ForbiddenError(code="unauthorized_run", message="You may only execute your own active procedure runs.")

    run_step = (
        db.query(ProcedureRunStep)
        .filter(ProcedureRunStep.run_id == run.id, ProcedureRunStep.step_id == step_id)
        .first()
    )
    if not run_step:
        raise NotFoundError(code="step_not_found", message="Step execution record not found.")

    run_step.is_completed = payload.is_completed
    run_step.operator_notes = payload.operator_notes
    run_step.verified_at = utc_now() if payload.is_completed else None

    # Check if all steps completed
    all_done = all(
        s.is_completed if s.id != run_step.id else payload.is_completed
        for s in run.step_executions
    )
    if all_done:
        run.status = "COMPLETED"
        run.completed_at = utc_now()

    db.commit()
    return get_run_status(run.id, auth_ctx, db)
