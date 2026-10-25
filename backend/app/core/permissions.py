from dataclasses import dataclass
from typing import Callable, List, Optional
from fastapi import Cookie, Depends, Header, Request
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import (
    CSRFError,
    ForbiddenError,
    UnauthenticatedError,
)
from app.core.security import hash_session_token
from app.db.base import utc_now
from app.db.session import get_db
from app.models.session import SessionModel
from app.models.user import User
from app.repositories.session_repo import SessionRepository
from app.repositories.user_repo import UserRepository

# Permission Constants
PERM_KNOWLEDGE_CREATE = "knowledge.create"
PERM_KNOWLEDGE_EDIT_OWN_DRAFT = "knowledge.edit_own_draft"
PERM_KNOWLEDGE_SUBMIT_REVIEW = "knowledge.submit_review"
PERM_KNOWLEDGE_APPROVE = "knowledge.approve"
PERM_MACHINE_MANAGE = "machine.manage"
PERM_KNOWLEDGE_VIEW_PUBLISHED = "knowledge.view_published"
PERM_ASSISTANT_USE = "assistant.use"
PERM_AUDIT_VIEW = "audit.view"
PERM_PROCEDURE_CREATE = "procedure.create"
PERM_PROCEDURE_EXECUTE = "procedure.execute"
PERM_TROUBLESHOOT_USE = "troubleshoot.use"
PERM_AUDIO_MANAGE = "audio.manage"
PERM_AUDIO_ANALYZE = "audio.analyze"
PERM_SIMULATION_ATTEMPT = "simulation.attempt"
PERM_LEARNING_MANAGE = "learning.manage"
PERM_ADMIN_MANAGE = "admin.manage"

# Role Constants
ROLE_ADMIN = "ADMIN"
ROLE_EXPERT = "EXPERT"
ROLE_OPERATOR = "OPERATOR"
ROLE_TRAINEE = "TRAINEE"



@dataclass
class AuthenticatedContext:
    user: User
    session: SessionModel
    permissions: List[str]


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> AuthenticatedContext:
    """FastAPI dependency to extract and validate the active session from HttpOnly cookie."""
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not cookie_token:
        raise UnauthenticatedError(
            code="unauthenticated",
            message="No active session found. Please log in.",
        )

    token_hash = hash_session_token(cookie_token)
    session = SessionRepository.get_by_token_hash(db, token_hash)

    if not session or session.revoked_at is not None:
        raise UnauthenticatedError(
            code="session_revoked",
            message="Your session has been revoked or is invalid.",
        )

    now = utc_now()

    # Check absolute timeout (8 hours default)
    # Ensure timezone awareness compatibility
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=now.tzinfo)

    if now > expires_at:
        raise UnauthenticatedError(
            code="session_expired",
            message="Your session has expired. Please log in again.",
        )

    # Check idle timeout (30 minutes default)
    last_seen_at = session.last_seen_at
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=now.tzinfo)

    idle_seconds = (now - last_seen_at).total_seconds()
    if idle_seconds > (settings.IDLE_TIMEOUT_MINUTES * 60):
        raise UnauthenticatedError(
            code="session_idle_timeout",
            message="Session timed out due to 30 minutes of inactivity.",
        )

    user = UserRepository.get_by_id(db, session.user_id)
    if not user or not user.is_active:
        raise ForbiddenError(
            code="user_deactivated",
            message="Your account is inactive or has been disabled.",
        )

    # Throttled session touch: only update if > 60s has passed since last_seen_at
    if idle_seconds > 60:
        SessionRepository.touch(db, session)

    permissions = UserRepository.get_user_permissions(db, user)
    return AuthenticatedContext(
        user=user,
        session=session,
        permissions=permissions,
    )


def csrf_protect(
    request: Request,
) -> None:
    """Verifies Double-Submit CSRF cookie pattern on state-changing HTTP methods."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        # Allow public registration and login to bypass CSRF since no prior session exists
        path = request.url.path
        if path.endswith("/auth/login") or path.endswith("/auth/register"):
            return

        cookie_csrf = request.cookies.get(settings.CSRF_COOKIE_NAME)
        header_csrf = request.headers.get(settings.CSRF_HEADER_NAME)

        if not cookie_csrf or not header_csrf or cookie_csrf != header_csrf:
            raise CSRFError(
                code="csrf_failed",
                message="CSRF validation failed. Missing or mismatched X-CSRF-Token header.",
            )


def require_permission(permission_id: str) -> Callable:
    """Returns a dependency that asserts the caller possesses the specified permission."""

    def _dependency(
        auth_ctx: AuthenticatedContext = Depends(get_current_user),
    ) -> AuthenticatedContext:
        if permission_id not in auth_ctx.permissions:
            raise ForbiddenError(
                code="forbidden",
                message=f"Access denied: missing permission '{permission_id}'.",
            )
        return auth_ctx

    return _dependency


def require_role(role_id: str) -> Callable:
    """Returns a dependency that asserts the caller possesses the specified role."""

    def _dependency(
        auth_ctx: AuthenticatedContext = Depends(get_current_user),
    ) -> AuthenticatedContext:
        if auth_ctx.user.role_id != role_id:
            raise ForbiddenError(
                code="forbidden",
                message=f"Access denied: requires role '{role_id}'.",
            )
        return auth_ctx

    return _dependency
