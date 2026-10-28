"""Deterministic, revision-pinned manufacturing simulation logic."""
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.core.exceptions import NotFoundError, ValidationError
from app.db.base import utc_now
from app.models.knowledge import KnowledgeVersion
from app.models.procedure import Procedure
from app.models.machine import Machine
from app.models.troubleshooting import TroubleshootingGuide, TroubleshootingVersion, GUIDE_STATUS_PUBLISHED
from app.models.simulation import SimulationScenarioRevision, SimulationAttempt
from app.schemas.simulation import SimulationScenarioContent
from app.services.procedure_service import workflow_sources_are_current


def validate_scenario(db: Session, raw: Dict[str, Any]) -> SimulationScenarioContent:
    try:
        content = SimulationScenarioContent.model_validate(raw)
    except Exception as exc:
        raise ValidationError(code="invalid_scenario", message=f"Scenario fields are invalid: {exc}")

    points = content.decision_points
    point_map = {point.id: point for point in points}
    if len(point_map) != len(points):
        raise ValidationError(code="duplicate_decision_id", message="Decision point IDs must be unique.")
    if content.start_decision_id not in point_map:
        raise ValidationError(code="invalid_start_decision", message="The starting decision point does not exist.")

    choice_ids = set()
    edges: Dict[str, List[str]] = {point.id: [] for point in points}
    allowed_sources = set(content.source_version_ids)
    if content.machine_id and not db.get(Machine, content.machine_id):
        raise ValidationError(code="machine_not_found", message="The scenario machine does not exist.")
    for point in points:
        if len(point.choices) < 2:
            raise ValidationError(code="missing_choices", message=f"Decision '{point.id}' needs at least two choices.")
        for choice in point.choices:
            if choice.id in choice_ids:
                raise ValidationError(code="duplicate_choice_id", message="Choice IDs must be unique throughout a scenario.")
            choice_ids.add(choice.id)
            if choice.terminal == bool(choice.next_decision_id):
                raise ValidationError(code="invalid_transition", message="Each choice must lead to exactly one next decision or terminal outcome.")
            if choice.next_decision_id:
                if choice.next_decision_id not in point_map:
                    raise ValidationError(code="invalid_next_decision", message=f"Choice '{choice.id}' points to a missing decision.")
                edges[point.id].append(choice.next_decision_id)
            if not choice.source_refs or not set(choice.source_refs).issubset(allowed_sources):
                raise ValidationError(code="choice_missing_sources", message=f"Choice '{choice.id}' needs references to approved source versions included in the scenario.")

    visiting, visited = set(), set()
    def walk(node: str) -> None:
        if node in visiting:
            raise ValidationError(code="scenario_cycle", message="Scenario branches cannot contain loops.")
        if node in visited:
            return
        visiting.add(node)
        for child in edges[node]:
            walk(child)
        visiting.remove(node)
        visited.add(node)
    walk(content.start_decision_id)
    if visited != set(point_map):
        raise ValidationError(code="unreachable_decision", message="Every decision point must be reachable from the start.")

    for version_id in content.source_version_ids:
        version = db.get(KnowledgeVersion, version_id)
        if not version or version.status != "published":
            raise ValidationError(code="source_not_published", message="Every scenario source must be an approved, currently published knowledge revision.")
    for procedure_id in content.related_workflow_ids:
        procedure = db.get(Procedure, procedure_id)
        if not procedure or procedure.status != "APPROVED" or not workflow_sources_are_current(db, procedure):
            raise ValidationError(code="workflow_not_published", message="Related workflows must be currently published.")
    for guide_id in content.related_troubleshooting_ids:
        guide = db.get(TroubleshootingGuide, guide_id)
        version = db.get(TroubleshootingVersion, guide.current_published_version_id) if guide and guide.current_published_version_id else None
        if not guide or not version or version.status != GUIDE_STATUS_PUBLISHED:
            raise ValidationError(code="troubleshooting_not_published", message="Related troubleshooting topics must be published.")
    return content


def source_snapshots(db: Session, content: SimulationScenarioContent) -> List[dict]:
    refs = []
    for version_id in content.source_version_ids:
        version = db.get(KnowledgeVersion, version_id)
        item = version.item if version else None
        refs.append({"version_id": version_id, "item_id": version.item_id, "title": version.title or (item.title if item else "Approved source"), "version_no": version.version_no})
    return refs


def source_refs_are_current(db: Session, revision: SimulationScenarioRevision) -> bool:
    return all((version := db.get(KnowledgeVersion, ref.get("version_id"))) is not None and version.status == "published" for ref in revision.source_refs or [])


def learner_decision(revision: SimulationScenarioRevision, decision_id: str) -> dict:
    content = revision.content_json
    point = next((p for p in content["decision_points"] if p["id"] == decision_id), None)
    if not point:
        raise NotFoundError(code="decision_not_found", message="Decision point was not found in this revision.")
    return {"id": point["id"], "situation": point["situation"], "evidence": point.get("evidence", []), "choices": [{"id": c["id"], "label": c["label"]} for c in point["choices"]]}


def session_payload(db: Session, attempt: SimulationAttempt) -> dict:
    revision = db.get(SimulationScenarioRevision, attempt.revision_id) if attempt.revision_id else None
    content = revision.content_json if revision else {}
    refs = revision.source_refs if revision and source_refs_are_current(db, revision) else []
    sources_current = bool(revision and source_refs_are_current(db, revision))
    current = learner_decision(revision, attempt.current_decision_id) if sources_current and attempt.status == "IN_PROGRESS" and attempt.current_decision_id else None
    def remaining_steps(decision_id: str, memo=None) -> int:
        if not revision or not decision_id:
            return 0
        memo = memo if memo is not None else {}
        if decision_id in memo:
            return memo[decision_id]
        point = next((p for p in content.get("decision_points", []) if p["id"] == decision_id), None)
        if not point:
            return 0
        value = 1 + max((remaining_steps(c.get("next_decision_id"), memo) for c in point.get("choices", []) if c.get("next_decision_id")), default=0)
        memo[decision_id] = value
        return value
    completed_steps = len(attempt.decisions_log_json or [])
    planned_steps = completed_steps + remaining_steps(attempt.current_decision_id) if attempt.status == "IN_PROGRESS" else completed_steps
    return {
        "id": attempt.id, "scenario_id": attempt.scenario_id, "revision_id": attempt.revision_id,
        "scenario_title": content.get("title"), "scenario_description": content.get("description"),
        "scenario_difficulty": content.get("difficulty"), "scenario_operation": content.get("operation"),
        "revision_no": revision.revision_no if revision else None,
        "status": attempt.status.lower(), "current_decision_id": attempt.current_decision_id,
        "current_decision": current, "blocked_reason": "A cited source revision is no longer published. Pause this session and ask an expert to review the scenario." if revision and not sources_current and attempt.status == "IN_PROGRESS" else None,
        "initial_situation": content.get("initial_situation"),
        "progress": {"completed": completed_steps, "total": planned_steps},
        "learning_objectives": content.get("learning_objectives", []),
        "safety_precautions": content.get("safety_precautions", []),
        "decisions": attempt.decisions_log_json if isinstance(attempt.decisions_log_json, list) else [],
        "report": attempt.report_json, "source_refs": refs,
        "related_workflow_ids": content.get("related_workflow_ids", []),
        "related_troubleshooting_ids": content.get("related_troubleshooting_ids", []),
        "started_at": attempt.started_at, "updated_at": attempt.updated_at, "completed_at": attempt.completed_at,
    }


def submit_choice(db: Session, attempt: SimulationAttempt, choice_id: str) -> dict:
    if attempt.status != "IN_PROGRESS" or not attempt.revision_id or not attempt.current_decision_id:
        raise ValidationError(code="session_not_active", message="This simulation session is not active.")
    revision = db.get(SimulationScenarioRevision, attempt.revision_id)
    if not revision or not source_refs_are_current(db, revision):
        raise ValidationError(code="scenario_sources_outdated", message="A cited source is no longer published. Stop this session and ask an expert to review the scenario.")
    content = revision.content_json
    point = next((p for p in content["decision_points"] if p["id"] == attempt.current_decision_id), None)
    choice = next((c for c in (point or {}).get("choices", []) if c["id"] == choice_id), None)
    if not choice:
        raise ValidationError(code="invalid_choice", message="Choose an available action for the current decision.")
    decision = {
        "decision_id": point["id"], "situation": point["situation"], "choice_id": choice["id"],
        "choice_label": choice["label"], "consequence": choice["consequence"], "observation": choice.get("observation"),
        "explanation": choice["explanation"], "preferred": bool(choice.get("preferred")),
        "safety_critical": bool(choice.get("safety_critical")), "source_refs": choice.get("source_refs", []),
        "next_decision_id": choice.get("next_decision_id"), "terminal": bool(choice.get("terminal")),
    }
    log = list(attempt.decisions_log_json or [])
    log.append(decision)
    attempt.decisions_log_json = log
    attempt.current_decision_id = choice.get("next_decision_id")
    attempt.updated_at = utc_now()
    if choice.get("terminal"):
        attempt.status = "COMPLETED"
        attempt.completed_at = utc_now()
        attempt.report_json = {
            "decisions_made": len(log), "preferred_decisions": sum(1 for entry in log if entry["preferred"]),
            "missed_decisions": sum(1 for entry in log if not entry["preferred"]),
            "safety_critical_errors": sum(1 for entry in log if entry["safety_critical"] and not entry["preferred"]),
            "notice": "This learning simulation does not certify practical skill or establish that a real machine is safe to operate.",
        }
    db.flush()
    return decision
