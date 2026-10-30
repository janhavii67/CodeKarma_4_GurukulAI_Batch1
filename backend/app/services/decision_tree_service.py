"""Decision tree engine: expert authoring, validation, versioning and publication.

A decision tree is a ``TroubleshootingGuide``; each revision is a ``TroubleshootingVersion``
holding ``TroubleshootingNode`` steps and ``TroubleshootingEdge`` answers/branches.
Questions own several answers, every other non-terminal step owns at most one "Next"
branch, and result steps end a path. Published versions are immutable: editing a
published tree always happens on a new draft version.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.db.base import generate_uuid, utc_now
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.procedure import Procedure
from app.models.troubleshooting import (
    GUIDE_STATUS_DRAFT,
    GUIDE_STATUS_IN_REVIEW,
    GUIDE_STATUS_PUBLISHED,
    GUIDE_STATUS_SUPERSEDED,
    GUIDE_STATUS_WITHDRAWN,
    TroubleshootingEdge,
    TroubleshootingGuide,
    TroubleshootingNode,
    TroubleshootingSession,
    TroubleshootingVersion,
    decision_tree_node_media,
)
from app.models.user import User

STEP_TYPES = {"start", "question", "action", "safety", "media", "workflow", "result"}
LEGACY_TYPES = {"answer", "check", "stop", "escalation", "end"}
VALID_NODE_TYPES = STEP_TYPES | LEGACY_TYPES
TERMINAL_NODE_TYPES = {"result", "end", "stop", "escalation"}
BRANCHING_TYPES = {"question"}
DETAIL_KEYS = {
    "explanation", "technical_terms", "completion_condition", "corrective_actions",
    "ppe", "restricted_operations", "precautions",
    "possible_causes", "recommended_actions", "escalation", "unsourced", "source_titles",
    # Troubleshooting simulator scenario data (authored by experts, never generated).
    "sim_clue", "sim_reading", "sim_zone", "sim_critical", "sim_hint", "sim_min_checks", "verification",
}
NON_NAVIGATING_OUTCOMES = {"reveal", "wrong", "unsafe"}
SIM_ZONES = {"power", "cooling", "sensors", "control", "mechanical", "output", "software", "general"}
EDITABLE_NODE_FIELDS = {
    "node_type", "title", "instructions", "safety_warning", "help_text", "expected_observation",
    "input_type", "input_rules", "is_start", "position_x", "position_y",
    "linked_knowledge_version_id", "linked_workflow_version_id", "details",
}
EDITOR_PERMISSIONS = {"knowledge.create", "knowledge.approve"}


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------

def is_editor(permissions: Iterable[str]) -> bool:
    return bool(EDITOR_PERMISSIONS.intersection(permissions))


def get_guide(db: Session, guide_id: str) -> TroubleshootingGuide:
    guide = db.get(TroubleshootingGuide, guide_id)
    if not guide:
        raise NotFoundError(code="guide_not_found", message="Decision tree not found.")
    return guide


def get_version(db: Session, version_id: str) -> TroubleshootingVersion:
    version = db.get(TroubleshootingVersion, version_id)
    if not version or not version.guide_id:
        raise NotFoundError(code="version_not_found", message="Decision tree version not found.")
    return version


def assert_can_manage(guide: TroubleshootingGuide, user: User, permissions: Iterable[str]) -> None:
    """Owners, reviewers and admins may change a tree; other experts may only read it."""
    perms = set(permissions)
    if guide.owner_id == user.id or user.role_id == "ADMIN" or "knowledge.approve" in perms:
        return
    raise ForbiddenError(code="not_tree_owner", message="Only the tree's author or a reviewer can change this decision tree.")


def editable_version(db: Session, version_id: str, user: User, permissions: Iterable[str]) -> TroubleshootingVersion:
    version = get_version(db, version_id)
    assert_can_manage(version.guide, user, permissions)
    if version.status != GUIDE_STATUS_DRAFT:
        raise ValidationError(code="version_not_draft", message="Published or in-review versions are locked. Start a new draft to make changes.")
    return version


def readable_version(db: Session, version_id: str, permissions: Iterable[str]) -> TroubleshootingVersion:
    """Trainees can only ever read the currently published version of a live tree."""
    version = get_version(db, version_id)
    if is_editor(permissions):
        return version
    guide = version.guide
    if guide.is_archived or guide.current_published_version_id != version.id:
        raise NotFoundError(code="version_not_found", message="Decision tree version not found.")
    return version


def get_node(db: Session, node_id: str) -> TroubleshootingNode:
    node = db.get(TroubleshootingNode, node_id)
    if not node or not node.version_id:
        raise NotFoundError(code="node_not_found", message="Decision tree step not found.")
    return node


def get_edge(db: Session, edge_id: str) -> TroubleshootingEdge:
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge or not edge.version_id:
        raise NotFoundError(code="edge_not_found", message="Answer branch not found.")
    return edge


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def media_payload(asset: MediaAsset) -> dict:
    return {
        "id": asset.id,
        "title": asset.title or asset.original_name,
        "kind": asset.kind,
        "mime": asset.mime,
        "filename": asset.original_name,
        "size_bytes": asset.size_bytes,
        "duration_seconds": asset.duration_seconds,
        "machine_id": asset.machine_id,
        "url": f"/api/v1/media/{asset.id}",
    }


def node_payload(node: TroubleshootingNode) -> dict:
    return {
        "id": node.id,
        "node_type": node.node_type,
        "title": node.title,
        "instructions": node.instructions or "",
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
        "details": node.details or {},
        "origin": node.origin or "expert",
        "source_reference": node.source_reference,
        "media": [media_payload(asset) for asset in (node.media_assets or [])],
    }


def edge_payload(edge: TroubleshootingEdge) -> dict:
    return {
        "id": edge.id,
        "from_node_id": edge.from_node_id,
        "to_node_id": edge.to_node_id,
        "label": edge.label,
        "condition": edge.condition,
        "sort_order": edge.sort_order,
    }


def _tags(raw: str | None) -> list[str]:
    return [tag.strip() for tag in (raw or "").split(",") if tag.strip()]


def _tree_status(guide: TroubleshootingGuide) -> str:
    if guide.is_archived:
        return "archived"
    if any(v.status == GUIDE_STATUS_IN_REVIEW for v in guide.versions):
        return "pending_approval"
    if guide.current_published_version_id:
        return "published"
    return "draft"


def working_version(guide: TroubleshootingGuide) -> Optional[TroubleshootingVersion]:
    """The version an expert is most likely to open: open draft/review, else published, else latest."""
    for status in (GUIDE_STATUS_DRAFT, GUIDE_STATUS_IN_REVIEW):
        found = next((v for v in guide.versions if v.status == status), None)
        if found:
            return found
    published = next((v for v in guide.versions if v.id == guide.current_published_version_id), None)
    return published or (guide.versions[-1] if guide.versions else None)


def guide_payload(db: Session, guide: TroubleshootingGuide, *, include_versions: bool = False,
                  session_counts: dict | None = None, published_only: bool = False) -> dict:
    machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
    version = (db.get(TroubleshootingVersion, guide.current_published_version_id)
               if published_only and guide.current_published_version_id else working_version(guide))
    nodes = version.nodes if version else []
    cover = db.get(MediaAsset, guide.cover_media_id) if guide.cover_media_id else None
    draft = next((v for v in guide.versions if v.status == GUIDE_STATUS_DRAFT), None)
    in_review = next((v for v in guide.versions if v.status == GUIDE_STATUS_IN_REVIEW), None)
    payload = {
        "id": guide.id,
        "title": guide.title,
        "description": guide.description,
        "problem_category": guide.problem_category,
        "machine_id": guide.machine_id,
        "machine_name": machine.name if machine else None,
        "machine_category": machine.category_name if machine else None,
        "severity": guide.severity,
        "difficulty": guide.difficulty,
        "tags": _tags(guide.tags),
        "estimated_minutes": guide.estimated_minutes,
        "cover_media": media_payload(cover) if cover else None,
        "is_archived": guide.is_archived,
        "simulation": guide.simulation or {},
        "status": _tree_status(guide),
        "owner_id": guide.owner_id,
        "current_published_version_id": guide.current_published_version_id,
        "draft_version_id": None if published_only else (draft.id if draft else None),
        "in_review_version_id": None if published_only else (in_review.id if in_review else None),
        "working_version_id": version.id if version else None,
        "stats": {
            "steps": len(nodes),
            "questions": sum(1 for n in nodes if n.node_type == "question"),
            "results": sum(1 for n in nodes if n.node_type in TERMINAL_NODE_TYPES),
            "versions": len(guide.versions),
            "sessions": (session_counts or {}).get(guide.id, 0),
        },
        "created_at": guide.created_at,
        "updated_at": guide.updated_at,
    }
    if include_versions and not published_only:
        owner = db.get(User, guide.owner_id)
        payload["owner_name"] = owner.name if owner else None
        authors = {v.author_id: db.get(User, v.author_id) for v in guide.versions}
        payload["versions"] = [
            {
                "id": v.id,
                "version_number": v.version_number,
                "status": v.status,
                "author_id": v.author_id,
                "author_name": authors[v.author_id].name if authors.get(v.author_id) else None,
                "revision_reason": v.revision_reason,
                "created_at": v.created_at,
                "published_at": v.published_at,
                "step_count": len(v.nodes),
            }
            for v in sorted(guide.versions, key=lambda v: v.version_number, reverse=True)
        ]
    return payload


def version_detail(db: Session, version: TroubleshootingVersion) -> dict:
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
        "nodes": [node_payload(n) for n in version.nodes],
        "edges": [edge_payload(e) for e in version.edges],
    }


def session_counts(db: Session, guide_ids: list[str]) -> dict[str, int]:
    if not guide_ids:
        return {}
    rows = (
        db.query(TroubleshootingVersion.guide_id, func.count(TroubleshootingSession.id))
        .join(TroubleshootingSession, TroubleshootingSession.guide_version_id == TroubleshootingVersion.id)
        .filter(TroubleshootingVersion.guide_id.in_(guide_ids))
        .group_by(TroubleshootingVersion.guide_id)
        .all()
    )
    return {guide_id: count for guide_id, count in rows}


# ---------------------------------------------------------------------------
# Trees (guides)
# ---------------------------------------------------------------------------

def list_guides(db: Session, permissions: Iterable[str], *, machine_id: str | None = None,
                include_archived: bool = False) -> list[dict]:
    editor = is_editor(permissions)
    query = db.query(TroubleshootingGuide)
    if machine_id:
        query = query.filter(TroubleshootingGuide.machine_id == machine_id)
    if not editor:
        query = query.filter(TroubleshootingGuide.current_published_version_id.isnot(None), TroubleshootingGuide.is_archived.is_(False))
    elif not include_archived:
        query = query.filter(TroubleshootingGuide.is_archived.is_(False))
    guides = query.order_by(TroubleshootingGuide.updated_at.desc()).all()
    counts = session_counts(db, [g.id for g in guides]) if editor else {}
    return [guide_payload(db, guide, session_counts=counts, published_only=not editor) for guide in guides]


def _validate_machine(db: Session, machine_id: str | None) -> None:
    if machine_id and not db.get(Machine, machine_id):
        raise ValidationError(code="machine_not_found", message="Select a registered machine.")


def _validate_cover(db: Session, media_id: str | None) -> None:
    if media_id:
        asset = db.get(MediaAsset, media_id)
        if not asset or asset.kind != "image":
            raise ValidationError(code="invalid_cover", message="The cover must be an uploaded image.")


def _normalise_category(value: str) -> str:
    return value.strip().upper().replace(" ", "_")


def create_guide(db: Session, *, owner: User, title: str, problem_category: str, machine_id: str | None = None,
                 severity: str = "MEDIUM", description: str | None = None, difficulty: str = "INTERMEDIATE",
                 tags: list[str] | None = None, cover_media_id: str | None = None,
                 estimated_minutes: int | None = None, simulation: dict | None = None) -> TroubleshootingGuide:
    _validate_machine(db, machine_id)
    _validate_cover(db, cover_media_id)
    guide = TroubleshootingGuide(
        title=title.strip(),
        problem_category=_normalise_category(problem_category),
        machine_id=machine_id,
        severity=severity,
        owner_id=owner.id,
        description=(description or "").strip() or None,
        difficulty=difficulty,
        tags=",".join(t.strip() for t in (tags or []) if t.strip()) or None,
        cover_media_id=cover_media_id,
        estimated_minutes=estimated_minutes,
        simulation=clean_simulation(simulation),
    )
    db.add(guide)
    db.flush()
    version = TroubleshootingVersion(guide_id=guide.id, version_number=1, status=GUIDE_STATUS_DRAFT, author_id=owner.id)
    db.add(version)
    db.flush()
    # Every tree begins at an automatically created Start step.
    db.add(TroubleshootingNode(
        version_id=version.id, node_type="start", title=guide.title, is_start=True,
        instructions=guide.description or "", position_x=0.0, position_y=0.0, details={}, origin="expert",
    ))
    db.commit()
    db.refresh(guide)
    return guide


def update_guide(db: Session, guide: TroubleshootingGuide, fields: dict) -> TroubleshootingGuide:
    if "machine_id" in fields:
        _validate_machine(db, fields["machine_id"])
    if "cover_media_id" in fields:
        _validate_cover(db, fields["cover_media_id"])
    for key, value in fields.items():
        if key == "tags":
            guide.tags = ",".join(t.strip() for t in (value or []) if t.strip()) or None
        elif key == "problem_category":
            if value and value.strip():
                guide.problem_category = _normalise_category(value)
        elif key == "title":
            if value and value.strip():
                guide.title = value.strip()
        elif key == "description":
            guide.description = (value or "").strip() or None
        elif key == "simulation":
            guide.simulation = clean_simulation(value)
        elif key in {"machine_id", "severity", "difficulty", "cover_media_id", "estimated_minutes"}:
            setattr(guide, key, value)
    db.commit()
    db.refresh(guide)
    return guide


def set_archived(db: Session, guide: TroubleshootingGuide, archived: bool) -> TroubleshootingGuide:
    guide.is_archived = archived
    db.commit()
    db.refresh(guide)
    return guide


def delete_guide(db: Session, guide: TroubleshootingGuide) -> None:
    if guide.current_published_version_id or any(
        v.status in {GUIDE_STATUS_PUBLISHED, GUIDE_STATUS_SUPERSEDED, GUIDE_STATUS_WITHDRAWN} for v in guide.versions
    ):
        raise ValidationError(code="has_published_history", message="Trees that were ever published keep their history. Archive the tree instead.")
    db.delete(guide)
    db.commit()


def _copy_graph(db: Session, source: TroubleshootingVersion, target: TroubleshootingVersion) -> None:
    node_map: dict[str, str] = {}
    source_nodes = list(source.nodes)
    for node in source_nodes:
        new_id = generate_uuid()
        node_map[node.id] = new_id
        db.add(TroubleshootingNode(
            id=new_id, version_id=target.id, node_type=node.node_type, title=node.title,
            instructions=node.instructions or "", safety_notice=node.safety_notice, safety_warning=node.safety_warning,
            expected_observation=node.expected_observation, input_type=node.input_type, input_rules=node.input_rules,
            is_start=node.is_start, position_x=node.position_x, position_y=node.position_y, help_text=node.help_text,
            linked_knowledge_version_id=node.linked_knowledge_version_id,
            linked_workflow_version_id=node.linked_workflow_version_id,
            source_reference=node.source_reference, details=dict(node.details or {}), origin=node.origin or "expert",
            is_root=node.is_root, description=node.description or "",
        ))
    db.flush()
    for node in source_nodes:
        for order, asset in enumerate(node.media_assets or []):
            db.execute(decision_tree_node_media.insert().values(node_id=node_map[node.id], media_id=asset.id, sort_order=order))
    for edge in list(source.edges):
        if edge.from_node_id not in node_map:
            continue
        db.add(TroubleshootingEdge(
            version_id=target.id, from_node_id=node_map[edge.from_node_id],
            to_node_id=node_map.get(edge.to_node_id) if edge.to_node_id else None,
            label=edge.label, condition=edge.condition, sort_order=edge.sort_order,
        ))


def create_new_version(db: Session, guide: TroubleshootingGuide, author_id: str, revision_reason: str | None = None) -> TroubleshootingVersion:
    if any(v.status in {GUIDE_STATUS_DRAFT, GUIDE_STATUS_IN_REVIEW} for v in guide.versions):
        raise ValidationError(code="draft_exists", message="This tree already has an open draft or a version in review.")
    base = db.get(TroubleshootingVersion, guide.current_published_version_id) if guide.current_published_version_id else (
        max(guide.versions, key=lambda v: v.version_number) if guide.versions else None)
    version = TroubleshootingVersion(
        guide_id=guide.id, version_number=max((v.version_number for v in guide.versions), default=0) + 1,
        status=GUIDE_STATUS_DRAFT, author_id=author_id, revision_reason=revision_reason,
    )
    db.add(version)
    db.flush()
    if base:
        _copy_graph(db, base, version)
    db.commit()
    db.refresh(version)
    return version


def duplicate_guide(db: Session, guide: TroubleshootingGuide, owner: User) -> TroubleshootingGuide:
    source = working_version(guide)
    copy = TroubleshootingGuide(
        title=f"{guide.title} (copy)"[:256], problem_category=guide.problem_category, machine_id=guide.machine_id,
        severity=guide.severity, owner_id=owner.id, description=guide.description, difficulty=guide.difficulty,
        tags=guide.tags, cover_media_id=guide.cover_media_id, estimated_minutes=guide.estimated_minutes,
        simulation={**(guide.simulation or {}), "enabled": False},
    )
    db.add(copy)
    db.flush()
    version = TroubleshootingVersion(guide_id=copy.id, version_number=1, status=GUIDE_STATUS_DRAFT, author_id=owner.id)
    db.add(version)
    db.flush()
    if source:
        _copy_graph(db, source, version)
    db.commit()
    db.refresh(copy)
    return copy


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _issue(level: str, code: str, message: str, node_id: str | None = None, edge_id: str | None = None) -> dict:
    return {"level": level, "code": code, "message": message, "node_id": node_id, "edge_id": edge_id}


def _reach(start_ids: Iterable[str], adjacency: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    stack = list(start_ids)
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(adjacency.get(current, []))
    return seen


def _loop_nodes(reachable: set[str], adjacency: dict[str, list[str]]) -> list[str]:
    """Nodes that close a cycle (targets of back edges in a DFS over the reachable steps)."""
    state: dict[str, int] = {}
    loops: list[str] = []
    for root in sorted(reachable):
        if root in state:
            continue
        stack: list[tuple[str, int]] = [(root, 0)]
        state[root] = 1
        while stack:
            current, index = stack[-1]
            children = adjacency.get(current, [])
            if index < len(children):
                stack[-1] = (current, index + 1)
                nxt = children[index]
                if state.get(nxt) == 1:
                    if nxt not in loops:
                        loops.append(nxt)
                elif nxt not in state:
                    state[nxt] = 1
                    stack.append((nxt, 0))
            else:
                state[current] = 2
                stack.pop()
    return loops


def _media_available(asset: MediaAsset) -> bool:
    try:
        from app.integrations.storage import get_storage_service
        return get_storage_service().exists(asset.storage_key)
    except Exception:  # A misconfigured store should not block editing; loading errors surface in the viewer.
        return True


def validate_graph(db: Session, guide: TroubleshootingGuide, nodes: list[TroubleshootingNode],
                   edges: list[TroubleshootingEdge]) -> list[dict]:
    """Structural and content checks that must pass before a tree is submitted or approved."""
    from app.services.procedure_service import is_workflow_currently_published

    issues: list[dict] = []
    by_id = {n.id: n for n in nodes}
    outgoing: dict[str, list[TroubleshootingEdge]] = defaultdict(list)
    for edge in edges:
        outgoing[edge.from_node_id].append(edge)

    starts = [n for n in nodes if n.is_start]
    if not starts:
        issues.append(_issue("error", "no_start", "Mark one step as the start of the tree."))
    elif len(starts) > 1:
        issues.append(_issue("error", "multiple_starts", "Only one step can be the start of the tree."))

    adjacency: dict[str, list[str]] = defaultdict(list)
    reverse: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        source = by_id.get(edge.from_node_id)
        if not source:
            issues.append(_issue("error", "broken_connection", f'Answer "{edge.label}" belongs to a step that no longer exists.', edge_id=edge.id))
            continue
        if not edge.to_node_id:
            if edge_sim(edge).get("outcome") in NON_NAVIGATING_OUTCOMES:
                continue  # simulator checks and wrong/unsafe choices never move the trainee
            issues.append(_issue("error", "missing_destination", f'Answer "{edge.label}" on "{source.title}" has no next step.', source.id, edge.id))
            continue
        if edge.to_node_id not in by_id:
            issues.append(_issue("error", "broken_connection", f'Answer "{edge.label}" on "{source.title}" points to a deleted step.', source.id, edge.id))
            continue
        adjacency[edge.from_node_id].append(edge.to_node_id)
        reverse[edge.to_node_id].append(edge.from_node_id)

    workflow_cache: dict[str, bool] = {}
    for node in nodes:
        out = outgoing.get(node.id, [])
        terminal = node.node_type in TERMINAL_NODE_TYPES
        details = node.details or {}
        if node.node_type == "question":
            if not out:
                issues.append(_issue("error", "question_without_answers", f'Question "{node.title}" has no answer options.', node.id))
            elif len(out) == 1:
                issues.append(_issue("warning", "single_answer", f'Question "{node.title}" offers only one answer.', node.id))
        elif not terminal and not out:
            issues.append(_issue("error", "dead_end", f'"{node.title}" is a dead end. Choose its next step or finish with a Result.', node.id))
        if terminal and out:
            issues.append(_issue("warning", "result_with_branches", f'Result "{node.title}" has branches trainees will never reach.', node.id))
        if node.node_type not in BRANCHING_TYPES and not terminal and len(out) > 1:
            issues.append(_issue("error", "too_many_branches", f'"{node.title}" can only have one next step. Use a Question to branch.', node.id))
        labels = [e.label.strip().lower() for e in out]
        if len(set(labels)) != len(labels):
            issues.append(_issue("error", "duplicate_answer", f'"{node.title}" has two answers with the same text.', node.id))
        if node.node_type == "result" and not (details.get("possible_causes") or details.get("recommended_actions") or node.instructions):
            issues.append(_issue("warning", "empty_result", f'Result "{node.title}" has no possible causes or recommended actions.', node.id))
        if node.node_type == "safety" and not (node.safety_warning or node.instructions or details.get("ppe") or details.get("precautions")):
            issues.append(_issue("error", "empty_safety", f'Safety step "{node.title}" has no warning or precautions.', node.id))
        if node.origin == "ai_draft":
            issues.append(_issue("error", "ai_unreviewed", f'AI-drafted step "{node.title}" has not been reviewed by an expert.', node.id))
        if node.node_type == "workflow" and not node.linked_workflow_version_id:
            issues.append(_issue("error", "workflow_missing", f'Guided Workflow step "{node.title}" is not connected to a workflow.', node.id))
        if node.linked_workflow_version_id:
            workflow_id = node.linked_workflow_version_id
            if workflow_id not in workflow_cache:
                procedure = db.get(Procedure, workflow_id)
                workflow_cache[workflow_id] = bool(procedure and is_workflow_currently_published(db, procedure))
            if not workflow_cache[workflow_id]:
                issues.append(_issue("error", "workflow_unavailable", f'The Guided Workflow linked from "{node.title}" is not published.', node.id))
        if node.node_type == "media" and not node.media_assets:
            issues.append(_issue("error", "media_missing", f'Media step "{node.title}" has no attachments.', node.id))
        for asset in node.media_assets or []:
            if not _media_available(asset):
                issues.append(_issue("error", "media_unavailable", f'Attachment "{asset.title or asset.original_name}" on "{node.title}" can no longer be opened.', node.id))

    if not any(n.node_type in TERMINAL_NODE_TYPES for n in nodes):
        issues.append(_issue("error", "no_result", "Add at least one Result so trainees reach an outcome."))

    if len(starts) == 1:
        reachable = _reach([starts[0].id], adjacency)
        can_finish = _reach([n.id for n in nodes if n.node_type in TERMINAL_NODE_TYPES], reverse)
        for node in nodes:
            if node.id not in reachable:
                issues.append(_issue("warning", "unreachable", f'"{node.title}" cannot be reached from the start.', node.id))
            elif node.id not in can_finish and node.node_type not in TERMINAL_NODE_TYPES and outgoing.get(node.id):
                issues.append(_issue("error", "no_ending", f'Paths through "{node.title}" never reach a result.', node.id))
        for node_id in _loop_nodes(reachable, adjacency):
            issues.append(_issue("warning", "loop", f'"{by_id[node_id].title}" is reached again by a loop. Make sure this is intended.', node_id))

    if (guide.simulation or {}).get("enabled"):
        issues.extend(_simulation_issues(nodes, outgoing))

    if guide.severity in {"HIGH", "CRITICAL"} and not any(n.node_type == "safety" or n.safety_warning for n in nodes):
        issues.append(_issue("error", "safety_required", f"{guide.severity.title()} severity trees need at least one safety instruction."))
    return issues


def edge_sim(edge: TroubleshootingEdge) -> dict:
    """Simulator outcome for an answer, stored as JSON in ``edge.condition`` (``{"sim": {...}}``)."""
    import json
    try:
        data = json.loads(edge.condition) if edge.condition else {}
    except (TypeError, ValueError):
        return {}
    sim = data.get("sim") if isinstance(data, dict) else None
    return sim if isinstance(sim, dict) else {}


def _simulation_issues(nodes: list[TroubleshootingNode], outgoing: dict) -> list[dict]:
    issues = []
    for node in nodes:
        out = outgoing.get(node.id, [])
        if node.node_type == "question" and len(out) > 1:
            outcomes = [edge_sim(e).get("outcome") for e in out]
            if not any(o == "correct" for o in outcomes):
                issues.append(_issue("warning", "sim_no_correct_answer",
                                     f'Simulation: mark which answer to "{node.title}" is correct for this scenario.', node.id))
        if node.node_type == "result" and not (node.details or {}).get("possible_causes"):
            issues.append(_issue("warning", "sim_no_causes",
                                 f'Simulation: result "{node.title}" needs possible causes for the trainee to diagnose.', node.id))
    return issues


def validate_version(db: Session, version: TroubleshootingVersion) -> list[dict]:
    return validate_graph(db, version.guide, list(version.nodes), list(version.edges))


# ---------------------------------------------------------------------------
# Version lifecycle
# ---------------------------------------------------------------------------

def change_version_status(db: Session, version: TroubleshootingVersion, action: str, user: User,
                          permissions: Iterable[str], reason: str | None = None) -> TroubleshootingVersion:
    from app.services.audit_service import AuditService
    perms = set(permissions)
    guide = version.guide
    reviewer = "knowledge.approve" in perms or user.role_id == "ADMIN"
    if action in {"submit_review", "withdraw_submission"}:
        assert_can_manage(guide, user, perms)
    elif action in {"approve", "reject", "withdraw"} and not reviewer:
        raise ForbiddenError(code="forbidden", message="Only reviewers can approve, reject or withdraw a decision tree.")

    if action == "submit_review":
        if version.status != GUIDE_STATUS_DRAFT:
            raise ValidationError(code="invalid_transition", message="Only drafts can be submitted for review.")
        _raise_if_invalid(db, version)
        version.status = GUIDE_STATUS_IN_REVIEW
        version.author_id = user.id
        version.revision_reason = None
    elif action == "withdraw_submission":
        if version.status != GUIDE_STATUS_IN_REVIEW:
            raise ValidationError(code="invalid_transition", message="Only versions in review can be returned to draft.")
        version.status = GUIDE_STATUS_DRAFT
    elif action == "approve":
        if version.status != GUIDE_STATUS_IN_REVIEW:
            raise ValidationError(code="invalid_transition", message="Only versions in review can be approved.")
        if version.author_id == user.id and user.role_id != "ADMIN":
            raise ForbiddenError(code="self_review_forbidden", message="A different expert must approve this tree. Authors cannot approve their own submission.")
        _raise_if_invalid(db, version)
        if guide.current_published_version_id and guide.current_published_version_id != version.id:
            previous = db.get(TroubleshootingVersion, guide.current_published_version_id)
            if previous:
                previous.status = GUIDE_STATUS_SUPERSEDED
        version.status = GUIDE_STATUS_PUBLISHED
        version.published_at = utc_now()
        guide.current_published_version_id = version.id
    elif action == "reject":
        if version.status != GUIDE_STATUS_IN_REVIEW:
            raise ValidationError(code="invalid_transition", message="Only versions in review can be rejected.")
        if not (reason or "").strip():
            raise ValidationError(code="reason_required", message="Tell the author what to change.")
        version.status = GUIDE_STATUS_DRAFT
        version.revision_reason = reason.strip()
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
    AuditService.log(db, f"decision_tree.{action}", "troubleshooting_version", version.id, user.id,
                     {"guide_id": guide.id, "version_number": version.version_number, "reason": reason}, commit=True)
    return version


def _raise_if_invalid(db: Session, version: TroubleshootingVersion) -> None:
    errors = [issue for issue in validate_version(db, version) if issue["level"] == "error"]
    if errors:
        raise ValidationError(
            code="tree_invalid",
            message=f"{len(errors)} problem{'s' if len(errors) > 1 else ''} must be fixed first: {errors[0]['message']}",
            details={"issues": errors},
        )


# ---------------------------------------------------------------------------
# Steps (nodes)
# ---------------------------------------------------------------------------

def _clean_details(details: Any) -> dict:
    if not isinstance(details, dict):
        return {}
    clean: dict = {}
    for key, value in details.items():
        if key not in DETAIL_KEYS:
            continue
        if isinstance(value, list):
            items = []
            for entry in value[:30]:
                if isinstance(entry, str) and entry.strip():
                    items.append(entry.strip())
                elif isinstance(entry, dict) and entry:
                    items.append({k: str(v).strip() for k, v in entry.items() if isinstance(k, str)})
            clean[key] = items
        elif isinstance(value, dict):
            clean[key] = {k: str(v).strip()[:200] for k, v in value.items() if isinstance(k, str) and v not in (None, "")}
        elif isinstance(value, str):
            clean[key] = value.strip()
        elif isinstance(value, (bool, int, float)) or value is None:
            clean[key] = value
    if clean.get("sim_zone") and clean["sim_zone"] not in SIM_ZONES:
        clean["sim_zone"] = "general"
    if "sim_min_checks" in clean:
        try:
            clean["sim_min_checks"] = max(0, min(10, int(clean["sim_min_checks"] or 0)))
        except (TypeError, ValueError):
            clean["sim_min_checks"] = 0
    return clean


SIMULATION_TEXT = {"mission_code": 32, "scenario": 4000, "objective": 1000, "alert": 300}
SIMULATION_LISTS = {"symptoms", "equipment", "skills", "criteria"}


def clean_simulation(value: Any) -> dict:
    """Mission settings an expert authors for the trainee simulator."""
    if not isinstance(value, dict):
        return {}
    clean: dict = {"enabled": bool(value.get("enabled")), "leaderboard": bool(value.get("leaderboard"))}
    for key, limit in SIMULATION_TEXT.items():
        if isinstance(value.get(key), str) and value[key].strip():
            clean[key] = value[key].strip()[:limit]
    for key in SIMULATION_LISTS:
        items = value.get(key)
        if isinstance(items, list):
            clean[key] = [str(item).strip()[:160] for item in items if str(item).strip()][:20]
    try:
        xp = int(value.get("xp_reward") or 0)
        if xp > 0:
            clean["xp_reward"] = min(xp, 5000)
    except (TypeError, ValueError):
        pass
    return clean


def _apply_node_fields(db: Session, node: TroubleshootingNode, fields: dict) -> None:
    for key, value in fields.items():
        if key not in EDITABLE_NODE_FIELDS:
            continue
        if key == "node_type" and value not in VALID_NODE_TYPES:
            raise ValidationError(code="invalid_node_type", message="Unknown step type.")
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError(code="title_required", message="Every step needs a title.")
            value = value[:256]
        if key == "instructions":
            value = value or ""
        if key == "details":
            value = _clean_details(value)
        if key in {"linked_workflow_version_id", "linked_knowledge_version_id"}:
            value = value or None
            if key == "linked_workflow_version_id" and value and not db.get(Procedure, value):
                raise ValidationError(code="workflow_not_found", message="Choose an existing Guided Workflow.")
        setattr(node, key, value)
    if fields.get("is_start") and node.version_id:
        db.query(TroubleshootingNode).filter(
            TroubleshootingNode.version_id == node.version_id, TroubleshootingNode.id != node.id,
            TroubleshootingNode.is_start.is_(True),
        ).update({TroubleshootingNode.is_start: False}, synchronize_session="fetch")


def _sync_node_media(db: Session, node: TroubleshootingNode, media_ids: list[str] | None) -> None:
    if media_ids is None:
        return
    unique_ids = list(dict.fromkeys(media_ids))
    for media_id in unique_ids:
        if not db.get(MediaAsset, media_id):
            raise ValidationError(code="media_not_found", message="An attachment could not be found. Upload it again.")
    db.execute(decision_tree_node_media.delete().where(decision_tree_node_media.c.node_id == node.id))
    for order, media_id in enumerate(unique_ids):
        db.execute(decision_tree_node_media.insert().values(node_id=node.id, media_id=media_id, sort_order=order))
    db.expire(node, ["media_assets"])


def _next_edge_order(node: TroubleshootingNode) -> int:
    return max((e.sort_order for e in node.outgoing_edges), default=-1) + 1


def default_answer_label(source: TroubleshootingNode) -> str:
    used = {e.label.strip().lower() for e in source.outgoing_edges}
    if source.node_type == "question":
        for candidate in ("Yes", "No", "Not sure"):
            if candidate.lower() not in used:
                return candidate
        return f"Option {len(used) + 1}"
    return "Next"


def add_node(db: Session, version: TroubleshootingVersion, fields: dict, *, connect_from: dict | None = None) -> TroubleshootingNode:
    """Create a step. With ``connect_from`` the step is wired in wherever that is unambiguous:

    - ``edge_id``: that answer now leads to the new step;
    - a question source gets a new answer leading to the new step;
    - any other source leads to the new step, and the new step inherits the source's previous
      next step (an insert), so experts can add steps in sequence without drawing connections.
    """
    fields = dict(fields)
    media_ids = fields.pop("media_asset_ids", None)
    node_type = fields.get("node_type") or "question"
    if node_type == "start" and any(n.is_start for n in version.nodes):
        raise ValidationError(code="start_exists", message="This tree already has a Start step.")
    node = TroubleshootingNode(version_id=version.id, node_type=node_type, title="Untitled step", instructions="",
                               details={}, origin="expert", input_type="choice")
    db.add(node)
    db.flush()
    _apply_node_fields(db, node, fields)
    if node_type == "start":
        node.is_start = True
    _sync_node_media(db, node, media_ids)

    if connect_from:
        source = get_node(db, connect_from.get("node_id") or "")
        if source.version_id != version.id:
            raise ValidationError(code="node_not_in_version", message="That step belongs to a different version.")
        if source.node_type in TERMINAL_NODE_TYPES:
            raise ValidationError(code="terminal_source", message="A Result ends a path. Choose another step to continue from.")
        if connect_from.get("edge_id"):
            edge = get_edge(db, connect_from["edge_id"])
            if edge.from_node_id != source.id:
                raise ValidationError(code="edge_mismatch", message="That answer belongs to a different step.")
            edge.to_node_id = node.id
        elif source.node_type in BRANCHING_TYPES:
            label = (connect_from.get("label") or "").strip() or default_answer_label(source)
            _assert_unique_label(source, label)
            db.add(TroubleshootingEdge(version_id=version.id, from_node_id=source.id, to_node_id=node.id,
                                       label=label[:128], sort_order=_next_edge_order(source)))
        else:
            existing = source.outgoing_edges[0] if source.outgoing_edges else None
            if existing:
                previous_target = existing.to_node_id
                existing.to_node_id = node.id
                if previous_target and node.node_type not in TERMINAL_NODE_TYPES | BRANCHING_TYPES:
                    db.add(TroubleshootingEdge(version_id=version.id, from_node_id=node.id, to_node_id=previous_target,
                                               label="Next", sort_order=0))
            else:
                db.add(TroubleshootingEdge(version_id=version.id, from_node_id=source.id, to_node_id=node.id,
                                           label="Next", sort_order=0))
    db.commit()
    db.refresh(node)
    return node


def update_node(db: Session, node: TroubleshootingNode, fields: dict) -> TroubleshootingNode:
    fields = dict(fields)
    media_ids = fields.pop("media_asset_ids", None)
    mark_reviewed = fields.pop("mark_reviewed", False)
    if fields.get("node_type") == "start" and node.node_type != "start":
        raise ValidationError(code="start_exists", message="Use 'Trainees start here' to move the start of the tree.")
    if node.is_start and fields.get("is_start") is False:
        raise ValidationError(code="start_required", message="Choose another step as the start instead of clearing this one.")
    _apply_node_fields(db, node, fields)
    _sync_node_media(db, node, media_ids)
    content_changed = any(key not in {"position_x", "position_y"} for key in fields) or media_ids is not None
    if node.origin == "ai_draft" and (mark_reviewed or content_changed):
        node.origin = "ai_reviewed"
    db.commit()
    db.refresh(node)
    return node


def delete_node(db: Session, node: TroubleshootingNode) -> None:
    if node.is_start:
        raise ValidationError(code="start_required", message="The Start step can't be deleted. Edit it instead.")
    # Answers leading here stay in place without a destination so the expert sees what to reconnect.
    db.query(TroubleshootingEdge).filter(TroubleshootingEdge.to_node_id == node.id).update(
        {TroubleshootingEdge.to_node_id: None}, synchronize_session=False)
    db.flush()
    db.expire(node, ["incoming_edges"])
    db.execute(decision_tree_node_media.delete().where(decision_tree_node_media.c.node_id == node.id))
    db.delete(node)
    db.commit()


def duplicate_node(db: Session, node: TroubleshootingNode) -> TroubleshootingNode:
    if node.is_start:
        raise ValidationError(code="start_unique", message="The Start step can't be duplicated.")
    copy = TroubleshootingNode(
        version_id=node.version_id, node_type=node.node_type, title=f"{node.title} (copy)"[:256],
        instructions=node.instructions or "", safety_warning=node.safety_warning, help_text=node.help_text,
        expected_observation=node.expected_observation, input_type=node.input_type, input_rules=node.input_rules,
        position_x=(node.position_x or 0) + 40, position_y=(node.position_y or 0) + 40,
        linked_knowledge_version_id=node.linked_knowledge_version_id,
        linked_workflow_version_id=node.linked_workflow_version_id, details=dict(node.details or {}),
        origin="ai_draft" if node.origin == "ai_draft" else "expert", source_reference=node.source_reference,
    )
    db.add(copy)
    db.flush()
    for order, asset in enumerate(node.media_assets or []):
        db.execute(decision_tree_node_media.insert().values(node_id=copy.id, media_id=asset.id, sort_order=order))
    # Answers are copied with the same destinations so a duplicated question works immediately.
    for edge in list(node.outgoing_edges):
        db.add(TroubleshootingEdge(version_id=node.version_id, from_node_id=copy.id, to_node_id=edge.to_node_id,
                                   label=edge.label, condition=edge.condition, sort_order=edge.sort_order))
    db.commit()
    db.refresh(copy)
    return copy


def batch_update_positions(db: Session, version: TroubleshootingVersion, positions: list[dict]) -> None:
    nodes = {n.id: n for n in version.nodes}
    for pos in positions:
        node = nodes.get(pos["id"])
        if not node:
            raise NotFoundError(code="node_not_found", message="A step in this layout is not part of the version.")
        node.position_x = pos["position_x"]
        node.position_y = pos["position_y"]
    db.commit()


# ---------------------------------------------------------------------------
# Answers / branches (edges)
# ---------------------------------------------------------------------------

def _assert_unique_label(source: TroubleshootingNode, label: str, ignore_edge_id: str | None = None) -> None:
    if any(e.label.strip().lower() == label.strip().lower() and e.id != ignore_edge_id for e in source.outgoing_edges):
        raise ValidationError(code="duplicate_answer", message=f'"{source.title}" already has an answer "{label}".')


def _check_target(version: TroubleshootingVersion, source: TroubleshootingNode, to_node_id: str | None) -> None:
    if to_node_id is None:
        return
    if to_node_id not in {n.id for n in version.nodes}:
        raise ValidationError(code="node_not_in_version", message="The next step must belong to this tree version.")
    if to_node_id == source.id:
        raise ValidationError(code="self_loop", message="An answer cannot lead back to the same step.")


def add_edge(db: Session, version: TroubleshootingVersion, from_node_id: str, label: str | None = None,
             to_node_id: str | None = None, condition: str | None = None) -> TroubleshootingEdge:
    source = get_node(db, from_node_id)
    if source.version_id != version.id:
        raise ValidationError(code="node_not_in_version", message="Both steps must belong to this version.")
    if source.node_type in TERMINAL_NODE_TYPES:
        raise ValidationError(code="terminal_source", message="A Result ends a path and can't have answers.")
    if source.node_type not in BRANCHING_TYPES and source.outgoing_edges:
        raise ValidationError(code="single_next_step", message=f'"{source.title}" already has a next step. Use a Question to branch.')
    _check_target(version, source, to_node_id)
    label = (label or "").strip() or default_answer_label(source)
    _assert_unique_label(source, label)
    edge = TroubleshootingEdge(version_id=version.id, from_node_id=source.id, to_node_id=to_node_id, label=label[:128],
                               condition=condition, sort_order=_next_edge_order(source))
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


def update_edge(db: Session, edge: TroubleshootingEdge, fields: dict) -> TroubleshootingEdge:
    version = edge.version
    source = edge.from_node
    if fields.get("label") is not None:
        label = fields["label"].strip()
        if not label:
            raise ValidationError(code="label_required", message="Answers need text.")
        _assert_unique_label(source, label, ignore_edge_id=edge.id)
        edge.label = label[:128]
    if "condition" in fields:
        edge.condition = fields["condition"] or None
    if "to_node_id" in fields:
        _check_target(version, source, fields["to_node_id"])
        edge.to_node_id = fields["to_node_id"]
    db.commit()
    db.refresh(edge)
    return edge


def reorder_answers(db: Session, node: TroubleshootingNode, edge_ids: list[str]) -> None:
    current = {e.id: e for e in node.outgoing_edges}
    if len(edge_ids) != len(current) or set(edge_ids) != set(current):
        raise ValidationError(code="answer_order_mismatch", message="The new order must list every answer of this step exactly once.")
    for order, edge_id in enumerate(edge_ids):
        current[edge_id].sort_order = order
    db.commit()


def delete_edge(db: Session, edge: TroubleshootingEdge) -> None:
    db.delete(edge)
    db.commit()


# ---------------------------------------------------------------------------
# Snapshot restore (undo / redo)
# ---------------------------------------------------------------------------

def replace_graph(db: Session, version: TroubleshootingVersion, nodes: list[dict], edges: list[dict]) -> TroubleshootingVersion:
    """Atomically replace a draft's steps and answers with an earlier snapshot (undo/redo)."""
    node_ids = [n["id"] for n in nodes]
    if len(set(node_ids)) != len(node_ids):
        raise ValidationError(code="invalid_snapshot", message="The snapshot repeats a step.")
    if sum(1 for n in nodes if n.get("is_start")) != 1:
        raise ValidationError(code="invalid_snapshot", message="A snapshot must contain exactly one Start step.")
    for edge in edges:
        if edge["from_node_id"] not in node_ids or (edge.get("to_node_id") and edge["to_node_id"] not in node_ids):
            raise ValidationError(code="invalid_snapshot", message="The snapshot contains a broken connection.")
    if node_ids and db.query(TroubleshootingNode.id).filter(
        TroubleshootingNode.id.in_(node_ids), TroubleshootingNode.version_id != version.id,
    ).first():
        raise ValidationError(code="invalid_snapshot", message="The snapshot refers to steps from another tree.")

    try:
        keep = set(node_ids)
        for edge in list(version.edges):
            db.delete(edge)
        db.flush()
        for node in list(version.nodes):
            if node.id not in keep:
                db.execute(decision_tree_node_media.delete().where(decision_tree_node_media.c.node_id == node.id))
                db.delete(node)
        db.flush()
        existing = {n.id: n for n in db.query(TroubleshootingNode).filter(TroubleshootingNode.version_id == version.id)}
        for data in nodes:
            node = existing.get(data["id"])
            if node is None:
                node = TroubleshootingNode(id=data["id"], version_id=version.id, node_type=data.get("node_type") or "question",
                                           title=data.get("title") or "Untitled step", instructions="", details={}, origin="expert")
                db.add(node)
                db.flush()
            node.is_start = bool(data.get("is_start"))
            _apply_node_fields(db, node, {k: v for k, v in data.items() if k in EDITABLE_NODE_FIELDS and k != "is_start"})
            node.origin = data.get("origin") or node.origin or "expert"
            _sync_node_media(db, node, [m["id"] if isinstance(m, dict) else m for m in data.get("media", [])])
        for order, data in enumerate(edges):
            db.add(TroubleshootingEdge(id=data.get("id") or generate_uuid(), version_id=version.id,
                                       from_node_id=data["from_node_id"], to_node_id=data.get("to_node_id"),
                                       label=(data.get("label") or "Next")[:128], condition=data.get("condition"),
                                       sort_order=data.get("sort_order", order)))
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.expire_all()
    return get_version(db, version.id)
