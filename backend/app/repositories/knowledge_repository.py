from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session
from app.db.base import utc_now
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    OPEN_DRAFT_STATUSES,
    STATUS_DRAFT,
    ORIGIN_EXPERT,
)


class KnowledgeRepository:
    @staticmethod
    def get_item_by_id(
        db: Session,
        item_id: str,
        for_update: bool = False,
    ) -> Optional[KnowledgeItem]:
        stmt = select(KnowledgeItem).where(KnowledgeItem.id == item_id)
        if for_update:
            # Row-level lock for concurrency safety
            stmt = stmt.with_for_update()
        return db.execute(stmt).scalars().first()

    @staticmethod
    def get_version_by_id(db: Session, version_id: str) -> Optional[KnowledgeVersion]:
        return db.get(KnowledgeVersion, version_id)

    @staticmethod
    def get_version_by_item_and_no(
        db: Session,
        item_id: str,
        version_no: int,
    ) -> Optional[KnowledgeVersion]:
        stmt = select(KnowledgeVersion).where(
            KnowledgeVersion.item_id == item_id,
            KnowledgeVersion.version_no == version_no,
        )
        return db.execute(stmt).scalars().first()

    @staticmethod
    def get_open_version_for_item(
        db: Session,
        item_id: str,
    ) -> Optional[KnowledgeVersion]:
        stmt = select(KnowledgeVersion).where(
            KnowledgeVersion.item_id == item_id,
            KnowledgeVersion.status.in_(OPEN_DRAFT_STATUSES),
        )
        return db.execute(stmt).scalars().first()

    @staticmethod
    def get_max_version_no(db: Session, item_id: str) -> int:
        stmt = select(func.coalesce(func.max(KnowledgeVersion.version_no), 0)).where(
            KnowledgeVersion.item_id == item_id
        )
        return db.execute(stmt).scalar_one()

    @staticmethod
    def create_item_and_version_1(
        db: Session,
        title: str,
        author_id: str,
        machine_id: Optional[str] = None,
        summary: Optional[str] = None,
        description: Optional[str] = None,
        is_demo: bool = False,
        commit: bool = True,
    ) -> Tuple[KnowledgeItem, KnowledgeVersion]:
        item = KnowledgeItem(
            title=title.strip(),
            author_id=author_id,
            machine_id=machine_id,
            is_demo=is_demo,
            current_published_version_id=None,
        )
        db.add(item)
        db.flush()  # assign item.id

        version = KnowledgeVersion(
            item_id=item.id,
            article_id=item.id,
            version_no=1,
            version=1,
            title=title.strip() if title else item.title,
            machine_id=machine_id,
            status=STATUS_DRAFT,
            summary=summary.strip() if summary else None,
            description=description.strip() if description else None,
            steps=[],
            origin=ORIGIN_EXPERT,
            revision_reason=None,
            created_by=author_id,
            author_id=author_id,
        )
        db.add(version)

        if commit:
            db.commit()
            db.refresh(item)
            db.refresh(version)
        else:
            db.flush()

        return item, version

    @staticmethod
    def create_revision_version(
        db: Session,
        item_id: str,
        from_version: KnowledgeVersion,
        created_by: str,
        revision_reason: str,
        next_version_no: int,
        commit: bool = True,
    ) -> KnowledgeVersion:
        # Copy steps, summary, and description
        copied_steps = [dict(s) for s in from_version.steps] if from_version.steps else []

        new_version = KnowledgeVersion(
            item_id=item_id,
            article_id=item_id,
            version_no=next_version_no,
            version=next_version_no,
            title=from_version.title or "",
            machine_id=from_version.machine_id,
            status=STATUS_DRAFT,
            summary=from_version.summary,
            description=from_version.description,
            steps=copied_steps,
            source_refs=[dict(ref) for ref in (from_version.source_refs or []) if isinstance(ref, dict)],
            content=from_version.content,
            operating_conditions=from_version.operating_conditions,
            prerequisites=from_version.prerequisites,
            safety_warnings=from_version.safety_warnings,
            common_mistakes=from_version.common_mistakes,
            corrective_actions=from_version.corrective_actions,
            origin=ORIGIN_EXPERT,
            revision_reason=revision_reason.strip() if revision_reason else None,
            created_by=created_by,
            author_id=created_by,
        )
        db.add(new_version)

        if commit:
            db.commit()
            db.refresh(new_version)
        else:
            db.flush()

        return new_version

    @staticmethod
    def list_versions_for_item(
        db: Session,
        item_id: str,
    ) -> List[KnowledgeVersion]:
        stmt = (
            select(KnowledgeVersion)
            .where(KnowledgeVersion.item_id == item_id)
            .order_by(KnowledgeVersion.version_no.desc())
        )
        return list(db.execute(stmt).scalars().all())
