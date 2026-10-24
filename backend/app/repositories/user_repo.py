from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.user import User, RolePermission, UserPermission


class UserRepository:
    @staticmethod
    def get_by_id(db: Session, user_id: str) -> Optional[User]:
        return db.get(User, user_id)

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email.lower().strip())
        return db.execute(stmt).scalars().first()

    @staticmethod
    def create_user(
        db: Session,
        email: str,
        name: str,
        password_hash: str,
        role_id: str = "TRAINEE",
    ) -> User:
        user = User(
            email=email.lower().strip(),
            name=name.strip(),
            password_hash=password_hash,
            role_id=role_id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def get_user_permissions(db: Session, user: User) -> List[str]:
        # Role-based permissions
        role_perm_stmt = select(RolePermission.permission_id).where(
            RolePermission.role_id == user.role_id
        )
        role_permissions = set(db.execute(role_perm_stmt).scalars().all())

        # User-specific extra permissions
        user_perm_stmt = select(UserPermission.permission_id).where(
            UserPermission.user_id == user.id
        )
        user_permissions = set(db.execute(user_perm_stmt).scalars().all())

        return sorted(list(role_permissions | user_permissions))
