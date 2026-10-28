from typing import List, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.media import MediaAsset
from app.models.knowledge import KnowledgeItem, KnowledgeVersion


class MediaRepository:
    @staticmethod
    def create(
        db: Session,
        version_id: str,
        kind: str,
        storage_key: str,
        original_name: str,
        mime: str,
        size_bytes: int,
        uploaded_by: str,
        machine_id: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        commit: bool = True,
    ) -> MediaAsset:
        asset = MediaAsset(
            version_id=version_id,
            kind=kind,
            storage_key=storage_key,
            original_name=original_name,
            mime=mime,
            size_bytes=size_bytes,
            uploaded_by=uploaded_by,
            machine_id=machine_id,
            title=title or original_name,
            description=description,
            tags=tags,
        )
        db.add(asset)
        if commit:
            db.commit()
            db.refresh(asset)
        else:
            db.flush()
        return asset

    @staticmethod
    def get_by_id(db: Session, asset_id: str) -> Optional[MediaAsset]:
        return db.get(MediaAsset, asset_id)

    @staticmethod
    def list_by_version_id(db: Session, version_id: str) -> List[MediaAsset]:
        stmt = (
            select(MediaAsset)
            .where(MediaAsset.version_id == version_id)
            .order_by(MediaAsset.created_at.asc())
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def list_by_machine_id(db: Session, machine_id: str, kind: Optional[str] = None) -> List[MediaAsset]:
        # `machine_id` was added to standalone media later in the schema
        # history. For older assets attached to knowledge versions, resolve
        # their machine through the version and then its knowledge item.
        effective_machine_id = func.coalesce(
            MediaAsset.machine_id,
            KnowledgeVersion.machine_id,
            KnowledgeItem.machine_id,
        )
        stmt = (
            select(MediaAsset)
            .outerjoin(KnowledgeVersion, MediaAsset.version_id == KnowledgeVersion.id)
            .outerjoin(KnowledgeItem, KnowledgeVersion.item_id == KnowledgeItem.id)
            .where(effective_machine_id == machine_id)
        )
        if kind:
            stmt = stmt.where(MediaAsset.kind == kind)
        stmt = stmt.order_by(MediaAsset.created_at.desc())
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def count_by_version_id(db: Session, version_id: str) -> int:
        stmt = (
            select(func.count(MediaAsset.id))
            .where(MediaAsset.version_id == version_id)
        )
        return db.scalar(stmt) or 0

    @staticmethod
    def delete(db: Session, asset: MediaAsset, commit: bool = True) -> None:
        db.delete(asset)
        if commit:
            db.commit()
        else:
            db.flush()

    @staticmethod
    def list_all(db: Session) -> List[MediaAsset]:
        stmt = select(MediaAsset).order_by(MediaAsset.created_at.asc())
        return list(db.execute(stmt).scalars().all())
