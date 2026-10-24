from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from app.core.exceptions import ConflictError
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    get_current_user,
    require_permission,
    PERM_MACHINE_MANAGE,
)
from app.db.session import get_db
from app.repositories.machine_repository import MachineRepository
from app.schemas.machine import MachineCreate, MachineListResponse, MachineResponse
from app.services.audit_service import AuditService

router = APIRouter(prefix="/machines", tags=["Machines"])


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
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = MachineRepository.list_machines(
        db=db,
        page=page,
        page_size=page_size,
        q=q,
        category=category,
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
    existing = MachineRepository.get_by_code(db, req.code)
    if existing:
        raise ConflictError(
            code="already_exists",
            message=f"A machine with code '{req.code}' already exists.",
        )

    machine = MachineRepository.create_machine(
        db=db,
        name=req.name,
        code=req.code,
        category=req.category,
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
