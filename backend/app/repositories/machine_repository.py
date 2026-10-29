from typing import List, Optional, Tuple
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.models.machine import Machine, MachineCategory


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
        category_id: Optional[str] = None,
        model_number: Optional[str] = None,
        serial_number: Optional[str] = None,
        manufacturer: Optional[str] = None,
        location: Optional[str] = None,
        status: str = "ACTIVE",
        is_active: bool = True,
        specifications: Optional[str] = None,
        is_demo: bool = False,
        commit: bool = True,
    ) -> Machine:
        machine = Machine(
            name=name.strip(),
            code=code.strip(),
            category=category.strip(),
            category_id=category_id,
            model_number=(model_number or code).strip() or None,
            serial_number=serial_number.strip() if serial_number else None,
            manufacturer=manufacturer.strip() if manufacturer else None,
            location=location.strip() if location else None,
            status=(status or "ACTIVE").strip().upper(),
            is_active=is_active,
            specifications=specifications.strip() if specifications else None,
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
        include_decommissioned: bool = False,
    ) -> Tuple[List[Machine], int]:
        stmt = select(Machine)

        if not include_decommissioned:
            stmt = stmt.where(Machine.status != "DECOMMISSIONED")

        if q:
            # Case-insensitive title / code search with escaped wildcards
            escaped_q = q.strip().replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(
                (Machine.name.ilike(f"%{escaped_q}%"))
                | (Machine.code.ilike(f"%{escaped_q}%"))
            )

        if category:
            value = category.strip()
            stmt = stmt.outerjoin(MachineCategory, Machine.category_id == MachineCategory.id).where(
                or_(
                    Machine.category == value,
                    Machine.category_id == value,
                    MachineCategory.id == value,
                    MachineCategory.name == value,
                )
            )

        # Total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.execute(count_stmt).scalar_one()

        # Paginated items
        offset = (page - 1) * page_size
        stmt = stmt.order_by(Machine.name.asc()).offset(offset).limit(page_size)
        items = list(db.execute(stmt).scalars().all())

        return items, total
