import os
import sys

# Ensure backend root is in python path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.models import Base, Role, Permission, RolePermission, User, UserPermission
from app.core.config import settings
from app.core.security import hash_password
from app.core.logging import logger
from app.core.permissions import (
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
    PERM_KNOWLEDGE_APPROVE,
    PERM_MACHINE_MANAGE,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
    PERM_ASSISTANT_USE,
    PERM_AUDIT_VIEW,
    ROLE_EXPERT,
    ROLE_TRAINEE,
)


def seed_database(db: Session) -> None:
    logger.info("Starting database seeding for Gurukul AI Foundation...")

    # 1. Seed Roles
    roles_data = [
        {"id": ROLE_EXPERT, "name": "Manufacturing Expert", "description": "Author, engineer, and peer reviewer"},
        {"id": ROLE_TRAINEE, "name": "Workshop Trainee", "description": "Operator and training participant"},
    ]
    for r in roles_data:
        existing = db.get(Role, r["id"])
        if not existing:
            role = Role(id=r["id"], name=r["name"], description=r["description"])
            db.add(role)
            logger.info(f"Created role: {r['id']}")

    db.commit()

    # 2. Seed Permissions
    permissions_data = [
        {"id": PERM_KNOWLEDGE_CREATE, "description": "Create new knowledge items and drafts"},
        {"id": PERM_KNOWLEDGE_EDIT_OWN_DRAFT, "description": "Edit author's own drafts"},
        {"id": PERM_KNOWLEDGE_SUBMIT_REVIEW, "description": "Submit drafts for peer review"},
        {"id": PERM_KNOWLEDGE_APPROVE, "description": "Approve peer drafts and publish revisions"},
        {"id": PERM_MACHINE_MANAGE, "description": "Register and manage machine assets"},
        {"id": PERM_KNOWLEDGE_VIEW_PUBLISHED, "description": "Read published verified SOPs"},
        {"id": PERM_ASSISTANT_USE, "description": "Query the AI knowledge assistant"},
        {"id": PERM_AUDIT_VIEW, "description": "Inspect system audit trails"},
    ]
    for p in permissions_data:
        existing = db.get(Permission, p["id"])
        if not existing:
            perm = Permission(id=p["id"], description=p["description"])
            db.add(perm)
            logger.info(f"Created permission: {p['id']}")

    db.commit()

    # 3. Seed Role-Permissions
    expert_permissions = [
        PERM_KNOWLEDGE_CREATE,
        PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
        PERM_KNOWLEDGE_SUBMIT_REVIEW,
        PERM_MACHINE_MANAGE,
        PERM_KNOWLEDGE_VIEW_PUBLISHED,
        PERM_ASSISTANT_USE,
    ]
    trainee_permissions = [
        PERM_KNOWLEDGE_VIEW_PUBLISHED,
        PERM_ASSISTANT_USE,
    ]

    for pid in expert_permissions:
        if not db.get(RolePermission, (ROLE_EXPERT, pid)):
            db.add(RolePermission(role_id=ROLE_EXPERT, permission_id=pid))

    for pid in trainee_permissions:
        if not db.get(RolePermission, (ROLE_TRAINEE, pid)):
            db.add(RolePermission(role_id=ROLE_TRAINEE, permission_id=pid))

    db.commit()

    # 4. Seed Demo Users
    users_to_seed = [
        {
            "email": settings.EXPERT_A_EMAIL,
            "name": "Aarav Sharma (Author Expert)",
            "role_id": ROLE_EXPERT,
            "password": settings.EXPERT_A_PASSWORD,
            "extra_permissions": [],
        },
        {
            "email": settings.EXPERT_B_EMAIL,
            "name": "Bhavna Patel (Reviewer Expert)",
            "role_id": ROLE_EXPERT,
            "password": settings.EXPERT_B_PASSWORD,
            "extra_permissions": [PERM_KNOWLEDGE_APPROVE, PERM_AUDIT_VIEW],
        },
        {
            "email": settings.TRAINEE_EMAIL,
            "name": "Devendra Verma (Trainee)",
            "role_id": ROLE_TRAINEE,
            "password": settings.TRAINEE_PASSWORD,
            "extra_permissions": [],
        },
    ]

    for u in users_to_seed:
        existing_user = db.query(User).filter(User.email == u["email"].lower().strip()).first()
        if not existing_user:
            user = User(
                email=u["email"].lower().strip(),
                name=u["name"],
                password_hash=hash_password(u["password"]),
                role_id=u["role_id"],
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"Created demo user: {u['email']} [{u['role_id']}]")

            # Add extra custom permissions if specified
            for extra_p in u["extra_permissions"]:
                db.add(UserPermission(user_id=user.id, permission_id=extra_p))
            db.commit()
        else:
            logger.info(f"User {u['email']} already exists, skipping creation.")

    logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
