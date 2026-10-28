from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
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
    KnowledgeVersionComparisonResponse,
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

    if version:
        if item.category == "GUIDED_WORKFLOW":
            source_refs = version.source_refs or []
            if not source_refs:
                raise ValidationError(code="workflow_sources_required", message="A guided workflow must retain its approved source references before review.")
            for source_ref in source_refs:
                source_version_id = source_ref.get("version_id") if isinstance(source_ref, dict) else None
                if not source_version_id:
                    continue
                source_version = db.get(KnowledgeVersion, source_version_id)
                if not source_version or source_version.status != "published":
                    raise ValidationError(code="workflow_source_unavailable", message="A referenced source is no longer published. Refresh the workflow from current approved knowledge before submitting.")
        from app.services.voice_service import validate_version_for_submission
        validate_version_for_submission(db, version.id)

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
    "/{id}/compare",
    response_model=KnowledgeVersionComparisonResponse,
    summary="Compare two visible knowledge version snapshots",
)
def compare_versions(
    id: str,
    base_version: int = Query(..., ge=1),
    target_version: int = Query(..., ge=1),
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base, target, changed_fields = KnowledgeService.compare_versions(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        item_id=id,
        base_version_no=base_version,
        target_version_no=target_version,
    )
    return KnowledgeVersionComparisonResponse(
        base=KnowledgeVersionResponse.model_validate(base),
        target=KnowledgeVersionResponse.model_validate(target),
        changed_fields=changed_fields,
    )


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

    # Check RAG index status
    rag_indexed = False
    rag_chunks_count = 0
    target_vid = item.current_published_version_id or (version.id if version and version.status == "published" else None)
    if target_vid:
        from app.modules.assistant.models import KnowledgeSource
        src = db.query(KnowledgeSource).filter(KnowledgeSource.knowledge_version_id == target_vid).first()
        if src and src.status == "published":
            rag_indexed = True
            rag_chunks_count = len([c for c in src.chunks if c.is_active])

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
        rag_indexed=rag_indexed,
        rag_chunks_count=rag_chunks_count,
    )
    return resp


class BatchIndexRequest(BaseModel):
    version_id: Optional[str] = None
    item_id: Optional[str] = None
    sync_all: bool = False


@router.post(
    "/index",
    dependencies=[Depends(csrf_protect)],
    summary="Batch index knowledge versions into the RAG Assistant knowledge base",
)
def batch_index_knowledge(
    req: BatchIndexRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    from app.modules.assistant.services.indexing_service import IndexingService

    if req.version_id:
        source = IndexingService.index_knowledge_version(req.version_id, db, user_id=auth_ctx.user.id)
        return {
            "status": "success",
            "indexed_count": 1,
            "chunks_count": len(source.chunks),
            "sources": [{"version_id": req.version_id, "source_id": source.id}],
        }

    if req.item_id:
        item = db.get(KnowledgeItem, req.item_id)
        if not item or not item.current_published_version_id:
            raise NotFoundError(code="published_version_not_found", message=f"No published version found for item '{req.item_id}'.")
        source = IndexingService.index_knowledge_version(item.current_published_version_id, db, user_id=auth_ctx.user.id)
        return {
            "status": "success",
            "indexed_count": 1,
            "chunks_count": len(source.chunks),
            "sources": [{"version_id": item.current_published_version_id, "source_id": source.id}],
        }

    if req.sync_all:
        pub_versions = db.query(KnowledgeVersion).filter(KnowledgeVersion.status == "published").all()
        total_chunks = 0
        sources = []
        for pv in pub_versions:
            src = IndexingService.index_knowledge_version(pv.id, db, user_id=auth_ctx.user.id)
            total_chunks += len(src.chunks)
            sources.append({"version_id": pv.id, "source_id": src.id})
        return {
            "status": "success",
            "indexed_count": len(pub_versions),
            "chunks_count": total_chunks,
            "sources": sources,
        }

    raise ValidationError(code="invalid_request", message="Must provide version_id, item_id, or sync_all=True.")


@router.post(
    "/{id}/index",
    dependencies=[Depends(csrf_protect)],
    summary="Index or re-index a published knowledge article into the RAG Assistant knowledge base",
)
def index_knowledge_item(
    id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    item = db.get(KnowledgeItem, id)
    if not item:
        raise NotFoundError(code="knowledge_not_found", message=f"Knowledge item '{id}' not found.")

    if not item.current_published_version_id:
        raise ValidationError(
            code="no_published_version",
            message="Only approved, published knowledge articles can be indexed for the AI Assistant.",
        )

    from app.modules.assistant.services.indexing_service import IndexingService
    source = IndexingService.index_knowledge_version(item.current_published_version_id, db, user_id=auth_ctx.user.id)
    return {
        "status": "success",
        "message": "Successfully indexed article into AI knowledge base.",
        "item_id": item.id,
        "source_id": source.id,
        "version_id": item.current_published_version_id,
        "chunks_count": len(source.chunks),
    }
