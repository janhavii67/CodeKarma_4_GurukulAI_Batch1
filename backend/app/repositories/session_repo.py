from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, update
from app.models.session import SessionModel
from app.db.base import utc_now


class SessionRepository:
    @staticmethod
    def create_session(
        db: Session,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
    ) -> SessionModel:
        session = SessionModel(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=utc_now(),
            last_seen_at=utc_now(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def get_by_token_hash(db: Session, token_hash: str) -> Optional[SessionModel]:
        stmt = select(SessionModel).where(SessionModel.token_hash == token_hash)
        return db.execute(stmt).scalars().first()

    @staticmethod
    def touch(db: Session, session: SessionModel) -> None:
        session.last_seen_at = utc_now()
        db.commit()

    @staticmethod
    def revoke(db: Session, session: SessionModel) -> None:
        session.revoked_at = utc_now()
        db.commit()

    @staticmethod
    def revoke_all_for_user(db: Session, user_id: str) -> None:
        stmt = (
            update(SessionModel)
            .where(
                SessionModel.user_id == user_id,
                SessionModel.revoked_at.is_(None),
            )
            .values(revoked_at=utc_now())
        )
        db.execute(stmt)
        db.commit()
