from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import MetaData, Table, func, inspect as sa_inspect, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.exceptions import ConflictError, NotFoundError
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    get_current_user,
    require_permission,
    require_any_permission,
    PERM_MACHINE_MANAGE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
)
from app.db.session import get_db
from app.models.machine import Machine, MachineCategory, Tool
from app.repositories.machine_repository import MachineRepository
from app.schemas.machine import (
    MachineCreate,
    MachineListResponse,
    MachineResponse,
    MachineCategoryResponse,
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/machines", tags=["Machines"])


_MACHINE_REFERENCE_LABELS = {
    "audio_analysis_jobs": "audio analysis records",
    "audio_references": "audio references",
    "chat_conversations": "assistant conversations",
    "knowledge_chunks": "knowledge search chunks",
    "knowledge_embeddings": "knowledge search entries",
    "knowledge_items": "knowledge records",
    "knowledge_versions": "knowledge versions",
    "learning_assignments": "learning assignments",
    "learning_items": "learning items",
    "learning_paths": "learning paths",
    "media_assets": "uploaded knowledge assets",
    "procedure_runs": "guided workflow runs",
    "procedures": "procedures",
    "simulation_attempts": "simulation attempts",
    "simulation_scenarios": "simulation scenarios",
    "tools": "assigned tools",
    "troubleshooting_cases": "troubleshooting cases",
    "troubleshooting_escalations": "troubleshooting escalations",
    "troubleshooting_guides": "troubleshooting guides",
    "troubleshooting_nodes": "troubleshooting steps",
    "troubleshooting_sessions": "troubleshooting sessions",
}


def _machine_reference_counts(db: Session, machine_id: str) -> dict[str, int]:
    """Count database-level foreign-key dependents without modifying records."""
    bind = db.get_bind()
    inspector = sa_inspect(bind)
    references_by_table: dict[str, set[str]] = {}

    # Inspect the live schema rather than only imported ORM models. Older or
    # plugin-owned tables must also prevent a machine delete, including when
    # their foreign key would otherwise cascade on delete.
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") != Machine.__tablename__:
                continue
            constrained = foreign_key.get("constrained_columns") or []
            referred = foreign_key.get("referred_columns") or []
            for local_column, remote_column in zip(constrained, referred):
                if remote_column == "id":
                    references_by_table.setdefault(table_name, set()).add(local_column)

    counts: dict[str, int] = {}
    for table_name, columns in references_by_table.items():
        table = Table(table_name, MetaData(), autoload_with=bind)
        predicate = or_(*(table.c[column] == machine_id for column in sorted(columns)))
        count = db.execute(
            select(func.count()).select_from(table).where(predicate)
        ).scalar_one()
        if count:
            counts[table_name] = int(count)

    return counts


@router.get("/categories", response_model=List[MachineCategoryResponse])
def list_categories(
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_VIEW_PUBLISHED, PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    """List all machine categories."""
    return db.query(MachineCategory).order_by(MachineCategory.name).all()


@router.get(
    "",
    response_model=MachineListResponse,
    summary="List industrial machines",
)
def list_machines(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    q: Optional[str] = Query(None, description="Search term for name or code"),
    category: Optional[str] = Query(None, description="Filter by category"),
    category_id: Optional[str] = Query(None, description="Filter by category id"),
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_VIEW_PUBLISHED, PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    cat_filter = category or category_id
    items, total = MachineRepository.list_machines(
        db=db,
        page=page,
        page_size=page_size,
        q=q,
        category=cat_filter,
    )
    return MachineListResponse(
        items=[MachineResponse.model_validate(m) for m in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "",
    response_model=MachineResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(csrf_protect)],
    summary="Register a new machine asset",
)
def create_machine(
    req: MachineCreate,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    machine_code = req.code or req.model_number or f"MACH-{req.name[:4].upper()}"
    existing = MachineRepository.get_by_code(db, machine_code)
    if existing:
        raise ConflictError(
            code="already_exists",
            message=f"A machine with code '{machine_code}' already exists.",
        )

    cat_name = req.category or req.category_id or "General"
    machine = MachineRepository.create_machine(
        db=db,
        name=req.name,
        code=machine_code,
        category=cat_name,
        is_demo=req.is_demo,
        commit=True,
    )

    client_ip = request.client.host if request.client else None
    AuditService.log(
        db=db,
        action="machine.create",
        entity_type="machine",
        entity_id=machine.id,
        actor_id=auth_ctx.user.id,
        detail={"name": machine.name, "code": machine.code, "category": machine.category},
        ip_address=client_ip,
        commit=True,
    )

    return MachineResponse.model_validate(machine)


@router.get(
    "/{machine_id}",
    response_model=MachineResponse,
    summary="Get machine detail by ID",
)
def get_machine(
    machine_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_VIEW_PUBLISHED, PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    machine = MachineRepository.get_by_id(db, machine_id)
    if not machine:
        raise NotFoundError(code="machine_not_found", message=f"Machine {machine_id} was not found.")
    return MachineResponse.model_validate(machine)


@router.delete(
    "/{machine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(csrf_protect)],
    summary="Delete an unused machine asset",
)
def delete_machine(
    machine_id: str,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
) -> None:
    machine = MachineRepository.get_by_id(db, machine_id)
    if not machine:
        raise NotFoundError(code="machine_not_found", message="The selected machine was not found.")

    references = _machine_reference_counts(db, machine.id)
    if references:
        summary = ", ".join(
            f"{count} {_MACHINE_REFERENCE_LABELS.get(table, table.replace('_', ' '))}"
            for table, count in sorted(references.items())
        )
        raise ConflictError(
            code="machine_in_use",
            message=(
                f"Machine '{machine.name}' cannot be deleted because it is referenced by {summary}. "
                "Reassign or archive those records first. No related records were changed."
            ),
            details={"references": references},
        )

    deleted_name = machine.name
    deleted_code = machine.code
    db.delete(machine)
    AuditService.log(
        db=db,
        action="machine.delete",
        entity_type="machine",
        entity_id=machine.id,
        actor_id=auth_ctx.user.id,
        detail={"name": deleted_name, "code": deleted_code},
        ip_address=request.client.host if request.client else None,
        commit=False,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            code="machine_in_use",
            message="The machine has dependent records and was not deleted. No related records were changed.",
        ) from exc
