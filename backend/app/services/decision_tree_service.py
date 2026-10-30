"""Expert decision-tree builder and trainee walk-through service."""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.db.base import generate_uuid, utc_now
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.troubleshooting import (
    GUIDE_STATUS_DRAFT,
    GUIDE_STATUS_IN_REVIEW,
    GUIDE_STATUS_PUBLISHED,
    GUIDE_STATUS_SUPERSEDED,
    GUIDE_STATUS_WITHDRAWN,
    TroubleshootingEdge,
    TroubleshootingGuide,
    TroubleshootingNode,
    TroubleshootingResponse,
    TroubleshootingSession,
    TroubleshootingVersion,
    decision_tree_node_media,
)
from app.models.user import User

VALID_NODE_TYPES = {"check", "question", "action", "stop", "escalation", "end"}
TERMINAL_NODE_TYPES = {"stop", "end", "escalation"}


# ---------------------------------------------------------------------------
# Guide CRUD
# ---------------------------------------------------------------------------

def list_guides(db: Session, *, machine_id: str | None = None) -> list[dict]:
    query = db.query(TroubleshootingGuide).order_by(TroubleshootingGuide.title)
    if machine_id:
        query = query.filter(TroubleshootingGuide.machine_id == machine_id)
    items = []
    for guide in query.all():
        machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
        draft = next((v for v in guide.versions if v.status == GUIDE_STATUS_DRAFT), None)
        items.append({
            "id": guide.id,
            "title": guide.title,
            "problem_category": guide.problem_category,
            "machine_id": guide.machine_id,
            "machine_name": machine.name if machine else None,
            "severity": guide.severity,
            "current_published_version_id": guide.current_published_version_id,
            "draft_version_id": draft.id if draft else None,
            "created_at": guide.created_at,
            "updated_at": guide.updated_at,
        })
    return items


def create_guide(db: Session, *, owner: User, title: str, problem_category: str,
                 machine_id: str | None = None, severity: str = "MEDIUM") -> TroubleshootingGuide:
    if machine_id and not db.get(Machine, machine_id):
        raise ValidationError(code="machine_not_found", message="Select a registered machine.")
    guide = TroubleshootingGuide(
        title=title.strip(),
        problem_category=problem_category.strip().upper(),
        machine_id=machine_id,
        severity=severity,
        owner_id=owner.id,
    )
    db.add(guide)
    db.flush()  # generate guide.id
    # Auto-create first draft version
    version = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=1,
        status=GUIDE_STATUS_DRAFT,
        author_id=owner.id,
    )
    db.add(version)
    db.commit()
    db.refresh(guide)
    return guide


def get_guide(db: Session, guide_id: str) -> TroubleshootingGuide:
    guide = db.get(TroubleshootingGuide, guide_id)
    if not guide:
        raise NotFoundError(code="guide_not_found", message="Decision tree not found.")
    return guide


def update_guide(db: Session, guide_id: str, owner_id: str, **fields: Any) -> TroubleshootingGuide:
    guide = get_guide(db, guide_id)
    if guide.owner_id != owner_id:
        raise ForbiddenError(code="not_owner", message="Only the owner can edit this decision tree.")
    for key, value in fields.items():
        if value is not None:
            if key == "machine_id" and not db.get(Machine, value):
                raise ValidationError(code="machine_not_found", message="Select a registered machine.")
            setattr(guide, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(guide)
    return guide


def delete_guide(db: Session, guide_id: str, owner_id: str) -> None:
    guide = get_guide(db, guide_id)
    if guide.owner_id != owner_id:
        raise ForbiddenError(code="not_owner", message="Only the owner can delete this decision tree.")
    if guide.current_published_version_id:
        raise ValidationError(code="has_published_version", message="Withdraw the published version before deleting.")
    db.delete(guide)
    db.commit()


# ---------------------------------------------------------------------------
# Version lifecycle
# ---------------------------------------------------------------------------

def get_version(db: Session, version_id: str) -> TroubleshootingVersion:
    version = db.get(TroubleshootingVersion, version_id)
    if not version:
        raise NotFoundError(code="version_not_found", message="Decision tree version not found.")
    return version


def _ensure_draft(version: TroubleshootingVersion) -> None:
    if version.status != GUIDE_STATUS_DRAFT:
        raise ValidationError(code="version_not_draft", message="Only draft versions can be edited.")


def create_new_version(db: Session, guide_id: str, author_id: str, revision_reason: str | None = None) -> TroubleshootingVersion:
    guide = get_guide(db, guide_id)
    existing_draft = next((v for v in guide.versions if v.status == GUIDE_STATUS_DRAFT), None)
    if existing_draft:
        raise ValidationError(code="draft_exists", message="A draft version already exists. Edit or discard it first.")
    max_num = max((v.version_number for v in guide.versions), default=0)
    version = TroubleshootingVersion(
        guide_id=guide.id,
        version_number=max_num + 1,
        status=GUIDE_STATUS_DRAFT,
        author_id=author_id,
        revision_reason=revision_reason,
    )
    db.add(version)
    # Copy nodes and edges from published version if one exists
    db.flush()
    source = db.get(TroubleshootingVersion, guide.current_published_version_id) if guide.current_published_version_id else None
    if source:
        # Ensure relationships are loaded (important in nested transactions)
        source_nodes = list(source.nodes)
        source_edges = list(source.edges)
        node_map: dict[str, str] = {}
        for node in source_nodes:
            new_id = generate_uuid()
            node_map[node.id] = new_id
            new_node = TroubleshootingNode(
                id=new_id, version_id=version.id, node_type=node.node_type,
                title=node.title, instructions=node.instructions,
                safety_notice=node.safety_notice, safety_warning=node.safety_warning,
                expected_observation=node.expected_observation, input_type=node.input_type,
                input_rules=node.input_rules, is_start=node.is_start,
                position_x=node.position_x, position_y=node.position_y,
                help_text=node.help_text,
                linked_knowledge_version_id=node.linked_knowledge_version_id,
                linked_workflow_version_id=node.linked_workflow_version_id,
                is_root=node.is_root, description=node.description,
            )
            db.add(new_node)
        for edge in source_edges:
            if edge.from_node_id in node_map and edge.to_node_id in node_map:
                db.add(TroubleshootingEdge(
                    version_id=version.id,
                    from_node_id=node_map[edge.from_node_id],
                    to_node_id=node_map[edge.to_node_id],
                    label=edge.label, condition=edge.condition,
                ))
    db.commit()
    db.refresh(version)
    return version


def change_version_status(db: Session, version_id: str, action: str, user: User, reason: str | None = None) -> TroubleshootingVersion:
    version = get_version(db, version_id)
    guide = version.guide

    if action == "submit_review":
        if version.status != GUIDE_STATUS_DRAFT:
            raise ValidationError(code="invalid_transition", message="Only drafts can be submitted for review.")
        start_nodes = [n for n in version.nodes if n.is_start]
        if not start_nodes:
            raise ValidationError(code="no_start_node", message="Mark one node as the start node before submitting.")
        version.status = GUIDE_STATUS_IN_REVIEW

    elif action == "approve":
        if version.status != GUIDE_STATUS_IN_REVIEW:
            raise ValidationError(code="invalid_transition", message="Only in-review versions can be approved.")
        # Supersede the previous published version
        if guide.current_published_version_id:
            old = db.get(TroubleshootingVersion, guide.current_published_version_id)
            if old:
                old.status = GUIDE_STATUS_SUPERSEDED
        version.status = GUIDE_STATUS_PUBLISHED
        version.published_at = utc_now()
        guide.current_published_version_id = version.id

    elif action == "reject":
        if version.status != GUIDE_STATUS_IN_REVIEW:
            raise ValidationError(code="invalid_transition", message="Only in-review versions can be rejected.")
        version.status = GUIDE_STATUS_DRAFT
        version.revision_reason = reason

    elif action == "withdraw":
        if version.status != GUIDE_STATUS_PUBLISHED:
            raise ValidationError(code="invalid_transition", message="Only published versions can be withdrawn.")
        version.status = GUIDE_STATUS_WITHDRAWN
        if guide.current_published_version_id == version.id:
            guide.current_published_version_id = None
    else:
        raise ValidationError(code="unknown_action", message=f"Unknown action '{action}'.")

    db.commit()
    db.refresh(version)
    return version


# ---------------------------------------------------------------------------
# Node CRUD
# ---------------------------------------------------------------------------

def _sync_node_media(db: Session, node: TroubleshootingNode, media_ids: list[str] | None) -> None:
    if media_ids is None:
        return
    db.execute(decision_tree_node_media.delete().where(decision_tree_node_media.c.node_id == node.id))
    for order, mid in enumerate(media_ids):
        asset = db.get(MediaAsset, mid)
        if not asset:
            raise ValidationError(code="media_not_found", message=f"Media asset '{mid}' not found.")
        db.execute(decision_tree_node_media.insert().values(node_id=node.id, media_id=mid, sort_order=order))


def add_node(db: Session, version_id: str, **fields: Any) -> TroubleshootingNode:
    version = get_version(db, version_id)
    _ensure_draft(version)
    media_ids = fields.pop("media_asset_ids", None)
    node = TroubleshootingNode(version_id=version.id, **fields)
    db.add(node)
    db.flush()
    _sync_node_media(db, node, media_ids)
    db.commit()
    db.refresh(node)
    return node


def update_node(db: Session, node_id: str, **fields: Any) -> TroubleshootingNode:
    node = db.get(TroubleshootingNode, node_id)
    if not node:
        raise NotFoundError(code="node_not_found", message="Decision tree node not found.")
    version = get_version(db, node.version_id)
    _ensure_draft(version)
    media_ids = fields.pop("media_asset_ids", None)
    for key, value in fields.items():
        if value is not None:
            setattr(node, key, value)
    _sync_node_media(db, node, media_ids)
    db.commit()
    db.refresh(node)
    return node


def delete_node(db: Session, node_id: str) -> None:
    node = db.get(TroubleshootingNode, node_id)
    if not node:
        raise NotFoundError(code="node_not_found", message="Decision tree node not found.")
    version = get_version(db, node.version_id)
    _ensure_draft(version)
    db.delete(node)
    db.commit()


def batch_update_positions(db: Session, version_id: str, positions: list[dict]) -> None:
    version = get_version(db, version_id)
    _ensure_draft(version)
    node_ids = {n.id for n in version.nodes}
    for pos in positions:
        if pos["id"] not in node_ids:
            raise NotFoundError(code="node_not_found", message=f"Node '{pos['id']}' not in this version.")
        node = db.get(TroubleshootingNode, pos["id"])
        node.position_x = pos["position_x"]
        node.position_y = pos["position_y"]
    db.commit()


# ---------------------------------------------------------------------------
# Edge CRUD
# ---------------------------------------------------------------------------

def add_edge(db: Session, version_id: str, from_node_id: str, to_node_id: str, label: str, condition: str | None = None) -> TroubleshootingEdge:
    version = get_version(db, version_id)
    _ensure_draft(version)
    node_ids = {n.id for n in version.nodes}
    if from_node_id not in node_ids or to_node_id not in node_ids:
        raise ValidationError(code="node_not_in_version", message="Both nodes must belong to this version.")
    if from_node_id == to_node_id:
        raise ValidationError(code="self_loop", message="An edge cannot connect a node to itself.")
    edge = TroubleshootingEdge(
        version_id=version.id,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        label=label.strip(),
        condition=condition,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


def update_edge(db: Session, edge_id: str, **fields: Any) -> TroubleshootingEdge:
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge:
        raise NotFoundError(code="edge_not_found", message="Decision tree edge not found.")
    version = get_version(db, edge.version_id)
    _ensure_draft(version)
    for key, value in fields.items():
        if value is not None:
            setattr(edge, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(edge)
    return edge


def delete_edge(db: Session, edge_id: str) -> None:
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge:
        raise NotFoundError(code="edge_not_found", message="Decision tree edge not found.")
    version = get_version(db, edge.version_id)
    _ensure_draft(version)
    db.delete(edge)
    db.commit()


# ---------------------------------------------------------------------------
# Version detail (full canvas payload)
# ---------------------------------------------------------------------------

def _node_payload(node: TroubleshootingNode) -> dict:
    return {
        "id": node.id,
        "node_type": node.node_type,
        "title": node.title,
        "instructions": node.instructions,
        "safety_warning": node.safety_warning,
        "help_text": node.help_text,
        "expected_observation": node.expected_observation,
        "input_type": node.input_type,
        "input_rules": node.input_rules,
        "is_start": node.is_start,
        "position_x": node.position_x,
        "position_y": node.position_y,
        "linked_knowledge_version_id": node.linked_knowledge_version_id,
        "linked_workflow_version_id": node.linked_workflow_version_id,
        "media": [
            {"id": asset.id, "title": asset.title or asset.original_name, "kind": asset.kind, "mime": asset.mime}
            for asset in (node.media_assets or [])
        ],
    }


def version_detail(db: Session, version_id: str) -> dict:
    version = get_version(db, version_id)
    author = db.get(User, version.author_id)
    return {
        "id": version.id,
        "guide_id": version.guide_id,
        "version_number": version.version_number,
        "status": version.status,
        "revision_reason": version.revision_reason,
        "author_id": version.author_id,
        "author_name": author.name if author else None,
        "created_at": version.created_at,
        "published_at": version.published_at,
        "nodes": [_node_payload(n) for n in version.nodes],
        "edges": [
            {"id": e.id, "from_node_id": e.from_node_id, "to_node_id": e.to_node_id, "label": e.label, "condition": e.condition}
            for e in version.edges
        ],
    }


def guide_detail(db: Session, guide_id: str) -> dict:
    guide = get_guide(db, guide_id)
    machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
    owner = db.get(User, guide.owner_id)
    draft = next((v for v in guide.versions if v.status == GUIDE_STATUS_DRAFT), None)
    return {
        "id": guide.id,
        "title": guide.title,
        "problem_category": guide.problem_category,
        "machine_id": guide.machine_id,
        "machine_name": machine.name if machine else None,
        "severity": guide.severity,
        "owner_id": guide.owner_id,
        "owner_name": owner.name if owner else None,
        "current_published_version_id": guide.current_published_version_id,
        "draft_version_id": draft.id if draft else None,
        "created_at": guide.created_at,
        "updated_at": guide.updated_at,
        "versions": [
            {
                "id": v.id,
                "version_number": v.version_number,
                "status": v.status,
                "author_id": v.author_id,
                "author_name": (db.get(User, v.author_id) or User()).name if v.author_id else None,
                "created_at": v.created_at,
                "published_at": v.published_at,
            }
            for v in sorted(guide.versions, key=lambda v: v.version_number)
        ],
    }


# ---------------------------------------------------------------------------
# Trainee walk-through
# ---------------------------------------------------------------------------

def _published_version(db: Session, guide_id: str) -> TroubleshootingVersion:
    guide = get_guide(db, guide_id)
    if not guide.current_published_version_id:
        raise NotFoundError(code="no_published_version", message="This decision tree has no published version yet.")
    return get_version(db, guide.current_published_version_id)


def start_walk(db: Session, user: User, guide_id: str, machine_id: str | None = None) -> dict:
    version = _published_version(db, guide_id)
    guide = version.guide
    start_node = next((n for n in version.nodes if n.is_start), None)
    if not start_node:
        raise ValidationError(code="no_start_node", message="This decision tree has no start node.")
    session = TroubleshootingSession(
        user_id=user.id,
        guide_version_id=version.id,
        machine_id=machine_id or guide.machine_id,
        reported_symptom=f"Decision tree: {guide.title}",
        current_node_id=start_node.id,
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _walk_state(db, session)


def answer_walk(db: Session, session_id: str, user_id: str, edge_id: str) -> dict:
    session = db.get(TroubleshootingSession, session_id)
    if not session or session.user_id != user_id:
        raise NotFoundError(code="session_not_found", message="Walk-through session not found.")
    if session.status != "in_progress":
        raise ValidationError(code="session_ended", message="This walk-through has already ended.")
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge or edge.from_node_id != session.current_node_id:
        raise ValidationError(code="invalid_edge", message="This answer is not available from the current step.")
    # Record the response
    response = TroubleshootingResponse(
        session_id=session.id,
        node_id=session.current_node_id,
        answer=json.dumps({"edge_id": edge.id, "label": edge.label}),
        edge_taken_id=edge.id,
    )
    db.add(response)
    # Move to next node
    next_node = db.get(TroubleshootingNode, edge.to_node_id)
    session.current_node_id = next_node.id
    if next_node.node_type in TERMINAL_NODE_TYPES:
        session.status = "resolved" if next_node.node_type == "end" else ("escalated" if next_node.node_type == "escalation" else "unresolved")
        session.ended_at = utc_now()
    db.commit()
    db.refresh(session)
    return _walk_state(db, session)


def get_walk(db: Session, session_id: str, user_id: str) -> dict:
    session = db.get(TroubleshootingSession, session_id)
    if not session or session.user_id != user_id:
        raise NotFoundError(code="session_not_found", message="Walk-through session not found.")
    return _walk_state(db, session)


def _walk_state(db: Session, session: TroubleshootingSession) -> dict:
    version = db.get(TroubleshootingVersion, session.guide_version_id)
    guide = version.guide if version else None
    current_node = db.get(TroubleshootingNode, session.current_node_id)
    machine = db.get(Machine, session.machine_id) if session.machine_id else None
    edges = [e for e in (version.edges if version else []) if e.from_node_id == session.current_node_id]
    path = []
    for r in session.responses:
        node = db.get(TroubleshootingNode, r.node_id) if r.node_id else None
        try:
            answer_data = json.loads(r.answer)
        except (ValueError, TypeError):
            answer_data = {"observation": r.answer}
        path.append({
            "node_id": r.node_id,
            "node_title": node.title if node else None,
            "answer_label": answer_data.get("label", answer_data.get("observation", "")),
            "recorded_at": r.server_timestamp,
        })
    return {
        "session_id": session.id,
        "guide_id": guide.id if guide else None,
        "guide_title": guide.title if guide else "",
        "version_id": session.guide_version_id,
        "machine_id": session.machine_id,
        "machine_name": machine.name if machine else None,
        "current_node": _node_payload(current_node) if current_node else None,
        "available_edges": [
            {"id": e.id, "from_node_id": e.from_node_id, "to_node_id": e.to_node_id, "label": e.label, "condition": e.condition}
            for e in edges
        ],
        "path": path,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }
