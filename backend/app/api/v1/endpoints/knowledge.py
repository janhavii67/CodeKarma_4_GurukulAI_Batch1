from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.exceptions import NotFoundError, ForbiddenError
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    get_current_user,
    require_permission,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
)
from app.db.session import get_db
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    ApprovalRecord,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_PUBLISHED,
)
from app.models.user import User
from app.schemas.knowledge import (
    KnowledgeCreateRequest,
    KnowledgeItemDetailResponse,
    KnowledgeListResponse,
    KnowledgeListItemResponse,
    KnowledgeUpdateRequest,
    KnowledgeVersionResponse,
    KnowledgeVersionSummaryResponse,
    RevisionCreateRequest,
    ReviewRecordResponse,
    KnowledgeRevisionResponse,
)
from app.services.knowledge_service import KnowledgeService
from app.services.audit_service import AuditService

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
    # Also copy extra fields if supplied (category, tags, content)
    if req.category:
        item.category = req.category
    if req.tags:
        item.tags = req.tags
    if req.content:
        version.content = req.content
        if not version.summary:
            version.summary = req.content
    if req.operating_conditions:
        version.operating_conditions = req.operating_conditions
    if req.safety_warnings:
        version.safety_warnings = req.safety_warnings
    db.commit()
    db.refresh(item)
    db.refresh(version)

    return _build_detail_response(db, item, version)


@router.get(
    "",
    response_model=KnowledgeListResponse,
    summary="List accessible knowledge items with representative versions",
)
def list_knowledge(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    q: Optional[str] = Query(None, description="Search term for title"),
    category: Optional[str] = Query(None, description="Filter by category"),
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
    return _build_detail_response(db, item, version)


get_knowledge_detail = get_knowledge


@router.put(
    "/{id}",
    response_model=KnowledgeItemDetailResponse,
    dependencies=[Depends(csrf_protect)],
    summary="Update editable draft version and item metadata",
)
@router.patch(
    "/{id}",
    response_model=KnowledgeItemDetailResponse,
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
    if req.category:
        item.category = req.category
    if req.tags:
        item.tags = req.tags
    if req.content:
        version.content = req.content
    if req.operating_conditions:
        version.operating_conditions = req.operating_conditions
    if req.safety_warnings:
        version.safety_warnings = req.safety_warnings
    db.commit()
    db.refresh(item)
    db.refresh(version)

    return _build_detail_response(db, item, version)


@router.post(
    "/{id}/submit",
    response_model=KnowledgeItemDetailResponse,
    dependencies=[Depends(csrf_protect)],
    summary="Submit draft knowledge item for review",
)
def submit_knowledge(
    id: str,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_SUBMIT_REVIEW)),
    db: Session = Depends(get_db),
):
    item = db.get(KnowledgeItem, id)
    if not item:
        raise NotFoundError(code="knowledge_not_found", message=f"Knowledge item {id} not found.")

    if item.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="not_author", message="Only the author can submit this draft for review.")

    # Find the active open draft version
    version = (
        db.query(KnowledgeVersion)
        .filter(KnowledgeVersion.item_id == id, KnowledgeVersion.status.in_(["draft", "changes_requested"]))
        .order_by(desc(KnowledgeVersion.version_no))
        .first()
    )
    if not version:
        version = (
            db.query(KnowledgeVersion)
            .filter(KnowledgeVersion.item_id == id)
            .order_by(desc(KnowledgeVersion.version_no))
            .first()
        )

    if version and version.status != STATUS_IN_REVIEW:
        version.status = STATUS_IN_REVIEW
        item.status = "PENDING_REVIEW"
        db.commit()
        db.refresh(item)
        db.refresh(version)

    client_ip = request.client.host if request.client else None
    AuditService.log(
        db=db,
        action="knowledge.submit_review",
        entity_type="knowledge_item",
        entity_id=item.id,
        actor_id=auth_ctx.user.id,
        detail={"version_no": version.version_no if version else 1},
        ip_address=client_ip,
        commit=True,
    )

    return _build_detail_response(db, item, version)


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


@router.get(
    "/{id}/versions/{version_no}",
    response_model=KnowledgeVersionResponse,
    summary="Get specific version by version number",
)
def get_version_by_number(
    id: str,
    version_no: int,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    version = KnowledgeService.get_version_by_number(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        item_id=id,
        version_no=version_no,
    )
    return KnowledgeVersionResponse.model_validate(version)


def _build_detail_response(db: Session, item: KnowledgeItem, version: Optional[KnowledgeVersion]) -> KnowledgeItemDetailResponse:
    rev_resp = None
    if version:
        rev_resp = KnowledgeRevisionResponse(
            id=version.id,
            version=version.version_no,
            title=version.title or item.title,
            content=version.content or version.summary or "",
            operating_conditions=version.operating_conditions,
            prerequisites=version.prerequisites,
            safety_warnings=version.safety_warnings,
            common_mistakes=version.common_mistakes,
            corrective_actions=version.corrective_actions,
            author_id=version.created_by,
            changelog=version.revision_reason,
            created_at=version.created_at,
        )

    reviews_query = (
        db.query(ApprovalRecord, User.name.label("reviewer_name"))
        .join(User, ApprovalRecord.reviewer_id == User.id)
        .filter(ApprovalRecord.item_id == item.id)
        .order_by(desc(ApprovalRecord.created_at))
        .all()
    )
    review_resps = [
        ReviewRecordResponse(
            id=r.id,
            reviewer_id=r.reviewer_id,
            reviewer_name=r_name,
            status=r.decision,
            comments=r.comment,
            created_at=r.created_at,
        )
        for r, r_name in reviews_query
    ]

    status_str = "APPROVED" if (version and version.status == "published") or item.status == "APPROVED" else ("PENDING_REVIEW" if (version and version.status == "in_review") or item.status == "PENDING_REVIEW" else "DRAFT")

    item_title = item.title if item else ""
    ver_title = (version.title if (version and version.title) else item_title) or item_title
    ver_machine_id = (version.machine_id if (version and version.machine_id) else (item.machine_id if item else None))

    resp = KnowledgeItemDetailResponse(
        id=item.id,
        title=ver_title,
        machine_id=ver_machine_id,
        category=getattr(item, "category", "GENERAL") or "GENERAL",
        tags=getattr(item, "tags", None),
        current_version=getattr(item, "current_version", 1) or 1,
        author_id=item.author_id,
        current_published_version_id=item.current_published_version_id,
        is_demo=item.is_demo,
        created_at=item.created_at,
        updated_at=item.updated_at,
        version=KnowledgeVersionResponse.model_validate(version) if version else None,
        summary=version.summary if version else None,
        steps=version.steps if version else [],
        machine=item.machine,
        status=status_str,
        current_revision=rev_resp,
        reviews=review_resps,
    )
    return resp

