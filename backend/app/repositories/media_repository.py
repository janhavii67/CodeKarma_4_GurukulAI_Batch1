from typing import List, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.media import MediaAsset


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
