from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.audit import AuditLog
from app.db.base import utc_now


class AuditRepository:
    @staticmethod
    def create_log(
        db: Session,
        action: str,
        entity_type: str,
        entity_id: str,
        actor_id: Optional[str] = None,
        detail: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        commit: bool = True,
    ) -> AuditLog:
        log = AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail or {},
            ip_address=ip_address,
            created_at=utc_now(),
        )
        db.add(log)
        if commit:
            db.commit()
            db.refresh(log)
        else:
            db.flush()
        return log

