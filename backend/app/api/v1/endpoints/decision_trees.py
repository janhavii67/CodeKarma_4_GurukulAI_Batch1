"""Decision tree endpoints: expert builder, AI assistance and trainee walk-through."""
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    require_any_permission,
    require_permission,
    PERM_KNOWLEDGE_APPROVE,
    PERM_KNOWLEDGE_CREATE,
    PERM_TROUBLESHOOT_USE,
)
from app.db.session import get_db
from app.schemas.decision_tree import (
    AIDraftRequest,
    AnswerOrder,
    BatchPositionUpdate,
    DecisionTreeEdgeCreate,
    DecisionTreeEdgeUpdate,
    DecisionTreeGuideCreate,
    DecisionTreeGuideUpdate,
    DecisionTreeNodeCreate,
    DecisionTreeNodeUpdate,
    DecisionTreeVersionCreate,
    GraphSnapshot,
    TraineeAnswerSubmit,
    TraineeEscalate,
    TraineeExplain,
    TraineeGoBack,
    TraineeTreeStart,
    VersionStatusChange,
)
from app.services import decision_tree_ai_service as ai
from app.services import decision_tree_service as svc
from app.services import decision_tree_walk_service as walk

router = APIRouter(prefix="/decision-trees", tags=["Decision Trees"])

expert = require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_KNOWLEDGE_APPROVE)
reader = require_any_permission(PERM_KNOWLEDGE_CREATE, PERM_KNOWLEDGE_APPROVE, PERM_TROUBLESHOOT_USE)
trainee = require_permission(PERM_TROUBLESHOOT_USE)
csrf = [Depends(csrf_protect)]


def _version_response(db: Session, version) -> dict:
    return svc.version_detail(db, version)


def _node_version(db: Session, node_id: str, auth: AuthenticatedContext):
    node = svc.get_node(db, node_id)
    version = svc.editable_version(db, node.version_id, auth.user, auth.permissions)
    return node, version


def _edge_version(db: Session, edge_id: str, auth: AuthenticatedContext):
    edge = svc.get_edge(db, edge_id)
    version = svc.editable_version(db, edge.version_id, auth.user, auth.permissions)
    return edge, version


# ---------------------------------------------------------------------------
# Trainee walk-through (registered first so "/walk" is not read as a guide id)
# ---------------------------------------------------------------------------

@router.get("/catalog")
def trainee_catalog(machine_id: Optional[str] = None, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.catalog(db, machine_id=machine_id)


@router.get("/walk/my")
def my_walks(auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.history(db, auth.user)


@router.post("/walk", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def start_walk(payload: TraineeTreeStart, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.walk_state(db, walk.start_walk(db, auth.user, payload.guide_id))


@router.get("/walk/{session_id}")
def get_walk(session_id: str, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.walk_state(db, walk.get_walk(db, session_id, auth.user))


@router.post("/walk/{session_id}/answer", dependencies=csrf)
def answer_walk(session_id: str, payload: TraineeAnswerSubmit, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.walk_state(db, walk.answer(db, session_id, auth.user, payload.edge_id))


@router.post("/walk/{session_id}/back", dependencies=csrf)
def go_back(session_id: str, payload: TraineeGoBack, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.walk_state(db, walk.go_back(db, session_id, auth.user, payload.step_index))


@router.post("/walk/{session_id}/restart", dependencies=csrf)
def restart_walk(session_id: str, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    return walk.walk_state(db, walk.restart(db, session_id, auth.user))


@router.post("/walk/{session_id}/escalate", dependencies=csrf)
def escalate_walk(session_id: str, payload: TraineeEscalate, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    from app.services.audit_service import AuditService
    session = walk.escalate(db, session_id, auth.user, payload.reason)
    AuditService.log(db, "decision_tree.walk_escalated", "troubleshooting_session", session.id, auth.user.id, {}, commit=True)
    return walk.walk_state(db, session)


@router.post("/walk/{session_id}/explain", dependencies=csrf)
def explain_step(session_id: str, payload: TraineeExplain, auth: AuthenticatedContext = Depends(trainee), db: Session = Depends(get_db)):
    session = walk.get_walk(db, session_id, auth.user)
    return ai.explain_for_trainee(db, auth.user, session, payload.question)


# ---------------------------------------------------------------------------
# Trees
# ---------------------------------------------------------------------------

@router.get("")
def list_guides(machine_id: Optional[str] = None, include_archived: bool = False,
                auth: AuthenticatedContext = Depends(reader), db: Session = Depends(get_db)):
    return svc.list_guides(db, auth.permissions, machine_id=machine_id, include_archived=include_archived)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def create_guide(payload: DecisionTreeGuideCreate, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
                 db: Session = Depends(get_db)):
    guide = svc.create_guide(db, owner=auth.user, **payload.model_dump())
    return svc.guide_payload(db, guide, include_versions=True)


@router.get("/versions/{version_id}")
def get_version(version_id: str, auth: AuthenticatedContext = Depends(reader), db: Session = Depends(get_db)):
    return _version_response(db, svc.readable_version(db, version_id, auth.permissions))


@router.get("/versions/{version_id}/validation")
def validate_version(version_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    return {"issues": svc.validate_version(db, svc.get_version(db, version_id))}


@router.post("/versions/{version_id}/status", dependencies=csrf)
def change_version_status(version_id: str, payload: VersionStatusChange, auth: AuthenticatedContext = Depends(expert),
                          db: Session = Depends(get_db)):
    version = svc.change_version_status(db, svc.get_version(db, version_id), payload.action, auth.user, auth.permissions, payload.reason)
    return _version_response(db, version)


@router.put("/versions/{version_id}/graph", dependencies=csrf)
def replace_graph(version_id: str, payload: GraphSnapshot, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    version = svc.editable_version(db, version_id, auth.user, auth.permissions)
    return _version_response(db, svc.replace_graph(db, version, payload.nodes, payload.edges))


@router.patch("/versions/{version_id}/positions", dependencies=csrf)
def batch_update_positions(version_id: str, payload: BatchPositionUpdate, auth: AuthenticatedContext = Depends(expert),
                           db: Session = Depends(get_db)):
    version = svc.editable_version(db, version_id, auth.user, auth.permissions)
    svc.batch_update_positions(db, version, [p.model_dump() for p in payload.positions])
    return {"ok": True}


@router.post("/versions/{version_id}/nodes", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def add_node(version_id: str, payload: DecisionTreeNodeCreate, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    version = svc.editable_version(db, version_id, auth.user, auth.permissions)
    fields = payload.model_dump(exclude={"connect_from"}, exclude_unset=True)
    fields.setdefault("node_type", payload.node_type)
    fields.setdefault("title", payload.title)
    node = svc.add_node(db, version, fields, connect_from=payload.connect_from.model_dump() if payload.connect_from else None)
    db.expire_all()
    return {"node": svc.node_payload(svc.get_node(db, node.id)), "version": _version_response(db, svc.get_version(db, version_id))}


@router.patch("/nodes/{node_id}", dependencies=csrf)
def update_node(node_id: str, payload: DecisionTreeNodeUpdate, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    node, _ = _node_version(db, node_id, auth)
    return svc.node_payload(svc.update_node(db, node, payload.model_dump(exclude_unset=True)))


@router.post("/nodes/{node_id}/duplicate", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def duplicate_node(node_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    node, version = _node_version(db, node_id, auth)
    copy = svc.duplicate_node(db, node)
    db.expire_all()
    return {"node": svc.node_payload(svc.get_node(db, copy.id)), "version": _version_response(db, svc.get_version(db, version.id))}


@router.delete("/nodes/{node_id}", dependencies=csrf)
def delete_node(node_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    node, version = _node_version(db, node_id, auth)
    svc.delete_node(db, node)
    db.expire_all()
    return _version_response(db, svc.get_version(db, version.id))


@router.put("/nodes/{node_id}/answer-order", dependencies=csrf)
def reorder_answers(node_id: str, payload: AnswerOrder, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    node, version = _node_version(db, node_id, auth)
    svc.reorder_answers(db, node, payload.edge_ids)
    db.expire_all()
    return _version_response(db, svc.get_version(db, version.id))


@router.post("/nodes/{node_id}/assist", dependencies=csrf)
def assist_step(node_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    node = svc.get_node(db, node_id)
    version = svc.get_version(db, node.version_id)
    svc.assert_can_manage(version.guide, auth.user, auth.permissions)
    return ai.assist_step(db, auth.user, version, node)


@router.post("/versions/{version_id}/edges", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def add_edge(version_id: str, payload: DecisionTreeEdgeCreate, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    version = svc.editable_version(db, version_id, auth.user, auth.permissions)
    return svc.edge_payload(svc.add_edge(db, version, payload.from_node_id, payload.label, payload.to_node_id, payload.condition))


@router.patch("/edges/{edge_id}", dependencies=csrf)
def update_edge(edge_id: str, payload: DecisionTreeEdgeUpdate, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    edge, _ = _edge_version(db, edge_id, auth)
    return svc.edge_payload(svc.update_edge(db, edge, payload.model_dump(exclude_unset=True)))


@router.delete("/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=csrf)
def delete_edge(edge_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    edge, _ = _edge_version(db, edge_id, auth)
    svc.delete_edge(db, edge)


@router.post("/versions/{version_id}/ai/draft", dependencies=csrf)
def ai_generate_draft(version_id: str, payload: AIDraftRequest, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
                      db: Session = Depends(get_db)):
    version = svc.editable_version(db, version_id, auth.user, auth.permissions)
    return ai.generate_draft(db, auth.user, version, payload.prompt, replace=payload.replace)


@router.post("/versions/{version_id}/ai/review", dependencies=csrf)
def ai_review(version_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    version = svc.get_version(db, version_id)
    svc.assert_can_manage(version.guide, auth.user, auth.permissions)
    return ai.review_tree(db, auth.user, version)


# ---------------------------------------------------------------------------
# Single tree (path parameter routes last)
# ---------------------------------------------------------------------------

@router.get("/{guide_id}")
def get_guide(guide_id: str, auth: AuthenticatedContext = Depends(reader), db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    editor = svc.is_editor(auth.permissions)
    if not editor and (guide.is_archived or not guide.current_published_version_id):
        from app.core.exceptions import NotFoundError
        raise NotFoundError(code="guide_not_found", message="Decision tree not found.")
    return svc.guide_payload(db, guide, include_versions=editor, published_only=not editor,
                             session_counts=svc.session_counts(db, [guide.id]) if editor else None)


@router.patch("/{guide_id}", dependencies=csrf)
def update_guide(guide_id: str, payload: DecisionTreeGuideUpdate, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    svc.assert_can_manage(guide, auth.user, auth.permissions)
    svc.update_guide(db, guide, payload.model_dump(exclude_unset=True))
    return svc.guide_payload(db, guide, include_versions=True)


@router.post("/{guide_id}/archive", dependencies=csrf)
def archive_guide(guide_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    svc.assert_can_manage(guide, auth.user, auth.permissions)
    return svc.guide_payload(db, svc.set_archived(db, guide, True))


@router.post("/{guide_id}/restore", dependencies=csrf)
def restore_guide(guide_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    svc.assert_can_manage(guide, auth.user, auth.permissions)
    return svc.guide_payload(db, svc.set_archived(db, guide, False))


@router.post("/{guide_id}/duplicate", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def duplicate_guide(guide_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
                    db: Session = Depends(get_db)):
    copy = svc.duplicate_guide(db, svc.get_guide(db, guide_id), auth.user)
    return svc.guide_payload(db, copy, include_versions=True)


@router.delete("/{guide_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=csrf)
def delete_guide(guide_id: str, auth: AuthenticatedContext = Depends(expert), db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    svc.assert_can_manage(guide, auth.user, auth.permissions)
    svc.delete_guide(db, guide)


@router.post("/{guide_id}/versions", status_code=status.HTTP_201_CREATED, dependencies=csrf)
def create_version(guide_id: str, payload: DecisionTreeVersionCreate, auth: AuthenticatedContext = Depends(expert),
                   db: Session = Depends(get_db)):
    guide = svc.get_guide(db, guide_id)
    svc.assert_can_manage(guide, auth.user, auth.permissions)
    return _version_response(db, svc.create_new_version(db, guide, auth.user.id, payload.revision_reason))
