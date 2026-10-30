"""Trainee walk-through of published decision trees.

A walk is a ``TroubleshootingSession`` bound to one immutable published version. Each answer
is a ``TroubleshootingResponse``; going back or changing an earlier answer marks every later
response ``superseded`` (kept for audit) so the active path is always consistent.
"""
from __future__ import annotations

import json
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.db.base import utc_now
from app.models.knowledge import KnowledgeVersion
from app.models.machine import Machine
from app.models.procedure import Procedure
from app.models.troubleshooting import (
    TroubleshootingEdge,
    TroubleshootingEscalation,
    TroubleshootingGuide,
    TroubleshootingNode,
    TroubleshootingResponse,
    TroubleshootingSession,
    TroubleshootingVersion,
)
from app.models.user import User
from app.services.decision_tree_service import (
    TERMINAL_NODE_TYPES,
    edge_payload,
    get_guide,
    guide_payload,
    media_payload,
    node_payload,
)

SUPERSEDED = "superseded"
WALK_KIND = "decision_tree"
END_STATUS = {"result": "resolved", "end": "resolved", "stop": "unresolved", "escalation": "escalated"}


def catalog(db: Session, *, machine_id: str | None = None) -> dict:
    """Published, non-archived trees grouped by machine for the trainee problem picker."""
    query = db.query(TroubleshootingGuide).filter(
        TroubleshootingGuide.current_published_version_id.isnot(None), TroubleshootingGuide.is_archived.is_(False))
    if machine_id:
        query = query.filter(TroubleshootingGuide.machine_id == machine_id)
    guides = query.order_by(TroubleshootingGuide.title).all()
    trees = [guide_payload(db, guide, published_only=True) for guide in guides]
    machines: dict[str, dict] = {}
    for tree in trees:
        key = tree["machine_id"] or "general"
        entry = machines.setdefault(key, {
            "id": tree["machine_id"],
            "name": tree["machine_name"] or "General equipment",
            "category": tree["machine_category"],
            "cover_media": None,
            "tree_count": 0,
            "problem_categories": [],
        })
        entry["tree_count"] += 1
        entry["cover_media"] = entry["cover_media"] or tree["cover_media"]
        if tree["problem_category"] not in entry["problem_categories"]:
            entry["problem_categories"].append(tree["problem_category"])
    return {"machines": sorted(machines.values(), key=lambda m: m["name"].lower()), "trees": trees}


def _owned_session(db: Session, session_id: str, user: User) -> TroubleshootingSession:
    session = db.get(TroubleshootingSession, session_id)
    if not session or not session.guide_version_id or (session.user_id != user.id and user.role_id != "ADMIN"):
        raise NotFoundError(code="session_not_found", message="Troubleshooting session not found.")
    return session


def _active_responses(session: TroubleshootingSession) -> list[TroubleshootingResponse]:
    return [r for r in session.responses if r.outcome != SUPERSEDED]


def start_walk(db: Session, user: User, guide_id: str) -> TroubleshootingSession:
    guide = get_guide(db, guide_id)
    if guide.is_archived or not guide.current_published_version_id:
        raise NotFoundError(code="no_published_version", message="This decision tree has no published version yet.")
    version = db.get(TroubleshootingVersion, guide.current_published_version_id)
    start = next((n for n in version.nodes if n.is_start), None)
    if not start:
        raise ValidationError(code="no_start_node", message="This decision tree has no start step.")
    session = TroubleshootingSession(
        user_id=user.id,
        guide_version_id=version.id,
        machine_id=guide.machine_id,
        problem_category=guide.problem_category,
        reported_symptom=guide.title,
        current_node_id=start.id,
        context={"kind": WALK_KIND, "guide_id": guide.id},
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def answer(db: Session, session_id: str, user: User, edge_id: str) -> TroubleshootingSession:
    session = _owned_session(db, session_id, user)
    if session.status != "in_progress":
        raise ValidationError(code="session_ended", message="This troubleshooting session has already ended. Go back or restart to continue.")
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge or edge.version_id != session.guide_version_id or edge.from_node_id != session.current_node_id or not edge.to_node_id:
        raise ValidationError(code="invalid_answer", message="That answer is not available for the current step.")
    db.add(TroubleshootingResponse(
        session_id=session.id, node_id=session.current_node_id, edge_taken_id=edge.id, outcome="answered",
        answer=json.dumps({"edge_id": edge.id, "label": edge.label}), server_timestamp=utc_now(),
    ))
    next_node = db.get(TroubleshootingNode, edge.to_node_id)
    session.current_node_id = next_node.id
    if next_node.node_type in TERMINAL_NODE_TYPES:
        session.status = END_STATUS.get(next_node.node_type, "resolved")
        session.ended_at = utc_now()
    db.commit()
    db.refresh(session)
    return session


def go_back(db: Session, session_id: str, user: User, step_index: int) -> TroubleshootingSession:
    """Return to the step answered at ``step_index``; that answer and everything after it is superseded."""
    session = _owned_session(db, session_id, user)
    if session.status == "escalated":
        raise ValidationError(code="session_escalated", message="This session was escalated to an expert. Start a new session to troubleshoot again.")
    active = _active_responses(session)
    if step_index < 0 or step_index >= len(active):
        raise ValidationError(code="step_not_found", message="That step is not part of your current path.")
    for response in active[step_index:]:
        response.outcome = SUPERSEDED
    session.current_node_id = active[step_index].node_id
    session.status = "in_progress"
    session.ended_at = None
    db.commit()
    db.refresh(session)
    return session


def restart(db: Session, session_id: str, user: User) -> TroubleshootingSession:
    session = _owned_session(db, session_id, user)
    if session.status == "escalated":
        raise ValidationError(code="session_escalated", message="This session was escalated to an expert. Start a new session instead.")
    version = db.get(TroubleshootingVersion, session.guide_version_id)
    start = next((n for n in version.nodes if n.is_start), None)
    for response in _active_responses(session):
        response.outcome = SUPERSEDED
    session.current_node_id = start.id if start else session.current_node_id
    session.status = "in_progress"
    session.ended_at = None
    db.commit()
    db.refresh(session)
    return session


def escalate(db: Session, session_id: str, user: User, reason: str) -> TroubleshootingSession:
    session = _owned_session(db, session_id, user)
    if session.escalation is not None:
        raise ValidationError(code="already_escalated", message="This session has already been sent to an expert.")
    db.add(TroubleshootingEscalation(session_id=session.id, reason=reason.strip(), status="pending"))
    session.status = "escalated"
    session.ended_at = session.ended_at or utc_now()
    db.commit()
    db.refresh(session)
    return session


def history(db: Session, user: User, limit: int = 50) -> list[dict]:
    sessions = (
        db.query(TroubleshootingSession)
        .filter(TroubleshootingSession.user_id == user.id, TroubleshootingSession.guide_version_id.isnot(None))
        .order_by(TroubleshootingSession.started_at.desc())
        .limit(limit)
        .all()
    )
    rows = []
    for session in sessions:
        version = db.get(TroubleshootingVersion, session.guide_version_id)
        guide = version.guide if version else None
        if not guide:
            continue
        machine = db.get(Machine, session.machine_id) if session.machine_id else None
        current = db.get(TroubleshootingNode, session.current_node_id) if session.current_node_id else None
        active = _active_responses(session)
        rows.append({
            "session_id": session.id,
            "guide_id": guide.id,
            "guide_title": guide.title,
            "machine_name": machine.name if machine else None,
            "status": session.status,
            "steps_answered": len(active),
            "path": [_answer_label(r) for r in active],
            "current_step": current.title if current else None,
            "result_title": current.title if current and current.node_type in TERMINAL_NODE_TYPES else None,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "duration_seconds": _duration(session),
            "is_latest_version": guide.current_published_version_id == session.guide_version_id,
        })
    return rows


def _answer_label(response: TroubleshootingResponse) -> str:
    try:
        return json.loads(response.answer).get("label", "")
    except (TypeError, ValueError):
        return response.answer or ""


def _duration(session: TroubleshootingSession) -> Optional[int]:
    if not session.started_at:
        return None
    end = session.ended_at or utc_now()
    start = session.started_at
    if start.tzinfo is None and end.tzinfo is not None:
        end = end.replace(tzinfo=None)
    return max(0, int((end - start).total_seconds()))


def workflow_info(db: Session, workflow_id: str | None) -> Optional[dict]:
    if not workflow_id:
        return None
    from app.services.procedure_service import is_workflow_currently_published
    procedure = db.get(Procedure, workflow_id)
    if not procedure:
        return {"id": workflow_id, "title": "Guided workflow", "available": False}
    return {"id": procedure.id, "title": procedure.title, "available": is_workflow_currently_published(db, procedure)}


def _walk_node(db: Session, node: TroubleshootingNode) -> dict:
    payload = node_payload(node)
    payload["workflow"] = workflow_info(db, node.linked_workflow_version_id)
    return payload


def _report(db: Session, session: TroubleshootingSession, guide: TroubleshootingGuide,
            path_nodes: list[TroubleshootingNode], result: TroubleshootingNode, active: list[TroubleshootingResponse]) -> dict:
    observations = []
    for response, node in zip(active, path_nodes):
        if node.node_type == "question":
            observations.append({"question": node.title, "answer": _answer_label(response)})
    every_node = path_nodes + [result]
    safety: list[str] = []
    for node in every_node:
        details = node.details or {}
        for text in [node.safety_warning, *(details.get("ppe") or []), *(details.get("precautions") or []),
                     *(details.get("restricted_operations") or [])]:
            if isinstance(text, str) and text.strip() and text.strip() not in safety:
                safety.append(text.strip())
        if node.node_type == "safety" and node.instructions and node.instructions.strip() not in safety:
            safety.append(node.instructions.strip())
    media, seen_media = [], set()
    for node in [result, *reversed(path_nodes)]:
        for asset in node.media_assets or []:
            if asset.id not in seen_media:
                seen_media.add(asset.id)
                media.append(media_payload(asset))
    references, seen_refs = [], set()
    for node in every_node:
        if node.linked_knowledge_version_id and node.linked_knowledge_version_id not in seen_refs:
            seen_refs.add(node.linked_knowledge_version_id)
            kv = db.get(KnowledgeVersion, node.linked_knowledge_version_id)
            if kv and kv.status == "published":
                references.append({"type": "knowledge", "id": kv.id, "item_id": kv.item_id, "title": kv.title})
        for title in (node.details or {}).get("source_titles") or []:
            if title not in seen_refs:
                seen_refs.add(title)
                references.append({"type": "source", "id": None, "item_id": None, "title": title})
    workflow_node = result if result.linked_workflow_version_id else next(
        (n for n in reversed(path_nodes) if n.linked_workflow_version_id), None)
    details = result.details or {}
    machine = db.get(Machine, session.machine_id) if session.machine_id else None
    return {
        "machine_name": machine.name if machine else None,
        "problem": guide.title,
        "result_title": result.title,
        "summary": result.instructions or "",
        "observations": observations,
        "decision_path": [{"step": n.title, "type": n.node_type, "answer": _answer_label(r)} for r, n in zip(active, path_nodes)],
        "possible_causes": details.get("possible_causes") or [],
        "recommended_actions": details.get("recommended_actions") or [],
        "escalation": details.get("escalation") or None,
        "safety": safety,
        "media": media,
        "references": references,
        "workflow": workflow_info(db, workflow_node.linked_workflow_version_id) if workflow_node else None,
        "duration_seconds": _duration(session),
    }


def _trainee_tree(db: Session, version: TroubleshootingVersion, session: TroubleshootingSession,
                  active: list[TroubleshootingResponse], path_nodes: list[Optional[TroubleshootingNode]],
                  current: Optional[TroubleshootingNode], answers: list[dict]) -> dict:
    """Return the complete approved tree; execution still advances only through current choices."""
    nodes = list(version.nodes)
    edges = list(version.edges)
    visited_order: list[str] = []
    start = next((node for node in nodes if node.is_start), None)
    if start:
        visited_order.append(start.id)
    for node in path_nodes:
        if node and node.id not in visited_order:
            visited_order.append(node.id)
    if current and current.id not in visited_order:
        visited_order.append(current.id)
    visited = set(visited_order)
    visit_position = {node_id: index + 1 for index, node_id in enumerate(visited_order)}
    chosen_edges = {response.edge_taken_id for response in active if response.edge_taken_id}
    available_edges = {answer["id"] for answer in answers}
    available_targets = {edge.to_node_id for edge in edges if edge.id in available_edges and edge.to_node_id}
    kind_labels = {
        "start": "Start", "question": "Diagnostic decision", "action": "Inspection step",
        "safety": "Safety checkpoint", "media": "Evidence", "workflow": "Reference procedure",
        "result": "Troubleshooting result", "stop": "Stop checkpoint", "end": "Resolution",
        "escalation": "Expert escalation", "check": "Inspection step",
    }
    node_views = []
    for node in nodes:
        terminal = node.node_type in TERMINAL_NODE_TYPES
        is_current = bool(current and node.id == current.id and session.status == "in_progress" and not terminal)
        if is_current:
            status = "current"
        elif node.id in visited:
            status = "evidence_found" if node.node_type == "media" else "completed"
        elif node.id in available_targets and session.status == "in_progress":
            status = "available"
        else:
            status = "locked"
        if node.is_start:
            kind = "start"
        elif terminal:
            kind = "fault_identification"
        elif node.node_type == "safety":
            kind = "safety_checkpoint"
        elif node.node_type == "media":
            kind = "evidence"
        elif node.node_type == "workflow":
            kind = "procedure"
        elif node.node_type == "question":
            kind = "decision"
        elif node.node_type == "action":
            kind = "inspection"
        else:
            kind = node.node_type
        details = node.details or {}
        node_answers = answers if current and node.id == current.id else []
        node_views.append({
            "id": node.id,
            "node_type": node.node_type,
            "kind": kind,
            "kind_label": kind_labels.get(node.node_type, "Troubleshooting step"),
            "title": node.title,
            "status": status,
            "is_start": bool(node.is_start),
            "is_final": terminal,
            "critical": node.node_type == "safety" or bool(details.get("sim_critical")),
            "evidence_found": node.id in visited and (node.node_type == "media" or bool(node.media_assets)),
            "visit_order": visit_position.get(node.id),
            "zone": details.get("sim_zone"),
            "instructions": node.instructions or "",
            "media": [media_payload(asset) for asset in node.media_assets or []],
            "safety": {
                "warning": node.safety_warning,
                "ppe": details.get("ppe") or [],
                "precautions": details.get("precautions") or [],
                "restricted": details.get("restricted_operations") or [],
            },
            "terms": details.get("technical_terms") or [],
            "workflow": workflow_info(db, node.linked_workflow_version_id),
            "findings": [],
            "actions": [{"edge_id": edge["id"], "label": edge["label"], "zone": None,
                         "kind": "advance", "done": False, "attempted_wrong": False} for edge in node_answers],
        })
    edge_views = []
    for edge in edges:
        if edge.id in chosen_edges:
            status = "completed"
        elif edge.id in available_edges:
            status = "available"
        else:
            status = "locked"
        edge_views.append({
            "id": edge.id,
            "source": edge.from_node_id,
            "target": edge.to_node_id,
            "label": edge.label,
            "status": status,
            "conditional": bool(edge.condition),
        })
    return {"nodes": node_views, "edges": edge_views,
            "current_node_id": current.id if current else None, "stage": session.status}


def walk_state(db: Session, session: TroubleshootingSession) -> dict:
    version = db.get(TroubleshootingVersion, session.guide_version_id)
    guide = version.guide
    current = db.get(TroubleshootingNode, session.current_node_id) if session.current_node_id else None
    active = _active_responses(session)
    path_nodes = [db.get(TroubleshootingNode, r.node_id) for r in active]
    path = [
        {"index": i, "node_id": node.id, "title": node.title, "type": node.node_type, "answer": _answer_label(r),
         "answered_at": r.server_timestamp}
        for i, (r, node) in enumerate(zip(active, path_nodes)) if node
    ]
    answers = [edge_payload(e) for e in (current.outgoing_edges if current else []) if e.to_node_id]
    tree = _trainee_tree(db, version, session, active, path_nodes, current, answers)
    terminal = bool(current and current.node_type in TERMINAL_NODE_TYPES)
    machine = db.get(Machine, session.machine_id) if session.machine_id else None
    return {
        "session_id": session.id,
        "guide": {
            "id": guide.id, "title": guide.title, "description": guide.description,
            "problem_category": guide.problem_category, "difficulty": guide.difficulty, "severity": guide.severity,
        },
        "version_id": version.id,
        "version_is_current": guide.current_published_version_id == version.id,
        "machine_id": session.machine_id,
        "machine_name": machine.name if machine else None,
        "status": session.status,
        "current_node": _walk_node(db, current) if current else None,
        "answers": answers,
        "tree": tree,
        "path": path,
        "step_number": len(path) + 1,
        "is_terminal": terminal,
        "report": _report(db, session, guide, [n for n in path_nodes if n], current, active) if terminal and current else None,
        "escalation": ({"status": session.escalation.status, "requested_at": session.escalation.requested_at}
                       if session.escalation else None),
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }


def get_walk(db: Session, session_id: str, user: User) -> TroubleshootingSession:
    return _owned_session(db, session_id, user)
