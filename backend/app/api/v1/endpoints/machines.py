from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_MACHINE_MANAGE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
)
from app.core.exceptions import NotFoundError
from app.models import Machine, MachineCategory, Tool
from app.schemas.machine import MachineResponse, MachineCreate, MachineCategoryResponse, ToolResponse

router = APIRouter(prefix="/machines", tags=["Machines"])


@router.get("/categories", response_model=List[MachineCategoryResponse])
def list_categories(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all machine categories."""
    return db.query(MachineCategory).order_by(MachineCategory.name).all()


@router.get("", response_model=List[MachineResponse])
def list_machines(
    category_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all registered manufacturing machines."""
    query = db.query(Machine)
    if category_id:
        query = query.filter(Machine.category_id == category_id)
    machines = query.order_by(Machine.name).all()

    response = []
    for m in machines:
        cat_name = m.category.name if m.category else None
        tools = [
            ToolResponse(
                id=t.id,
                name=t.name,
                tool_number=t.tool_number,
                description=t.description,
                specifications=t.specifications,
            )
            for t in m.tools
        ]
        response.append(
            MachineResponse(
                id=m.id,
                name=m.name,
                model_number=m.model_number,
                serial_number=m.serial_number,
                manufacturer=m.manufacturer,
                category_id=m.category_id,
                category_name=cat_name,
                location=m.location,
                status=m.status,
                specifications=m.specifications,
                tools=tools,
                created_at=m.created_at,
                updated_at=m.updated_at,
            )
        )
    return response


@router.get("/{machine_id}", response_model=MachineResponse)
def get_machine(
    machine_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get machine details by ID."""
    m = db.get(Machine, machine_id)
    if not m:
        raise NotFoundError(code="machine_not_found", message=f"Machine '{machine_id}' was not found.")

    cat_name = m.category.name if m.category else None
    tools = [
        ToolResponse(
            id=t.id,
            name=t.name,
            tool_number=t.tool_number,
            description=t.description,
            specifications=t.specifications,
        )
        for t in m.tools
    ]
    return MachineResponse(
        id=m.id,
        name=m.name,
        model_number=m.model_number,
        serial_number=m.serial_number,
        manufacturer=m.manufacturer,
        category_id=m.category_id,
        category_name=cat_name,
        location=m.location,
        status=m.status,
        specifications=m.specifications,
        tools=tools,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
def create_machine(
    payload: MachineCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    """Register a new machine asset in the catalog."""
    cat = db.get(MachineCategory, payload.category_id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{payload.category_id}' does not exist.",
        )

    machine = Machine(
        name=payload.name,
        model_number=payload.model_number,
        serial_number=payload.serial_number,
        manufacturer=payload.manufacturer,
        category_id=payload.category_id,
        location=payload.location,
        status=payload.status,
        specifications=payload.specifications,
    )
    db.add(machine)
    db.commit()
    db.refresh(machine)

    return MachineResponse(
        id=machine.id,
        name=machine.name,
        model_number=machine.model_number,
        serial_number=machine.serial_number,
        manufacturer=machine.manufacturer,
        category_id=machine.category_id,
        category_name=cat.name,
        location=machine.location,
        status=machine.status,
        specifications=machine.specifications,
        tools=[],
        created_at=machine.created_at,
        updated_at=machine.updated_at,
    )
