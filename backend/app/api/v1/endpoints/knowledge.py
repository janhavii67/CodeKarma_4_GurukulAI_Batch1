from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from app.db.session import get_db
from app.core.permissions import (
    get_current_user,
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
)
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models import (
    KnowledgeArticle,
    KnowledgeRevision,
    KnowledgeVersion,
    Machine,
    User,
    ReviewRecord,
)
from app.schemas.knowledge import (
    KnowledgeListResponse,
    KnowledgeArticleListItem,
    KnowledgeArticleDetailResponse,
    KnowledgeArticleCreate,
    KnowledgeArticleUpdate,
    KnowledgeRevisionResponse,
    ReviewRecordResponse,
)

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


@router.get("", response_model=KnowledgeListResponse)
def list_knowledge(
    q: Optional[str] = None,
    category: Optional[str] = None,
    machine_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search and filter verified SOPs and technical knowledge articles."""
    query = (
        db.query(KnowledgeArticle, Machine.name.label("machine_name"), User.name.label("author_name"))
        .outerjoin(Machine, KnowledgeArticle.machine_id == Machine.id)
        .join(User, KnowledgeArticle.author_id == User.id)
    )

    # Permission check on visibility: non-experts only see APPROVED articles
    is_expert = any(p in auth_ctx.permissions for p in [PERM_KNOWLEDGE_CREATE, PERM_KNOWLEDGE_SUBMIT_REVIEW])
    if not is_expert:
        query = query.filter(KnowledgeArticle.status == "APPROVED")
    elif status_filter:
        query = query.filter(KnowledgeArticle.status == status_filter)

    if category:
        query = query.filter(KnowledgeArticle.category == category)
    if machine_id:
        query = query.filter(KnowledgeArticle.machine_id == machine_id)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                KnowledgeArticle.title.ilike(search),
                KnowledgeArticle.tags.ilike(search),
                KnowledgeArticle.category.ilike(search),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    results = query.order_by(desc(KnowledgeArticle.updated_at)).offset(offset).limit(page_size).all()

    is_trainee = auth_ctx.user.role_id == "TRAINEE"
    items = []
    for art, mach_name, auth_name in results:
        title = art.title
        m_id = art.machine_id
        m_name = mach_name
        if is_trainee and art.current_published_version_id and art.current_published_version:
            title = art.current_published_version.title
            m_id = art.current_published_version.machine_id
            m_name = art.current_published_version.machine.name if art.current_published_version.machine else mach_name

        items.append(
            KnowledgeArticleListItem(
                id=art.id,
                title=title,
                machine_id=m_id,
                machine_name=m_name,
                category=art.category,
                tags=art.tags,
                status=art.status,
                current_version=art.current_version,
                author_name=auth_name or "Expert",
                created_at=art.created_at,
                updated_at=art.updated_at,
            )
        )


    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
    return KnowledgeListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )



@router.get("/{article_id}", response_model=KnowledgeArticleDetailResponse)
def get_knowledge_detail(
    article_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve complete knowledge article with current revision, prerequisites, and peer reviews."""
    art = db.get(KnowledgeArticle, article_id)
    if not art:
        raise NotFoundError(code="knowledge_not_found", message=f"Knowledge article '{article_id}' not found.")

    # Only authors/experts can view non-approved drafts
    if art.status != "APPROVED":
        if art.author_id != auth_ctx.user.id and PERM_KNOWLEDGE_CREATE not in auth_ctx.permissions:
            raise ForbiddenError(code="unauthorized_draft_access", message="Only authors and reviewers may view unapproved drafts.")

    author = db.get(User, art.author_id)
    machine = db.get(Machine, art.machine_id) if art.machine_id else None

    # Get latest revision or published revision for display
    is_trainee = auth_ctx.user.role_id == "TRAINEE"
    
    # Trainees view the current published version snapshot
    if is_trainee and art.current_published_version_id:
        active_rev = db.get(KnowledgeVersion, art.current_published_version_id)
    else:
        active_rev = (
            db.query(KnowledgeVersion)
            .filter(KnowledgeVersion.item_id == art.id)
            .order_by(desc(KnowledgeVersion.version_no))
            .first()
        )

    rev_resp = None
    if active_rev:
        rev_resp = KnowledgeRevisionResponse(
            id=active_rev.id,
            version=active_rev.version_no,
            title=active_rev.title,
            content=active_rev.content or active_rev.summary or "",
            operating_conditions=active_rev.operating_conditions,
            prerequisites=active_rev.prerequisites,
            safety_warnings=active_rev.safety_warnings,
            common_mistakes=active_rev.common_mistakes,
            corrective_actions=active_rev.corrective_actions,
            author_id=active_rev.created_by,
            changelog=active_rev.revision_reason,
            created_at=active_rev.created_at,
        )

    # For Trainee, display title & machine from published version snapshot
    display_title = active_rev.title if (is_trainee and active_rev) else art.title
    display_machine_id = active_rev.machine_id if (is_trainee and active_rev) else art.machine_id
    display_machine = db.get(Machine, display_machine_id) if display_machine_id else None

    # Get review history
    reviews_query = (
        db.query(ReviewRecord, User.name.label("reviewer_name"))
        .join(User, ReviewRecord.reviewer_id == User.id)
        .filter(ReviewRecord.item_id == art.id)
        .order_by(desc(ReviewRecord.created_at))
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

    return KnowledgeArticleDetailResponse(
        id=art.id,
        title=display_title,
        machine_id=display_machine_id,
        machine_name=display_machine.name if display_machine else None,
        category=art.category,
        tags=art.tags,
        status=art.status,
        current_version=art.current_version,
        author_id=art.author_id,
        author_name=author.name if author else "Expert",
        created_at=art.created_at,
        updated_at=art.updated_at,
        current_revision=rev_resp,
        reviews=review_resps,
    )


@router.post("", response_model=KnowledgeArticleDetailResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_article(
    payload: KnowledgeArticleCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    """Author a new tribal knowledge article draft."""
    if payload.machine_id:
        mach = db.get(Machine, payload.machine_id)
        if not mach:
            raise NotFoundError(code="machine_not_found", message=f"Associated machine '{payload.machine_id}' does not exist.")

    # Creating writes title and machine_id to both item mirror and v1 version
    article = KnowledgeArticle(
        title=payload.title,
        machine_id=payload.machine_id,
        category=payload.category,
        tags=payload.tags,
        status="DRAFT",
        current_version=1,
        author_id=auth_ctx.user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)

    revision = KnowledgeVersion(
        item_id=article.id,
        article_id=article.id,
        version_no=1,
        version=1,
        title=payload.title,
        machine_id=payload.machine_id,
        status="draft",
        origin="expert",
        summary=payload.content,
        content=payload.content,
        steps=payload.content,
        operating_conditions=payload.operating_conditions,
        prerequisites=payload.prerequisites,
        safety_warnings=payload.safety_warnings,
        common_mistakes=payload.common_mistakes,
        corrective_actions=payload.corrective_actions,
        created_by=auth_ctx.user.id,
        author_id=auth_ctx.user.id,
        revision_reason="Initial author draft created.",
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)

    return get_knowledge_detail(article.id, auth_ctx, db)


@router.put("/{article_id}", response_model=KnowledgeArticleDetailResponse)
@router.patch("/{article_id}", response_model=KnowledgeArticleDetailResponse)
def update_knowledge_draft(
    article_id: str,
    payload: KnowledgeArticleUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_EDIT_OWN_DRAFT)),
    db: Session = Depends(get_db),
):
    """
    Edit own draft version before submission or after rejection.
    Snapshot design: Writes title and machine_id to the editable VERSION, NOT the item mirror.
    Item mirror only updates at item creation and publish time.
    """
    article = db.get(KnowledgeArticle, article_id)
    if not article:
        raise NotFoundError(code="knowledge_not_found", message=f"Article '{article_id}' was not found.")

    if article.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="not_author", message="You may only modify your own knowledge drafts.")

    # Find the caller's editable version
    editable_version = (
        db.query(KnowledgeVersion)
        .filter(
            KnowledgeVersion.item_id == article.id,
            KnowledgeVersion.status.in_(["draft", "changes_requested"]),
        )
        .order_by(desc(KnowledgeVersion.version_no))
        .first()
    )

    if not editable_version:
        raise ForbiddenError(
            code="cannot_edit_approved",
            message="No editable draft version found for this article. Create a new revision instead.",
        )

    # Category and tags are item-level taxonomy
    if payload.category is not None:
        article.category = payload.category
    if payload.tags is not None:
        article.tags = payload.tags

    # Title, machine, and content are version-level snapshots
    if payload.title is not None:
        editable_version.title = payload.title
    if payload.machine_id is not None:
        editable_version.machine_id = payload.machine_id
    if payload.content is not None:
        editable_version.content = payload.content
        editable_version.summary = payload.content
    if payload.operating_conditions is not None:
        editable_version.operating_conditions = payload.operating_conditions
    if payload.prerequisites is not None:
        editable_version.prerequisites = payload.prerequisites
    if payload.safety_warnings is not None:
        editable_version.safety_warnings = payload.safety_warnings
    if payload.common_mistakes is not None:
        editable_version.common_mistakes = payload.common_mistakes
    if payload.corrective_actions is not None:
        editable_version.corrective_actions = payload.corrective_actions
    if payload.changelog is not None:
        editable_version.revision_reason = payload.changelog

    db.commit()
    return get_knowledge_detail(article.id, auth_ctx, db)



@router.post("/{article_id}/submit", response_model=KnowledgeArticleDetailResponse)
def submit_knowledge_for_review(
    article_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_SUBMIT_REVIEW)),
    db: Session = Depends(get_db),
):
    """Submit author's draft to the peer review queue."""
    article = db.get(KnowledgeArticle, article_id)
    if not article:
        raise NotFoundError(code="knowledge_not_found", message=f"Article '{article_id}' not found.")

    if article.author_id != auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(code="not_author", message="Only the author can submit this draft for review.")

    if article.status == "PENDING_REVIEW":
        return get_knowledge_detail(article.id, auth_ctx, db)

    article.status = "PENDING_REVIEW"
    db.commit()
    return get_knowledge_detail(article.id, auth_ctx, db)
