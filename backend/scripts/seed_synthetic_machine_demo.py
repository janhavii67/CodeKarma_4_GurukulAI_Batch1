"""Create/reset an isolated SQLite demo for synthetic Tutor knowledge only.

The script deliberately does not use the application-wide engine or the
comprehensive development seed. It writes only to SYNTHETIC_DEMO_DB_PATH.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from typing import Iterable, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
for candidate in (str(ROOT_DIR), str(BACKEND_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR as CONFIG_BACKEND_DIR, settings
from app.core.permissions import (
    PERM_ASSISTANT_USE,
    PERM_KNOWLEDGE_APPROVE,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
    ROLE_EXPERT,
    ROLE_TRAINEE,
)
from app.core.security import hash_password
from app.db.base import Base
from app.models import Machine, MachineCategory, Permission, Role, RolePermission, User
from app.services.synthetic_demo import (
    SYNTHETIC_DEMO_DB_PATH,
    SYNTHETIC_DEMO_ENVIRONMENT,
    SYNTHETIC_DEMO_MARKER,
    SYNTHETIC_MACHINE_CASES,
)

DEMO_AUTHOR_EMAIL = "synthetic.author@demo.local"
DEMO_REVIEWER_EMAIL = "synthetic.reviewer@demo.local"
DEMO_TRAINEE_EMAIL = "synthetic.trainee@demo.local"
DEMO_AUTHOR_ID = "d15c0000-0000-4000-8000-000000000011"
DEMO_REVIEWER_ID = "d15c0000-0000-4000-8000-000000000012"
DEMO_TRAINEE_ID = "d15c0000-0000-4000-8000-000000000013"
MARKER_TABLE = "synthetic_demo_marker"

PERMISSION_DESCRIPTIONS = {
    PERM_ASSISTANT_USE: "Query the grounded AI Tutor in the isolated synthetic demo.",
    PERM_KNOWLEDGE_APPROVE: "Independently review synthetic demo knowledge drafts.",
    PERM_KNOWLEDGE_CREATE: "Create synthetic demo knowledge drafts.",
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT: "Edit the author's own synthetic demo draft.",
    PERM_KNOWLEDGE_SUBMIT_REVIEW: "Submit synthetic demo drafts for peer review.",
    PERM_KNOWLEDGE_VIEW_PUBLISHED: "Read published knowledge in the isolated synthetic demo.",
}
EXPERT_PERMISSIONS = (
    PERM_KNOWLEDGE_APPROVE,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_EDIT_OWN_DRAFT,
    PERM_KNOWLEDGE_SUBMIT_REVIEW,
    PERM_KNOWLEDGE_VIEW_PUBLISHED,
    PERM_ASSISTANT_USE,
)
TRAINEE_PERMISSIONS = (PERM_KNOWLEDGE_VIEW_PUBLISHED, PERM_ASSISTANT_USE)


def _require_explicit_demo_environment() -> None:
    if os.environ.get("GURUKUL_SYNTHETIC_DEMO") != "1":
        raise RuntimeError("Set GURUKUL_SYNTHETIC_DEMO=1 before running this isolated demo seed/reset.")
    if str(settings.ENVIRONMENT).casefold() != SYNTHETIC_DEMO_ENVIRONMENT:
        raise RuntimeError(f"Set ENVIRONMENT={SYNTHETIC_DEMO_ENVIRONMENT} before running this command.")


def _assert_safe_path(path: Path) -> Path:
    target = path.resolve()
    expected = Path(SYNTHETIC_DEMO_DB_PATH).resolve()
    shared_dev = (CONFIG_BACKEND_DIR / "gurukul_dev.db").resolve()
    if target != expected or target == shared_dev or target.suffix.casefold() not in {".db", ".sqlite", ".sqlite3"}:
        raise RuntimeError("Refusing unsafe database target; this command accepts only the fixed synthetic demo SQLite path.")
    if path.is_symlink():
        raise RuntimeError("Refusing a symlink at the synthetic demo database path.")
    return target


def _has_valid_marker(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with closing(sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)) as connection:
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            }
            if MARKER_TABLE not in tables:
                return False
            row = connection.execute(
                f"SELECT marker FROM {MARKER_TABLE} WHERE singleton = 1"
            ).fetchone()
            return bool(row and row[0] == SYNTHETIC_DEMO_MARKER)
    except sqlite3.Error:
        return False


def _create_marker(path: Path) -> None:
    with closing(sqlite3.connect(path)) as connection:
        with connection:
            connection.execute(
                f"CREATE TABLE IF NOT EXISTS {MARKER_TABLE} (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), marker TEXT NOT NULL)"
            )
            existing = connection.execute(
                f"SELECT marker FROM {MARKER_TABLE} WHERE singleton = 1"
            ).fetchone()
            if existing and existing[0] != SYNTHETIC_DEMO_MARKER:
                raise RuntimeError("The database marker does not match this synthetic demo seed.")
            if not existing:
                connection.execute(
                    f"INSERT INTO {MARKER_TABLE} (singleton, marker) VALUES (1, ?)",
                    (SYNTHETIC_DEMO_MARKER,),
                )


def _add_if_missing(db: Session, model, identity, expected: dict, factory) -> bool:
    existing = db.get(model, identity)
    if existing is None:
        db.add(factory())
        db.flush()
        return True
    for field, value in expected.items():
        if getattr(existing, field) != value:
            raise RuntimeError(f"Synthetic demo row conflict for {model.__tablename__}.{field}; no row was overwritten.")
    return False


def _seed_rows(db: Session) -> dict[str, int]:
    created = {"categories": 0, "roles": 0, "permissions": 0, "role_permissions": 0, "users": 0, "machines": 0}
    created["categories"] += _add_if_missing(
        db,
        MachineCategory,
        "SYNTHETIC-DEMO",
        {"name": "Synthetic Demo", "description": SYNTHETIC_DEMO_MARKER},
        lambda: MachineCategory(id="SYNTHETIC-DEMO", name="Synthetic Demo", description=SYNTHETIC_DEMO_MARKER),
    )
    roles = {
        ROLE_EXPERT: "Synthetic Demo Expert",
        ROLE_TRAINEE: "Synthetic Demo Trainee",
    }
    for role_id, name in roles.items():
        created["roles"] += _add_if_missing(
            db, Role, role_id,
            {"name": name},
            lambda role_id=role_id, name=name: Role(id=role_id, name=name, description=SYNTHETIC_DEMO_MARKER),
        )

    for permission_id, description in PERMISSION_DESCRIPTIONS.items():
        created["permissions"] += _add_if_missing(
            db, Permission, permission_id,
            {"description": description},
            lambda permission_id=permission_id, description=description: Permission(id=permission_id, description=description),
        )

    role_permission_rows: Iterable[tuple[str, str]] = (
        *((ROLE_EXPERT, permission) for permission in EXPERT_PERMISSIONS),
        *((ROLE_TRAINEE, permission) for permission in TRAINEE_PERMISSIONS),
    )
    for role_id, permission_id in role_permission_rows:
        identity = (role_id, permission_id)
        if db.get(RolePermission, identity) is None:
            db.add(RolePermission(role_id=role_id, permission_id=permission_id))
            db.flush()
            created["role_permissions"] += 1

    accounts = (
        (DEMO_AUTHOR_ID, DEMO_AUTHOR_EMAIL, "Synthetic Demo Author", ROLE_EXPERT, "SYNTHETIC_DEMO_AUTHOR_PASSWORD"),
        (DEMO_REVIEWER_ID, DEMO_REVIEWER_EMAIL, "Synthetic Demo Peer Reviewer", ROLE_EXPERT, "SYNTHETIC_DEMO_REVIEWER_PASSWORD"),
        (DEMO_TRAINEE_ID, DEMO_TRAINEE_EMAIL, "Synthetic Demo Trainee", ROLE_TRAINEE, "SYNTHETIC_DEMO_TRAINEE_PASSWORD"),
    )
    for user_id, email, name, role_id, password_env in accounts:
        existing = db.get(User, user_id)
        if existing is not None:
            if (existing.email, existing.name, existing.role_id) != (email, name, role_id):
                raise RuntimeError("Synthetic demo account conflict; no user record was overwritten.")
            continue
        existing_by_email = db.query(User).filter(User.email == email).first()
        if existing_by_email:
            raise RuntimeError("Synthetic demo account email is already in use by another record; no row was overwritten.")
        password = os.environ.get(password_env, "")
        if len(password) < 12:
            raise RuntimeError(f"Set {password_env} to a unique password of at least 12 characters.")
        db.add(User(id=user_id, email=email, name=name, role_id=role_id, password_hash=hash_password(password)))
        db.flush()
        created["users"] += 1

    for case in SYNTHETIC_MACHINE_CASES:
        expected = {
            "name": f"{case['machine_name']} — {SYNTHETIC_DEMO_MARKER}",
            "code": case["machine_code"],
            "model_number": case["model_number"],
            "serial_number": case["serial_number"],
            "manufacturer": case["manufacturer"],
            "category": "SYNTHETIC-DEMO",
            "status": "ACTIVE",
            "is_demo": True,
        }
        created["machines"] += _add_if_missing(
            db,
            Machine,
            case["id"],
            expected,
            lambda case=case, expected=expected: Machine(id=case["id"], **expected, location=SYNTHETIC_DEMO_MARKER),
        )

    db.commit()
    return created


def seed_demo_database(database_path: Optional[Path] = None) -> dict[str, int]:
    _require_explicit_demo_environment()
    target = _assert_safe_path(Path(database_path or SYNTHETIC_DEMO_DB_PATH))
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0 and not _has_valid_marker(target):
        raise RuntimeError("Refusing to seed an existing unmarked SQLite database.")
    _create_marker(target)
    engine = create_engine(f"sqlite:///{target.as_posix()}", connect_args={"check_same_thread": False})
    try:
        Base.metadata.create_all(bind=engine)
        with Session(engine) as db:
            return _seed_rows(db)
    finally:
        engine.dispose()


def reset_demo_database(database_path: Optional[Path] = None) -> bool:
    _require_explicit_demo_environment()
    target = _assert_safe_path(Path(database_path or SYNTHETIC_DEMO_DB_PATH))
    if not target.exists():
        return False
    if not _has_valid_marker(target):
        raise RuntimeError("Refusing to reset an existing database without the exact synthetic demo marker.")
    target.unlink()
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "reset"))
    args = parser.parse_args()
    try:
        if args.action == "seed":
            counts = seed_demo_database()
            print(
                "Synthetic demo seed is ready: 4 synthetic machines, "
                f"{counts['users']} new demo users, {counts['permissions']} new permissions. "
                "No knowledge records were inserted, published, or indexed."
            )
        else:
            removed = reset_demo_database()
            print("Isolated synthetic demo database reset." if removed else "No isolated synthetic demo database existed.")
    except (OSError, RuntimeError) as exc:
        print(f"Synthetic demo seed/reset refused: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
