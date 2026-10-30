"""Expert decision-tree builder and trainee walk-through endpoints."""
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    require_any_permission,
    require_permission,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
    PERM_TROUBLESHOOT_USE,
)
from app.db.session import get_db
from app.schemas.decision_tree import (
    BatchPositionUpdate,
    DecisionTreeEdgeCreate,
    DecisionTreeEdgeUpdate,
    DecisionTreeGuideCreate,
    DecisionTreeGuideUpdate,
    DecisionTreeNodeCreate,
    DecisionTreeNodeUpdate,
    DecisionTreeVersionCreate,
    TraineeAnswerSubmit,
    TraineeTreeStart,
    VersionStatusChange,
)
from app.services import decision_tree_service as svc

router = APIRouter(prefix="/decision-trees", tags=["Decision Trees"])


# ---------------------------------------------------------------------------
# Guide CRUD  (experts: knowledge.create)
# ---------------------------------------------------------------------------

@router.get("")
def list_guides(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.list_guides(db, machine_id=machine_id)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_guide(
    payload: DecisionTreeGuideCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    guide = svc.create_guide(db, owner=auth_ctx.user, **payload.model_dump())
    return svc.guide_detail(db, guide.id)


@router.get("/{guide_id}")
def get_guide(
    guide_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.guide_detail(db, guide_id)


@router.patch("/{guide_id}", dependencies=[Depends(csrf_protect)])
def update_guide(
    guide_id: str,
    payload: DecisionTreeGuideUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    svc.update_guide(db, guide_id, auth_ctx.user.id, **payload.model_dump(exclude_unset=True))
    return svc.guide_detail(db, guide_id)


@router.delete("/{guide_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(csrf_protect)])
def delete_guide(
    guide_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    svc.delete_guide(db, guide_id, auth_ctx.user.id)


# ---------------------------------------------------------------------------
# Version lifecycle
# ---------------------------------------------------------------------------

@router.post("/{guide_id}/versions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_version(
    guide_id: str,
    payload: DecisionTreeVersionCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    version = svc.create_new_version(db, guide_id, auth_ctx.user.id, payload.revision_reason)
    return svc.version_detail(db, version.id)


@router.get("/versions/{version_id}")
def get_version_detail(
    version_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.version_detail(db, version_id)


@router.post("/versions/{version_id}/status", dependencies=[Depends(csrf_protect)])
def change_version_status(
    version_id: str,
    payload: VersionStatusChange,
    auth_ctx: AuthenticatedContext = Depends(require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    version = svc.change_version_status(db, version_id, payload.action, auth_ctx.user, payload.reason)
    return svc.version_detail(db, version.id)


# ---------------------------------------------------------------------------
# Node CRUD  (draft versions only)
# ---------------------------------------------------------------------------

@router.post("/versions/{version_id}/nodes", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def add_node(
    version_id: str,
    payload: DecisionTreeNodeCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    node = svc.add_node(db, version_id, **payload.model_dump())
    return svc._node_payload(node)


@router.patch("/nodes/{node_id}", dependencies=[Depends(csrf_protect)])
def update_node(
    node_id: str,
    payload: DecisionTreeNodeUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    node = svc.update_node(db, node_id, **payload.model_dump(exclude_unset=True))
    return svc._node_payload(node)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(csrf_protect)])
def delete_node(
    node_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    svc.delete_node(db, node_id)


@router.patch("/versions/{version_id}/positions", dependencies=[Depends(csrf_protect)])
def batch_update_positions(
    version_id: str,
    payload: BatchPositionUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    svc.batch_update_positions(db, version_id, [p.model_dump() for p in payload.positions])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Edge CRUD  (draft versions only)
# ---------------------------------------------------------------------------

@router.post("/versions/{version_id}/edges", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def add_edge(
    version_id: str,
    payload: DecisionTreeEdgeCreate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    edge = svc.add_edge(db, version_id, **payload.model_dump())
    return {"id": edge.id, "from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id, "label": edge.label, "condition": edge.condition}


@router.patch("/edges/{edge_id}", dependencies=[Depends(csrf_protect)])
def update_edge(
    edge_id: str,
    payload: DecisionTreeEdgeUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    edge = svc.update_edge(db, edge_id, **payload.model_dump(exclude_unset=True))
    return {"id": edge.id, "from_node_id": edge.from_node_id, "to_node_id": edge.to_node_id, "label": edge.label, "condition": edge.condition}


@router.delete("/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(csrf_protect)])
def delete_edge(
    edge_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    svc.delete_edge(db, edge_id)


# ---------------------------------------------------------------------------
# Trainee walk-through (anyone with troubleshoot.use)
# ---------------------------------------------------------------------------

@router.post("/walk", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def start_walk(
    payload: TraineeTreeStart,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.start_walk(db, auth_ctx.user, payload.guide_id, payload.machine_id)


@router.get("/walk/{session_id}")
def get_walk(
    session_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.get_walk(db, session_id, auth_ctx.user.id)


@router.post("/walk/{session_id}/answer", dependencies=[Depends(csrf_protect)])
def answer_walk(
    session_id: str,
    payload: TraineeAnswerSubmit,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return svc.answer_walk(db, session_id, auth_ctx.user.id, payload.edge_id)
