from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.repositories.audit_repo import AuditRepository
from app.core.logging import logger


class AuditService:
    @staticmethod
    def log(
        db: Session,
        action: str,
        entity_type: str,
        entity_id: str,
        actor_id: Optional[str] = None,
        detail: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ):
        try:
            clean_detail = {}
            if detail:
                for k, v in detail.items():
                    if any(
                        s in k.lower()
                        for s in ("pass", "token", "secret", "key", "cookie")
                    ):
                        clean_detail[k] = "[REDACTED]"
                    else:
                        clean_detail[k] = v

            AuditRepository.create_log(
                db=db,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                actor_id=actor_id,
                detail=clean_detail,
                ip_address=ip_address,
            )
            logger.info(
                f"Audit: action={action} entity={entity_type}:{entity_id} actor={actor_id}"
            )
        except Exception as e:
            logger.error(f"Failed to record audit log: {e}")
