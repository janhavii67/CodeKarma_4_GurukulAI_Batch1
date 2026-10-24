from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
)
from app.core.permissions import (
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
)
from app.db.base import utc_now
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    OPEN_DRAFT_STATUSES,
    EDITABLE_STATUSES,
    STATUS_DRAFT,
    STATUS_IN_REVIEW,
    STATUS_PUBLISHED,
    ORIGIN_EXPERT,
)
from app.models.machine import Machine
from app.models.user import User
from app.repositories.knowledge_repository import KnowledgeRepository
from app.repositories.machine_repository import MachineRepository
from app.schemas.knowledge import (
    KnowledgeCreateRequest,
    KnowledgeUpdateRequest,
    RevisionCreateRequest,
    Step,
)
from app.services.audit_service import AuditService


class KnowledgeService:
    @staticmethod
    def _can_view_version(
        user: User,
        permissions: List[str],
        version: KnowledgeVersion,
        item: Optional[KnowledgeItem] = None,
    ) -> bool:
        """Determines if the authenticated user has rights to view this specific version."""
        # 1. Published version that is currently live is visible to all authenticated users
        if (
            version.status == STATUS_PUBLISHED
            and item is not None
            and item.current_published_version_id == version.id
        ):
            return True

        # 2. Version author/creator can view all of their own versions
        if version.created_by == user.id:
            return True

        # 3. Reviewers (knowledge.approve) can view in_review versions
        if version.status == STATUS_IN_REVIEW and PERM_KNOWLEDGE_APPROVE in permissions:
            return True

        # Non-owners cannot see drafts, rejected, approved, superseded, withdrawn, etc.
        return False

    @classmethod
    def can_view_version(
        cls,
        user: User,
        permissions: List[str],
        version: KnowledgeVersion,
        item: Optional[KnowledgeItem] = None,
    ) -> bool:
        """Determines if the authenticated user has rights to view this specific version."""
        target_item = item if item is not None else getattr(version, "item", None)
        return cls._can_view_version(user, permissions, version, target_item)


    @classmethod
    def ensure_can_view_version(
        cls,
        user: User,
        permissions: List[str],
        version: KnowledgeVersion,
        item: Optional[KnowledgeItem] = None,
    ) -> None:
        """Raises NotFoundError if the caller is not authorized to view the version."""
        is_trainee = PERM_KNOWLEDGE_CREATE not in permissions
        target_item = item if item is not None else getattr(version, "item", None)

        if is_trainee:
            if (
                not target_item
                or version.status != STATUS_PUBLISHED
                or target_item.current_published_version_id != version.id
            ):
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge version was not found.",
                )

        if not cls.can_view_version(user, permissions, version, target_item):
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge version was not found.",
            )

    @classmethod
    def ensure_can_edit_version(
        cls,
        user: User,
        permissions: List[str],
        version: KnowledgeVersion,
    ) -> None:
        """Enforces that caller has create permission, owns the draft, and version is editable."""
        if PERM_KNOWLEDGE_CREATE not in permissions:
            raise ForbiddenError(
                code="forbidden",
                message="Access denied: missing permission 'knowledge.create'.",
            )
        if version.created_by != user.id:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge version was not found.",
            )
        if version.status not in EDITABLE_STATUSES:
            raise InvalidStateError(
                code="frozen_version",
                message=f"Version {version.version_no} is in status '{version.status}' and cannot be edited. Edits are only allowed in 'draft' or 'changes_requested'.",
            )


    @classmethod
    def create_knowledge(
        cls,
        db: Session,
        user: User,
        payload: KnowledgeCreateRequest,
        ip_address: Optional[str] = None,
    ) -> Tuple[KnowledgeItem, KnowledgeVersion]:
        # Validate machine exists if provided
        if payload.machine_id:
            machine = MachineRepository.get_by_id(db, payload.machine_id)
            if not machine:
                raise ValidationError(
                    code="validation_error",
                    message=f"Machine with id '{payload.machine_id}' does not exist.",
                )

        summary_val = payload.summary or payload.description
        desc_val = payload.description

        try:
            item, version = KnowledgeRepository.create_item_and_version_1(
                db=db,
                title=payload.title,
                author_id=user.id,
                machine_id=payload.machine_id,
                summary=summary_val,
                description=desc_val,
                is_demo=False,
                commit=False,
            )

            AuditService.log(
                db=db,
                action="knowledge.create",
                entity_type="knowledge_item",
                entity_id=item.id,
                actor_id=user.id,
                detail={
                    "version_id": version.id,
                    "version_no": 1,
                    "title": item.title,
                    "machine_id": item.machine_id,
                },
                ip_address=ip_address,
                commit=False,
            )

            db.commit()
            db.refresh(item)
            db.refresh(version)
            return item, version
        except IntegrityError:
            db.rollback()
            raise ConflictError(
                code="conflict",
                message="A conflict occurred while creating the knowledge item.",
            )
        except Exception:
            db.rollback()
            raise

    @classmethod
    def get_knowledge(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        item_id: str,
        version_id: Optional[str] = None,
    ) -> Tuple[KnowledgeItem, KnowledgeVersion]:
        item = KnowledgeRepository.get_item_by_id(db, item_id)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        is_trainee = PERM_KNOWLEDGE_CREATE not in permissions

        if version_id:
            version = KnowledgeRepository.get_version_by_id(db, version_id)
            if not version or version.item_id != item.id:
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge version was not found.",
                )

            # Trainees can ONLY see the published version
            if is_trainee:
                if (
                    version.status != STATUS_PUBLISHED
                    or item.current_published_version_id != version.id
                ):
                    raise NotFoundError(
                        code="not_found",
                        message="The requested knowledge version was not found.",
                    )

            if not cls._can_view_version(user, permissions, version, item):
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge version was not found.",
                )

            return item, version

        # No version_id specified -> pick appropriate version
        if is_trainee:
            if not item.current_published_version_id:
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge item was not found.",
                )
            version = KnowledgeRepository.get_version_by_id(
                db, item.current_published_version_id
            )
            if not version or version.status != STATUS_PUBLISHED:
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge item was not found.",
                )
            return item, version

        # For experts: preference order:
        # 1. Caller's own open version (draft or changes_requested)
        # 2. Caller's latest created version
        # 3. Item's current published version
        # 4. in_review version if caller has knowledge.approve
        open_version = db.execute(
            select(KnowledgeVersion)
            .where(
                KnowledgeVersion.item_id == item.id,
                KnowledgeVersion.created_by == user.id,
                KnowledgeVersion.status.in_(OPEN_DRAFT_STATUSES),
            )
            .order_by(KnowledgeVersion.version_no.desc())
        ).scalars().first()

        if open_version:
            return item, open_version

        user_latest = db.execute(
            select(KnowledgeVersion)
            .where(
                KnowledgeVersion.item_id == item.id,
                KnowledgeVersion.created_by == user.id,
            )
            .order_by(KnowledgeVersion.version_no.desc())
        ).scalars().first()

        if user_latest:
            return item, user_latest

        if item.current_published_version_id:
            pub_version = KnowledgeRepository.get_version_by_id(
                db, item.current_published_version_id
            )
            if pub_version and pub_version.status == STATUS_PUBLISHED:
                return item, pub_version

        if PERM_KNOWLEDGE_APPROVE in permissions:
            in_review_ver = db.execute(
                select(KnowledgeVersion)
                .where(
                    KnowledgeVersion.item_id == item.id,
                    KnowledgeVersion.status == STATUS_IN_REVIEW,
                )
                .order_by(KnowledgeVersion.version_no.desc())
            ).scalars().first()
            if in_review_ver:
                return item, in_review_ver

        raise NotFoundError(
            code="not_found",
            message="The requested knowledge item was not found.",
        )

    @classmethod
    def update_knowledge(
        cls,
        db: Session,
        user: User,
        item_id: str,
        payload: KnowledgeUpdateRequest,
        version_id: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Tuple[KnowledgeItem, KnowledgeVersion]:
        item = KnowledgeRepository.get_item_by_id(db, item_id)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        target_version_id = payload.version_id or version_id
        if target_version_id:
            version = KnowledgeRepository.get_version_by_id(db, target_version_id)
            if not version or version.item_id != item.id:
                raise NotFoundError(
                    code="not_found",
                    message="The requested knowledge version was not found.",
                )
        else:
            # Default to caller's open version on this item
            version = db.execute(
                select(KnowledgeVersion)
                .where(
                    KnowledgeVersion.item_id == item.id,
                    KnowledgeVersion.created_by == user.id,
                    KnowledgeVersion.status.in_(EDITABLE_STATUSES),
                )
                .order_by(KnowledgeVersion.version_no.desc())
            ).scalars().first()

            if not version:
                # Check if caller has a frozen version to return 409 rather than 404
                frozen_version = db.execute(
                    select(KnowledgeVersion)
                    .where(
                        KnowledgeVersion.item_id == item.id,
                        KnowledgeVersion.created_by == user.id,
                    )
                    .order_by(KnowledgeVersion.version_no.desc())
                ).scalars().first()

                if frozen_version:
                    raise InvalidStateError(
                        code="frozen_version",
                        message=f"Version {frozen_version.version_no} is frozen (status: {frozen_version.status}) and cannot be edited.",
                    )

                raise NotFoundError(
                    code="not_found",
                    message="No editable draft found for this knowledge item.",
                )

        # Ownership check: only the author of the version may edit it
        if version.created_by != user.id:
            # 404 for non-owners to prevent leaking private draft existence
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge version was not found.",
            )

        # Frozen check
        if version.status not in EDITABLE_STATUSES:
            raise InvalidStateError(
                code="frozen_version",
                message=f"Version {version.version_no} is in status '{version.status}' and cannot be edited. Edits are only allowed in 'draft' or 'changes_requested'.",
            )

        changed_fields = []

        # Validate and apply machine_id update
        if payload.machine_id is not None:
            if payload.machine_id:
                machine = MachineRepository.get_by_id(db, payload.machine_id)
                if not machine:
                    raise ValidationError(
                        code="validation_error",
                        message=f"Machine with id '{payload.machine_id}' does not exist.",
                    )
            item.machine_id = payload.machine_id
            changed_fields.append("machine_id")

        if payload.title is not None:
            item.title = payload.title.strip()
            changed_fields.append("title")

        if payload.summary is not None:
            version.summary = payload.summary.strip() if payload.summary else None
            changed_fields.append("summary")

        if payload.description is not None:
            version.description = payload.description.strip() if payload.description else None
            changed_fields.append("description")

        if payload.revision_reason is not None:
            version.revision_reason = payload.revision_reason.strip() if payload.revision_reason else None
            changed_fields.append("revision_reason")

        if payload.steps is not None:
            # Normalize step orders to 1..n based on array index
            normalized_steps = []
            for idx, step_model in enumerate(payload.steps, start=1):
                s_dict = step_model.model_dump()
                s_dict["order"] = idx
                normalized_steps.append(s_dict)
            version.steps = normalized_steps
            changed_fields.append("steps")

        now = utc_now()
        version.updated_at = now
        item.updated_at = now

        AuditService.log(
            db=db,
            action="knowledge.update",
            entity_type="knowledge_version",
            entity_id=version.id,
            actor_id=user.id,
            detail={
                "item_id": item.id,
                "version_no": version.version_no,
                "changed_fields": changed_fields,
            },
            ip_address=ip_address,
            commit=False,
        )

        db.commit()
        db.refresh(item)
        db.refresh(version)
        return item, version

    @classmethod
    def create_revision(
        cls,
        db: Session,
        user: User,
        item_id: str,
        payload: RevisionCreateRequest,
        ip_address: Optional[str] = None,
    ) -> Tuple[KnowledgeItem, KnowledgeVersion]:
        # Lock item row to guarantee concurrency safety
        item = KnowledgeRepository.get_item_by_id(db, item_id, for_update=True)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        # Must have a current published version
        if not item.current_published_version_id:
            raise ConflictError(
                code="no_published_version",
                message="Cannot create a new revision because this knowledge item has no published version.",
            )

        pub_version = KnowledgeRepository.get_version_by_id(
            db, item.current_published_version_id
        )
        if not pub_version or pub_version.status != STATUS_PUBLISHED:
            raise ConflictError(
                code="no_published_version",
                message="The current published version could not be resolved.",
            )

        # Check for open drafts
        open_version = KnowledgeRepository.get_open_version_for_item(db, item_id)
        if open_version:
            raise ConflictError(
                code="open_draft_exists",
                message=f"An open version (version {open_version.version_no}, status '{open_version.status}') already exists for this item.",
            )

        # Compute next version number
        max_no = KnowledgeRepository.get_max_version_no(db, item_id)
        next_version_no = max_no + 1

        try:
            new_version = KnowledgeRepository.create_revision_version(
                db=db,
                item_id=item.id,
                from_version=pub_version,
                created_by=user.id,
                revision_reason=payload.revision_reason,
                next_version_no=next_version_no,
                commit=False,
            )

            AuditService.log(
                db=db,
                action="knowledge.new_revision",
                entity_type="knowledge_version",
                entity_id=new_version.id,
                actor_id=user.id,
                detail={
                    "item_id": item.id,
                    "version_no": next_version_no,
                    "from_version_no": pub_version.version_no,
                    "revision_reason": payload.revision_reason,
                },
                ip_address=ip_address,
                commit=False,
            )

            db.commit()
            db.refresh(new_version)
            return item, new_version
        except IntegrityError:
            db.rollback()
            raise ConflictError(
                code="conflict",
                message="A conflict occurred while creating the revision. An open draft or duplicate version number may already exist.",
            )
        except Exception:
            db.rollback()
            raise

    @classmethod
    def list_versions(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        item_id: str,
    ) -> List[KnowledgeVersion]:
        item = KnowledgeRepository.get_item_by_id(db, item_id)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        all_versions = KnowledgeRepository.list_versions_for_item(db, item_id)
        visible_versions = [
            v for v in all_versions if cls._can_view_version(user, permissions, v, item)
        ]

        if not visible_versions:
            # Trainees or foreign experts requesting an item with zero visible versions get 404
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        return visible_versions

    @classmethod
    def list_knowledge(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        page: int = 1,
        page_size: int = 20,
        q: Optional[str] = None,
        machine_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        # Clamp page_size
        page_size = max(1, min(100, page_size))
        page = max(1, page)

        is_trainee = PERM_KNOWLEDGE_CREATE not in permissions

        # Fetch candidate items
        stmt = select(KnowledgeItem)

        if machine_id:
            stmt = stmt.where(KnowledgeItem.machine_id == machine_id)

        if q:
            escaped_q = q.strip().replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(KnowledgeItem.title.ilike(f"%{escaped_q}%"))

        if is_trainee:
            # Trainees strictly see items with a published live version
            stmt = stmt.where(KnowledgeItem.current_published_version_id.is_not(None))

        stmt = stmt.order_by(KnowledgeItem.updated_at.desc())
        all_candidate_items = list(db.execute(stmt).scalars().all())

        # Resolve representative version and filter visibility
        visible_rows = []
        for it in all_candidate_items:
            # Find representative version
            rep_version = None
            if is_trainee:
                if it.current_published_version_id:
                    v = KnowledgeRepository.get_version_by_id(
                        db, it.current_published_version_id
                    )
                    if v and v.status == STATUS_PUBLISHED:
                        rep_version = v
            else:
                # Expert / Reviewer:
                # Caller's latest created version
                user_ver = db.execute(
                    select(KnowledgeVersion)
                    .where(
                        KnowledgeVersion.item_id == it.id,
                        KnowledgeVersion.created_by == user.id,
                    )
                    .order_by(KnowledgeVersion.version_no.desc())
                ).scalars().first()

                if user_ver:
                    rep_version = user_ver
                elif it.current_published_version_id:
                    v = KnowledgeRepository.get_version_by_id(
                        db, it.current_published_version_id
                    )
                    if v and v.status == STATUS_PUBLISHED:
                        rep_version = v
                elif PERM_KNOWLEDGE_APPROVE in permissions:
                    rev_ver = db.execute(
                        select(KnowledgeVersion)
                        .where(
                            KnowledgeVersion.item_id == it.id,
                            KnowledgeVersion.status == STATUS_IN_REVIEW,
                        )
                        .order_by(KnowledgeVersion.version_no.desc())
                    ).scalars().first()
                    if rev_ver:
                        rep_version = rev_ver

            if not rep_version:
                continue

            # Apply status filter on the representative version
            if status and rep_version.status != status:
                continue

            visible_rows.append(
                {
                    "id": it.id,
                    "title": it.title,
                    "machine_id": it.machine_id,
                    "author_id": it.author_id,
                    "current_published_version_id": it.current_published_version_id,
                    "is_demo": it.is_demo,
                    "created_at": it.created_at,
                    "updated_at": it.updated_at,
                    "version_id": rep_version.id,
                    "version_no": rep_version.version_no,
                    "version_status": rep_version.status,
                    "version_summary": rep_version.summary,
                    "version_updated_at": rep_version.updated_at,
                    "machine": it.machine,
                }
            )

        total = len(visible_rows)
        offset = (page - 1) * page_size
        paged_items = visible_rows[offset : offset + page_size]

        return paged_items, total

    @staticmethod
    def validate_for_submission(
        version: KnowledgeVersion,
        item_title: Optional[str] = None,
    ) -> List[str]:
        """Validates version readiness for peer review submission without performing transitions."""
        problems = []

        if item_title is not None and not item_title.strip():
            problems.append("Title cannot be empty.")

        has_summary = bool(version.summary and version.summary.strip())
        has_steps = bool(version.steps and len(version.steps) > 0)

        if not has_summary and not has_steps:
            problems.append("Version must contain a non-empty summary or at least one step.")

        if version.steps:
            for idx, s in enumerate(version.steps, start=1):
                step_title = s.get("title", "").strip() if isinstance(s, dict) else ""
                step_inst = s.get("instruction", "").strip() if isinstance(s, dict) else ""
                if not step_title:
                    problems.append(f"Step {idx} is missing a title.")
                if not step_inst:
                    problems.append(f"Step {idx} is missing an instruction.")

        return problems
