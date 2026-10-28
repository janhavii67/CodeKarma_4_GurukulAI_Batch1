from typing import List, Optional
from fastapi import APIRouter, Depends, Response, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db.session import get_db
from app.db.base import utc_now
from app.core.exceptions import ValidationError
from app.core.permissions import (
    get_current_user,
    require_permission,
    require_any_permission,
    AuthenticatedContext,
    PERM_PROCEDURE_EXECUTE,
    PERM_KNOWLEDGE_CREATE,
    PERM_PROCEDURE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
    csrf_protect,
)
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError
from app.models import Procedure, ProcedureStep, ProcedureRun, ProcedureRunStep, Machine, MediaAsset
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.schemas.procedure import (
    ProcedureResponse,
    ProcedureStepResponse,
    ProcedureRunResponse,
    ProcedureRunStepResponse,
    StepCompletionRequest,
    WorkflowStepNavigationRequest,
    WorkflowIssueRequest,
    WorkflowSourceResponse,
    WorkflowDraftResponse,
    WorkflowIssueResult,
)
from app.services.media_service import MediaService

router = APIRouter(prefix="/procedures", tags=["Procedures"])


def _procedure_snapshot(db: Session, procedure: Procedure) -> ProcedureResponse:
    machine = db.get(Machine, procedure.machine_id) if procedure.machine_id else None
    return ProcedureResponse(
        id=procedure.id,
        title=procedure.title,
        description=procedure.description,
        machine_id=procedure.machine_id,
        machine_name=machine.name if machine else None,
        machine_model=machine.model_number if machine else None,
        author_id=procedure.author_id,
        status=procedure.status,
        version=procedure.version,
        prerequisites=procedure.prerequisites,
        required_tools=procedure.required_tools,
        safety_warnings=procedure.safety_warnings,
        operating_conditions=procedure.operating_conditions,
        operation=procedure.operation,
        troubleshooting_guidance=procedure.troubleshooting_guidance,
        knowledge_version_id=procedure.knowledge_version_id,
        source_refs=procedure.source_refs or [],
        steps=[ProcedureStepResponse(
            id=step.id,
            step_order=step.step_order,
            title=step.title,
            instruction=step.instruction,
            expected_observation=step.expected_observation,
            safety_warning=step.safety_warning,
            is_critical=step.is_critical,
            details=step.details or {},
        ) for step in procedure.steps],
        created_at=procedure.created_at,
        updated_at=procedure.updated_at,
    )


@router.get("/sources", response_model=List[WorkflowSourceResponse])
def list_workflow_sources(
    q: Optional[str] = Query(None, max_length=100),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """Find published, step-based knowledge that can seed a workflow draft."""
    query = (
        db.query(KnowledgeVersion, KnowledgeItem)
        .join(KnowledgeItem, KnowledgeItem.id == KnowledgeVersion.item_id)
        .filter(KnowledgeVersion.status == "published")
        .order_by(KnowledgeVersion.updated_at.desc())
    )
    if q and q.strip():
        query = query.filter(or_(KnowledgeVersion.title.ilike(f"%{q.strip()}%"), KnowledgeItem.title.ilike(f"%{q.strip()}%"), KnowledgeVersion.summary.ilike(f"%{q.strip()}%")))
    items = []
    for version, item in query.limit(100).all():
        steps = version.steps if isinstance(version.steps, list) else []
        count = sum(1 for step in steps if isinstance(step, dict) and (step.get("instruction") or step.get("text")))
        if not count:
            continue
        machine = db.get(Machine, version.machine_id or item.machine_id) if (version.machine_id or item.machine_id) else None
        items.append(WorkflowSourceResponse(
            version_id=version.id,
            item_id=item.id,
            version_no=version.version_no,
            title=version.title or item.title,
            summary=version.summary,
            machine_id=version.machine_id or item.machine_id,
            machine_name=machine.name if machine else None,
            steps_count=count,
        ))
    return items


@router.post("/drafts/from-knowledge/{source_version_id}", response_model=WorkflowDraftResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_workflow_draft(
    source_version_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """Start an editable workflow draft by copying an approved source revision."""
    from app.services.procedure_service import create_workflow_draft_from_published_source
    item, version = create_workflow_draft_from_published_source(db, source_version_id, auth_ctx.user.id)
    from app.services.audit_service import AuditService
    AuditService.log(db, "workflow.draft_created", "knowledge_version", version.id, auth_ctx.user.id,
                     {"source_refs": version.source_refs}, commit=True)
    return WorkflowDraftResponse(item_id=item.id, version_id=version.id, title=version.title or item.title,
                                 status=version.status, source_refs=version.source_refs or [])
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
    asset_ids: List[str] = Field(default_factory=list)


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
    return _procedure_snapshot(db, procedure)


@router.get("/{procedure_id}/assets")
def list_procedure_assets(procedure_id: str, auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_PROCEDURE_CREATE, PERM_PROCEDURE_EXECUTE, PERM_KNOWLEDGE_APPROVE)), db: Session = Depends(get_db)):
    procedure = db.get(Procedure, procedure_id)
    if not procedure:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")
    if procedure.author_id != auth_ctx.user.id and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        from app.services.procedure_service import is_workflow_currently_published
        if PERM_PROCEDURE_EXECUTE not in auth_ctx.permissions or not is_workflow_currently_published(db, procedure):
            raise ForbiddenError(code="forbidden", message="You may only view references on a published procedure, your own draft, or a procedure assigned for review.")
    for asset in procedure.media_assets:
        MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
    return [{
        "id": a.id,
        "title": a.title,
        "kind": a.kind,
        "machine_id": a.machine_id,
        "url": f"/api/v1/media/{a.id}",
        "mime": a.mime,
        # A media file is verified only when it belongs to an approved/published
        # knowledge version. Standalone uploads remain pending review.
        "verification_status": a.version.status if a.version else "pending_review",
    } for a in procedure.media_assets]


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
    return [_procedure_snapshot(db, procedure) for procedure in procedures]


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
    q: Optional[str] = Query(None, max_length=100),
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    """List approved standard operating procedures."""
    query = db.query(Procedure).outerjoin(KnowledgeVersion, Procedure.knowledge_version_id == KnowledgeVersion.id).filter(
        Procedure.status == "APPROVED",
        or_(Procedure.knowledge_version_id.is_(None), KnowledgeVersion.status == "published"),
    )
    if machine_id:
        query = query.filter(Procedure.machine_id == machine_id)
    if q and q.strip():
        query = query.filter(or_(Procedure.title.ilike(f"%{q.strip()}%"), Procedure.description.ilike(f"%{q.strip()}%"), Procedure.operation.ilike(f"%{q.strip()}%")))
    procedures = query.order_by(Procedure.title).all()
    from app.services.procedure_service import is_workflow_currently_published
    procedures = [procedure for procedure in procedures if is_workflow_currently_published(db, procedure)]
    return [_procedure_snapshot(db, procedure) for procedure in procedures]


@router.get("/{procedure_id}", response_model=ProcedureResponse)
def get_procedure(
    procedure_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    """Retrieve full procedure with ordered checklist steps and safety alerts."""
    p = db.get(Procedure, procedure_id)
    if not p:
        raise NotFoundError(code="procedure_not_found", message=f"Procedure '{procedure_id}' not found.")

    from app.services.procedure_service import is_workflow_currently_published
    if not is_workflow_currently_published(db, p):
        raise NotFoundError(code="workflow_not_found", message="This workflow is not currently published.")

    return _procedure_snapshot(db, p)


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
    from app.services.procedure_service import is_workflow_currently_published, start_or_resume_workflow_run
    if not is_workflow_currently_published(db, p):
        raise NotFoundError(code="workflow_not_found", message="This workflow is not currently published.")
    run, _resumed = start_or_resume_workflow_run(db, p, auth_ctx.user.id)
    return get_run_status(run.id, auth_ctx, db)


@router.get("/runs/{run_id}", response_model=ProcedureRunResponse)
def get_run_status(
    run_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_PROCEDURE_EXECUTE, PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    """Fetch status and completion checklist of an active run."""
    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="run_not_found", message=f"Procedure run '{run_id}' not found.")

    if run.operator_id != auth_ctx.user.id and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
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
        current_step_order=run.current_step_order or 1,
        issues=run.issues or [],
        workflow=_procedure_snapshot(db, run.procedure),
        step_executions=step_executions,
    )


@router.get("/runs/my/all", response_model=List[ProcedureRunResponse])
def list_my_runs(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
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
                current_step_order=run.current_step_order or 1,
                issues=run.issues or [],
                workflow=_procedure_snapshot(db, run.procedure),
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
    if run.status != "IN_PROGRESS":
        raise ValidationError(code="run_not_active", message="This workflow session is no longer active.")

    run_step = (
        db.query(ProcedureRunStep)
        .filter(ProcedureRunStep.run_id == run.id, ProcedureRunStep.step_id == step_id)
        .first()
    )
    if not run_step:
        raise NotFoundError(code="step_not_found", message="Step execution record not found.")
    procedure_step = db.get(ProcedureStep, run_step.step_id)
    if procedure_step and procedure_step.step_order != run.current_step_order:
        raise ValidationError(code="step_not_current", message="Navigate to this step before recording its completion.")

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
    from app.services.audit_service import AuditService
    AuditService.log(db, "workflow.step_recorded", "procedure_run", run.id, auth_ctx.user.id,
                     {"step_id": step_id, "is_completed": payload.is_completed}, commit=True)
    return get_run_status(run.id, auth_ctx, db)


@router.patch("/runs/{run_id}/current-step", response_model=ProcedureRunResponse)
def navigate_workflow_step(
    run_id: str,
    payload: WorkflowStepNavigationRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    from app.services.procedure_service import advance_workflow_step
    run = advance_workflow_step(db, run_id, auth_ctx.user.id, payload.step_order)
    from app.services.audit_service import AuditService
    AuditService.log(db, "workflow.step_navigated", "procedure_run", run.id, auth_ctx.user.id,
                     {"step_order": payload.step_order}, commit=True)
    return get_run_status(run.id, auth_ctx, db)


@router.post("/runs/{run_id}/issues", response_model=WorkflowIssueResult, status_code=status.HTTP_201_CREATED)
def report_workflow_issue(
    run_id: str,
    payload: WorkflowIssueRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_PROCEDURE_EXECUTE)),
    db: Session = Depends(get_db),
):
    from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService
    from app.services.audit_service import AuditService

    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="run_not_found", message="Workflow session was not found.")
    if run.operator_id != auth_ctx.user.id:
        raise ForbiddenError(code="unauthorized_run", message="You may only report issues on your own workflow sessions.")
    if run.status != "IN_PROGRESS":
        raise ValidationError(code="run_not_active", message="Issues can only be reported on an active workflow session.")
    run_step = db.query(ProcedureRunStep).filter(ProcedureRunStep.run_id == run.id, ProcedureRunStep.step_id == payload.step_id).first()
    if not run_step:
        raise NotFoundError(code="step_not_found", message="Step does not belong to this workflow session.")
    current_step = db.get(ProcedureStep, payload.step_id)
    if not current_step or current_step.step_order != run.current_step_order:
        raise ValidationError(code="step_not_current", message="Navigate to the relevant step before reporting a problem.")

    issue = {
        "id": __import__("uuid").uuid4().hex,
        "step_id": payload.step_id,
        "step_order": current_step.step_order,
        "description": payload.description.strip(),
        "created_at": utc_now().isoformat(),
    }
    run.issues = [*(run.issues or []), issue]
    db.commit()

    machine_id = run.procedure.machine_id
    query_text = f"{run.procedure.title} {current_step.title} {payload.description.strip()}"
    try:
        matches = RetrievalService.retrieve_chunks(
            RetrievalQuery(query=query_text, user_id=auth_ctx.user.id, machine_id=machine_id, top_k=4, min_score=0.05),
            db,
        )
        guidance = [{
            "title": match.title,
            "text": match.text,
            "version_id": match.knowledge_version_id,
            "item_id": db.get(KnowledgeVersion, match.knowledge_version_id).item_id if match.knowledge_version_id and db.get(KnowledgeVersion, match.knowledge_version_id) else None,
            "source_id": match.source_id,
            "score": match.score,
        } for match in matches]
    except Exception:
        guidance = []

    AuditService.log(db, "workflow.issue_reported", "procedure_run", run.id, auth_ctx.user.id,
                     {"issue_id": issue["id"], "step_id": payload.step_id, "guidance_sources": [g["source_id"] for g in guidance]}, commit=True)
    return WorkflowIssueResult(issue=issue, guidance=guidance,
                               guidance_status="matched_published_knowledge" if guidance else "no_approved_guidance_found")
