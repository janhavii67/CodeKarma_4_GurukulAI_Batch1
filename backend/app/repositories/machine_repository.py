from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.machine import Machine


class MachineRepository:
    @staticmethod
    def get_by_id(db: Session, machine_id: str) -> Optional[Machine]:
        return db.get(Machine, machine_id)

    @staticmethod
    def get_by_code(db: Session, code: str) -> Optional[Machine]:
        stmt = select(Machine).where(Machine.code == code.strip())
        return db.execute(stmt).scalars().first()

    @staticmethod
    def create_machine(
        db: Session,
        name: str,
        code: str,
        category: str,
        is_demo: bool = False,
        commit: bool = True,
    ) -> Machine:
        machine = Machine(
            name=name.strip(),
            code=code.strip(),
            category=category.strip(),
            is_demo=is_demo,
        )
        db.add(machine)
        if commit:
            db.commit()
            db.refresh(machine)
        else:
            db.flush()
        return machine

    @staticmethod
    def list_machines(
        db: Session,
        page: int = 1,
        page_size: int = 20,
        q: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Tuple[List[Machine], int]:
        stmt = select(Machine)

        if q:
            # Case-insensitive title / code search with escaped wildcards
            escaped_q = q.strip().replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(
                (Machine.name.ilike(f"%{escaped_q}%"))
                | (Machine.code.ilike(f"%{escaped_q}%"))
            )

        if category:
            stmt = stmt.where(Machine.category == category.strip())

        # Total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.execute(count_stmt).scalar_one()

        # Paginated items
        offset = (page - 1) * page_size
        stmt = stmt.order_by(Machine.name.asc()).offset(offset).limit(page_size)
        items = list(db.execute(stmt).scalars().all())

        return items, total
