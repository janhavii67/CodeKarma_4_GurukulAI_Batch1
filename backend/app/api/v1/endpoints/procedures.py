from typing import List, Optional
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.base import utc_now
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_PROCEDURE_EXECUTE,
    PERM_PROCEDURE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
    csrf_protect,
)
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError
from app.models import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep, Machine, MediaAsset
from app.schemas.procedure import (
    ProcedureResponse,
    ProcedureStepResponse,
    ProcedureRunResponse,
    ProcedureRunStepResponse,
    StepCompletionRequest,
)
from app.services.media_service import MediaService

router = APIRouter(prefix="/procedures", tags=["Procedures"])


class ProcedureAssetsUpdate(BaseModel):
    asset_ids: List[str]


class ProcedureStepInput(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    instruction: str = Field(min_length=1)
    expected_observation: Optional[str] = None
    safety_warning: Optional[str] = None
    is_critical: bool = False


class ProcedureCreatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str = Field(min_length=1)
    machine_id: str
    prerequisites: Optional[str] = None
    required_tools: Optional[str] = None
    safety_warnings: Optional[str] = None
    steps: List[ProcedureStepInput] = Field(min_length=1)
    asset_ids: List[str] = []


@router.post("", response_model=ProcedureResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_procedure(payload: ProcedureCreatePayload,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_CREATE)), db: Session = Depends(get_db)):
    if not db.get(Machine, payload.machine_id):
        raise NotFoundError(code="machine_not_found", message="The selected machine was not found.")
    ids = set(payload.asset_ids)
    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(ids)).all() if ids else []
    if len(assets) != len(ids):
        raise NotFoundError(code="asset_not_found", message="One or more selected knowledge assets were not found.")
    if any(asset.machine_id != payload.machine_id for asset in assets):
        raise ForbiddenError(code="machine_mismatch", message="A procedure can only reference assets from its selected machine.")
    for asset in assets:
        MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
    procedure = Procedure(title=payload.title, description=payload.description, machine_id=payload.machine_id,
        author_id=auth_ctx.user.id, status="DRAFT", prerequisites=payload.prerequisites,
        required_tools=payload.required_tools, safety_warnings=payload.safety_warnings)
    procedure.media_assets = assets
    procedure.steps = [ProcedureStep(step_order=i, title=s.title, instruction=s.instruction,
        expected_observation=s.expected_observation, safety_warning=s.safety_warning, is_critical=s.is_critical)
        for i, s in enumerate(payload.steps, 1)]
    db.add(procedure); db.commit(); db.refresh(procedure)
    return get_procedure(procedure.id, auth_ctx, db)


@router.get("/{procedure_id}/assets")
def list_procedure_assets(procedure_id: str, auth_ctx: AuthenticatedContext = Depends(get_current_user), db: Session = Depends(get_db)):
    procedure = db.get(Procedure, procedure_id)
    if not procedure:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")
    if procedure.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN" and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="forbidden", message="You may only view references on your own procedures or procedures assigned for review.")
    for asset in procedure.media_assets:
        MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
    return [{"id": a.id, "title": a.title, "kind": a.kind, "machine_id": a.machine_id,
        "url": f"/api/v1/media/{a.id}"} for a in procedure.media_assets]


@router.put("/{procedure_id}/assets", dependencies=[Depends(csrf_protect)])
def set_procedure_assets(procedure_id: str, payload: ProcedureAssetsUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_CREATE)), db: Session = Depends(get_db)):
    procedure = db.get(Procedure, procedure_id)
    if not procedure:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")
    if procedure.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="forbidden", message="You may only edit references on your own procedures.")
    if procedure.status != "DRAFT":
        raise ConflictError(code="procedure_not_draft", message="Only draft procedures can change their knowledge references.")
    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(set(payload.asset_ids))).all() if payload.asset_ids else []
    if len(assets) != len(set(payload.asset_ids)):
        raise NotFoundError(code="asset_not_found", message="One or more selected knowledge assets were not found.")
    if any(a.machine_id != procedure.machine_id for a in assets):
        raise ForbiddenError(code="machine_mismatch", message="A procedure can only reference assets from its own machine.")
    for asset in assets:
        MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
    procedure.media_assets = assets
    db.commit()
    return {"procedure_id": procedure.id, "asset_ids": [a.id for a in assets]}


@router.get("/mine/drafts", response_model=List[ProcedureResponse])
def list_my_procedure_drafts(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_CREATE)),
    db: Session = Depends(get_db),
):
    procedures = (db.query(Procedure)
        .filter(Procedure.author_id == auth_ctx.user.id, Procedure.status == "DRAFT")
        .order_by(Procedure.updated_at.desc()).all())
    return [get_procedure(procedure.id, auth_ctx, db) for procedure in procedures]


@router.delete("/{procedure_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(csrf_protect)])
def delete_procedure(
    procedure_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_CREATE)),
    db: Session = Depends(get_db),
):
    procedure = db.get(Procedure, procedure_id)
    if not procedure:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")
    if procedure.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="forbidden", message="You may only delete your own machine procedures.")
    if procedure.status != "DRAFT":
        raise ConflictError(code="procedure_not_draft", message="Only draft procedures can be deleted. Published or archived procedures must follow the review and archive workflow.")
    if db.query(ProcedureRun.id).filter(ProcedureRun.procedure_id == procedure.id).first():
        raise ConflictError(code="procedure_in_use", message="This procedure has execution history and cannot be deleted.")
    db.delete(procedure)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
