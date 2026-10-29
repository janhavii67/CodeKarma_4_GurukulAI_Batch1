from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import MetaData, Table, func, inspect as sa_inspect, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
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
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.repositories.machine_repository import MachineRepository
from app.schemas.machine import (
    MachineCreate,
    MachineListResponse,
    MachineResponse,
    MachineCategoryResponse,
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/machines", tags=["Machines"])


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


def _detach_machine_references(db: Session, machine_id: str) -> dict[str, int]:
    """Unlink nullable machine references while preserving their owning records."""
    bind = db.get_bind()
    inspector = sa_inspect(bind)
    references: dict[str, set[str]] = {}
    required_references: dict[str, set[str]] = {}

    for table_name in inspector.get_table_names():
        columns_by_name = {column["name"]: column for column in inspector.get_columns(table_name)}
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") != Machine.__tablename__:
                continue
            constrained = foreign_key.get("constrained_columns") or []
            referred = foreign_key.get("referred_columns") or []
            for local_column, remote_column in zip(constrained, referred):
                if remote_column != "id":
                    continue
                column = columns_by_name.get(local_column, {})
                if not column.get("nullable", True):
                    required_references.setdefault(table_name, set()).add(local_column)
                else:
                    references.setdefault(table_name, set()).add(local_column)

    non_nullable: list[str] = []
    for table_name, columns in required_references.items():
        table = Table(table_name, MetaData(), autoload_with=bind)
        for column_name in sorted(columns):
            count = db.execute(
                select(func.count())
                .select_from(table)
                .where(table.c[column_name] == machine_id)
            ).scalar_one()
            if count:
                non_nullable.append(f"{table_name}.{column_name}")

    if non_nullable:
        raise ConflictError(
            code="machine_in_use",
            message=(
                "This machine is referenced by records that require a machine assignment, "
                "so it cannot be safely deleted. No related records were changed."
            ),
            details={"required_references": sorted(non_nullable)},
        )

    detached_counts: dict[str, int] = {}
    for table_name, columns in references.items():
        table = Table(table_name, MetaData(), autoload_with=bind)
        for column_name in sorted(columns):
            result = db.execute(
                update(table)
                .where(table.c[column_name] == machine_id)
                .values({column_name: None})
            )
            if result.rowcount:
                detached_counts[table_name] = detached_counts.get(table_name, 0) + result.rowcount
    return detached_counts


@router.get("/categories", response_model=List[MachineCategoryResponse])
def list_categories(
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_VIEW_PUBLISHED, PERM_MACHINE_MANAGE)),
    db: Session = Depends(get_db),
):
    """List all machine categories."""
    return db.query(MachineCategory).filter(MachineCategory.is_active.is_(True)).order_by(MachineCategory.name).all()


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
    machine_code = (req.code or req.model_number or f"MACH-{req.name[:4].upper()}").strip()
    existing = db.query(Machine).filter(func.lower(Machine.code) == machine_code.casefold()).first()
    if existing:
        raise ConflictError(
            code="already_exists",
            message=f"A machine with code '{machine_code}' already exists.",
        )

    category_value = (req.category or "").strip()
    category_id = (req.category_id or "").strip() or None
    category = None
    if category_id:
        category = db.get(MachineCategory, category_id)
        if not category or not category.is_active:
            raise ValidationError(
                code="invalid_machine_category",
                message="Select an active medical equipment category.",
            )
        if category_value and category_value not in {category.id, category.name}:
            raise ValidationError(
                code="invalid_machine_category",
                message="The selected equipment category does not match its registered category ID.",
            )
    elif category_value:
        category = db.query(MachineCategory).filter(
            or_(MachineCategory.id == category_value, func.lower(MachineCategory.name) == category_value.casefold())
        ).first()
        if category and not category.is_active:
            raise ValidationError(
                code="invalid_machine_category",
                message="Select an active medical equipment category.",
            )

    if not category and not category_value:
        category = db.query(MachineCategory).filter(MachineCategory.id == "other-medical-equipment").first()
    category_name = category.name if category else category_value or "Other Medical Equipment"
    category_id = category.id if category else None
    machine = MachineRepository.create_machine(
        db=db,
        name=req.name,
        code=machine_code,
        category=category_name,
        category_id=category_id,
        model_number=req.model_number or machine_code,
        serial_number=req.serial_number,
        manufacturer=req.manufacturer,
        location=req.location,
        status=req.status,
        is_active=req.is_active,
        specifications=req.specifications,
        is_demo=req.is_demo,
        commit=False,
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
        commit=False,
    )

    try:
        db.commit()
        db.refresh(machine)
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            code="registration_conflict",
            message="The equipment could not be registered because its identifier conflicts with an existing record.",
        ) from exc

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
    summary="Delete a machine, hide linked knowledge, and preserve its content",
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
    linked_items = (
        db.query(KnowledgeItem)
        .outerjoin(KnowledgeVersion, KnowledgeVersion.item_id == KnowledgeItem.id)
        .filter(
            or_(
                KnowledgeItem.machine_id == machine.id,
                KnowledgeVersion.machine_id == machine.id,
            )
        )
        .distinct()
        .all()
    )
    for item in linked_items:
        item.is_archived = True
    archived_knowledge_items = len(linked_items)
    db.flush()
    detached = _detach_machine_references(db, machine.id)
    deleted_name = machine.name
    deleted_code = machine.code
    db.delete(machine)
    AuditService.log(
        db=db,
        action="machine.delete",
        entity_type="machine",
        entity_id=machine.id,
        actor_id=auth_ctx.user.id,
        detail={
            "name": deleted_name,
            "code": deleted_code,
            "detached_references": detached,
            "original_reference_counts": references,
            "archived_knowledge_items": archived_knowledge_items,
        },
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
