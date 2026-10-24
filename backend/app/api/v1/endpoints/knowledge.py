from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    get_current_user,
    require_permission,
    PERM_KNOWLEDGE_CREATE,
)
from app.db.session import get_db
from app.schemas.knowledge import (
    KnowledgeCreateRequest,
    KnowledgeItemDetailResponse,
    KnowledgeListResponse,
    KnowledgeListItemResponse,
    KnowledgeUpdateRequest,
    KnowledgeVersionResponse,
    KnowledgeVersionSummaryResponse,
    RevisionCreateRequest,
)
from app.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/knowledge", tags=["Knowledge Capture"])


@router.post(
    "",
    response_model=KnowledgeItemDetailResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(csrf_protect)],
    summary="Create a new knowledge item and draft version 1",
)
def create_knowledge(
    req: KnowledgeCreateRequest,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    item, version = KnowledgeService.create_knowledge(
        db=db,
        user=auth_ctx.user,
        payload=req,
        ip_address=client_ip,
    )
    return KnowledgeItemDetailResponse(
        id=item.id,
        title=item.title,
        machine_id=item.machine_id,
        author_id=item.author_id,
        current_published_version_id=item.current_published_version_id,
        is_demo=item.is_demo,
        created_at=item.created_at,
        updated_at=item.updated_at,
        version=KnowledgeVersionResponse.model_validate(version),
        machine=item.machine,
    )


@router.get(
    "",
    response_model=KnowledgeListResponse,
    summary="List accessible knowledge items with representative versions",
)
def list_knowledge(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    q: Optional[str] = Query(None, description="Search term for title"),
    machine_id: Optional[str] = Query(None, description="Filter by machine ID"),
    status: Optional[str] = Query(None, description="Filter by version status"),
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = KnowledgeService.list_knowledge(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        page=page,
        page_size=page_size,
        q=q,
        machine_id=machine_id,
        status=status,
    )
    return KnowledgeListResponse(
        items=[KnowledgeListItemResponse.model_validate(row) for row in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{id}",
    response_model=KnowledgeItemDetailResponse,
    summary="Retrieve knowledge item details and version content",
)
def get_knowledge(
    id: str,
    version_id: Optional[str] = Query(None, description="Specific version ID"),
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item, version = KnowledgeService.get_knowledge(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        item_id=id,
        version_id=version_id,
    )
    return KnowledgeItemDetailResponse(
        id=item.id,
        title=item.title,
        machine_id=item.machine_id,
        author_id=item.author_id,
        current_published_version_id=item.current_published_version_id,
        is_demo=item.is_demo,
        created_at=item.created_at,
        updated_at=item.updated_at,
        version=KnowledgeVersionResponse.model_validate(version),
        machine=item.machine,
    )


@router.patch(
    "/{id}",
    response_model=KnowledgeVersionResponse,
    dependencies=[Depends(csrf_protect)],
    summary="Update editable draft version and item metadata",
)
def update_knowledge(
    id: str,
    req: KnowledgeUpdateRequest,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    item, version = KnowledgeService.update_knowledge(
        db=db,
        user=auth_ctx.user,
        item_id=id,
        payload=req,
        version_id=req.version_id,
        ip_address=client_ip,
    )
    return KnowledgeVersionResponse.model_validate(version)


@router.post(
    "/{id}/versions",
    response_model=KnowledgeVersionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(csrf_protect)],
    summary="Create a new draft revision from the published version",
)
def create_revision(
    id: str,
    req: RevisionCreateRequest,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    item, new_version = KnowledgeService.create_revision(
        db=db,
        user=auth_ctx.user,
        item_id=id,
        payload=req,
        ip_address=client_ip,
    )
    return KnowledgeVersionResponse.model_validate(new_version)


@router.get(
    "/{id}/versions",
    response_model=List[KnowledgeVersionSummaryResponse],
    summary="List accessible revisions for a knowledge item",
)
def list_versions(
    id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    versions = KnowledgeService.list_versions(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        item_id=id,
    )
    return [KnowledgeVersionSummaryResponse.model_validate(v) for v in versions]
