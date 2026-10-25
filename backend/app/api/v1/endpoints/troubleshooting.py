from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.permissions import (
    get_current_user,
    AuthenticatedContext,
)
from app.core.exceptions import NotFoundError
from app.models import TroubleshootingCase, TroubleshootingNode, TroubleshootingEdge, Machine
from app.schemas.troubleshooting import (
    TroubleshootingCaseListItem,
    TroubleshootingCaseDetailResponse,
    TroubleshootingNodeResponse,
    TroubleshootingEdgeResponse,
)

router = APIRouter(prefix="/troubleshooting", tags=["Troubleshooting"])


@router.get("", response_model=List[TroubleshootingCaseListItem])
def list_troubleshooting_cases(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List available expert diagnostic cases and symptoms."""
    query = db.query(TroubleshootingCase).filter(TroubleshootingCase.is_published == True)
    if machine_id:
        query = query.filter(TroubleshootingCase.machine_id == machine_id)
    cases = query.order_by(TroubleshootingCase.title).all()

    items = []
    for c in cases:
        mach = db.get(Machine, c.machine_id) if c.machine_id else None
        items.append(
            TroubleshootingCaseListItem(
                id=c.id,
                title=c.title,
                machine_id=c.machine_id,
                machine_name=mach.name if mach else None,
                symptom=c.symptom,
                severity=c.severity,
                is_published=c.is_published,
                created_at=c.created_at,
            )
        )
    return items


@router.get("/{case_id}", response_model=TroubleshootingCaseDetailResponse)
def get_troubleshooting_case(
    case_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve complete decision tree with nodes, branches, and safety warnings."""
    c = db.get(TroubleshootingCase, case_id)
    if not c:
        raise NotFoundError(code="case_not_found", message=f"Troubleshooting case '{case_id}' was not found.")

    mach = db.get(Machine, c.machine_id) if c.machine_id else None
    nodes = [
        TroubleshootingNodeResponse(
            id=n.id,
            node_type=n.node_type,
            title=n.title,
            description=n.description,
            safety_warning=n.safety_warning,
            is_root=n.is_root,
        )
        for n in c.nodes
    ]
    edges = [
        TroubleshootingEdgeResponse(
            id=e.id,
            from_node_id=e.from_node_id,
            to_node_id=e.to_node_id,
            label=e.label,
        )
        for e in c.edges
    ]

    return TroubleshootingCaseDetailResponse(
        id=c.id,
        title=c.title,
        machine_id=c.machine_id,
        machine_name=mach.name if mach else None,
        symptom=c.symptom,
        severity=c.severity,
        is_published=c.is_published,
        nodes=nodes,
        edges=edges,
        created_at=c.created_at,
    )
