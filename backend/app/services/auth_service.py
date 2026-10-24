from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    UnauthenticatedError,
    ValidationError,
)
from app.core.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.models.user import User
from app.models.session import SessionModel
from app.repositories.session_repo import SessionRepository
from app.repositories.user_repo import UserRepository
from app.services.audit_service import AuditService
from app.db.base import utc_now

# In-memory rate limiting tracker: ip -> list of failure timestamps
_failed_attempts: Dict[str, List[datetime]] = {}
MAX_FAILED_ATTEMPTS = 10
RATE_LIMIT_WINDOW_SECONDS = 300


class AuthService:
    @staticmethod
    def _check_rate_limit(key: str) -> None:
        now = utc_now()
        attempts = _failed_attempts.get(key, [])
        # filter attempts within window
        valid_attempts = [
            t
            for t in attempts
            if (now - t).total_seconds() < RATE_LIMIT_WINDOW_SECONDS
        ]
        _failed_attempts[key] = valid_attempts
        if len(valid_attempts) >= MAX_FAILED_ATTEMPTS:
            raise ForbiddenError(
                code="rate_limit_exceeded",
                message="Too many failed login attempts. Please try again in 5 minutes.",
            )

    @staticmethod
    def _record_failed_attempt(key: str) -> None:
        now = utc_now()
        if key not in _failed_attempts:
            _failed_attempts[key] = []
        _failed_attempts[key].append(now)

    @staticmethod
    def _clear_rate_limit(key: str) -> None:
        _failed_attempts.pop(key, None)

    @classmethod
    def register(
        cls,
        db: Session,
        email: str,
        name: str,
        password: str,
        ip_address: Optional[str] = None,
    ) -> Tuple[User, str, List[str]]:
        existing = UserRepository.get_by_email(db, email)
        if existing:
            raise ConflictError(
                code="already_exists",
                message="An account with this email address already exists.",
            )

        # Hash with Argon2id
        pwd_hash = hash_password(password)

        # Self-registration strictly enforces TRAINEE role only
        user = UserRepository.create_user(
            db=db,
            email=email,
            name=name,
            password_hash=pwd_hash,
            role_id="TRAINEE",
        )

        AuditService.log(
            db=db,
            action="auth.register",
            entity_type="user",
            entity_id=user.id,
            actor_id=user.id,
            detail={"email": user.email, "role": user.role_id},
            ip_address=ip_address,
        )

        # Create initial session
        raw_token = generate_session_token()
        token_hash = hash_session_token(raw_token)
        expires_at = utc_now() + timedelta(hours=settings.ABSOLUTE_TIMEOUT_HOURS)

        SessionRepository.create_session(
            db=db,
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        permissions = UserRepository.get_user_permissions(db, user)
        return user, raw_token, permissions

    @classmethod
    def login(
        cls,
        db: Session,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
    ) -> Tuple[User, str, List[str]]:
        rate_key = f"{ip_address}:{email.lower().strip()}"
        cls._check_rate_limit(rate_key)

        user = UserRepository.get_by_email(db, email)
        if not user or not verify_password(password, user.password_hash):
            cls._record_failed_attempt(rate_key)
            AuditService.log(
                db=db,
                action="auth.login_failed",
                entity_type="user",
                entity_id=user.id if user else "unknown",
                actor_id=None,
                detail={"email": email.lower().strip(), "reason": "invalid_credentials"},
                ip_address=ip_address,
            )
            # Generic 401 message without user enumeration
            raise UnauthenticatedError(
                code="unauthenticated",
                message="Invalid email or password.",
            )

        if not user.is_active:
            AuditService.log(
                db=db,
                action="auth.login_blocked",
                entity_type="user",
                entity_id=user.id,
                actor_id=user.id,
                detail={"email": user.email, "reason": "user_deactivated"},
                ip_address=ip_address,
            )
            raise ForbiddenError(
                code="user_deactivated",
                message="This user account has been deactivated.",
            )

        # Success - clear rate limit
        cls._clear_rate_limit(rate_key)

        # Create session
        raw_token = generate_session_token()
        token_hash = hash_session_token(raw_token)
        expires_at = utc_now() + timedelta(hours=settings.ABSOLUTE_TIMEOUT_HOURS)

        SessionRepository.create_session(
            db=db,
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )

        AuditService.log(
            db=db,
            action="auth.login_success",
            entity_type="user",
            entity_id=user.id,
            actor_id=user.id,
            detail={"email": user.email, "role": user.role_id},
            ip_address=ip_address,
        )

        permissions = UserRepository.get_user_permissions(db, user)
        return user, raw_token, permissions

    @staticmethod
    def logout(
        db: Session,
        session_model: SessionModel,
        ip_address: Optional[str] = None,
    ) -> None:
        SessionRepository.revoke(db, session_model)
        AuditService.log(
            db=db,
            action="auth.logout",
            entity_type="session",
            entity_id=session_model.id,
            actor_id=session_model.user_id,
            detail={},
            ip_address=ip_address,
        )

    @staticmethod
    def get_me(db: Session, user: User) -> Tuple[User, List[str]]:
        permissions = UserRepository.get_user_permissions(db, user)
        return user, permissions
