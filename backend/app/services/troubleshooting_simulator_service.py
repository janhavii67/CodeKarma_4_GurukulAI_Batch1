"""Trainee runtime for troubleshooting missions built on published decision trees.

The expert's published tree is the single source of truth:
- branching follows the tree's answers (edges); each answer's simulator outcome lives in
  ``edge.condition`` as ``{"sim": {"outcome", "feedback", "clue", "reading", "zone"}}``;
- evidence comes only from expert-authored ``sim_clue`` / ``sim_reading`` on steps and answers;
- the approved path is the chain of answers the expert marked ``correct``.

Answer outcomes:
  correct / acceptable / neutral (unmarked) -> advance along the branch
  reveal   -> collect evidence and stay (diagnostic checks)
  wrong    -> educational feedback, decision penalty, stay
  unsafe   -> safety warning, safety penalty, progression blocked
"""
from __future__ import annotations

import copy
import random
from collections import defaultdict
from typing import Iterable, Optional

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.exceptions import NotFoundError, ValidationError
from app.db.base import utc_now
from app.models.knowledge import KnowledgeVersion
from app.models.machine import Machine
from app.models.media import MediaAsset
from app.models.troubleshooting import (
    MissionAchievement,
    MissionAttempt,
    TroubleshootingEdge,
    TroubleshootingGuide,
    TroubleshootingNode,
    TroubleshootingVersion,
)
from app.models.user import User
from app.services.decision_tree_service import TERMINAL_NODE_TYPES, edge_sim, media_payload

DIFFICULTY_ORDER = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]
DIFFICULTY_XP = {"BEGINNER": 100, "INTERMEDIATE": 200, "ADVANCED": 300, "EXPERT": 400}
UNLOCK_SCORE = 60
ADVANCING = {"correct", "acceptable", "neutral"}
SCORE_MAX = {"root_cause": 30, "decisions": 20, "safety": 20, "evidence": 10, "corrective": 10, "assistance": 5, "efficiency": 5}
ACHIEVEMENTS = {
    "first_responder": ("First Responder", "Complete your first troubleshooting mission."),
    "sharp_observer": ("Sharp Observer", "Discover every clue on the approved diagnostic path."),
    "safety_first": ("Safety First", "Complete a mission without a safety violation."),
    "root_cause_master": ("Root Cause Master", "Identify the correct root cause."),
    "diagnostic_expert": ("Diagnostic Expert", "Score 85 or more on an Advanced or Expert mission."),
    "independent_investigator": ("Independent Investigator", "Complete a mission without using hints."),
}
ACHIEVEMENT_XP = 50
KIND_LABELS = {
    "start": "Mission start", "inspection": "Machine inspection", "diagnostic_test": "Diagnostic test",
    "evidence": "Evidence review", "decision": "Diagnostic decision", "multi_action": "Multi-check investigation",
    "safety_checkpoint": "Safety checkpoint", "procedure": "Reference procedure", "explanation": "Expert briefing",
    "fault_identification": "Fault identification",
}


# ---------------------------------------------------------------------------
# Tree reading helpers
# ---------------------------------------------------------------------------

def _out(node: TroubleshootingNode) -> list[TroubleshootingEdge]:
    return sorted(node.outgoing_edges, key=lambda e: e.sort_order)


def node_kind(node: TroubleshootingNode) -> str:
    details = node.details or {}
    if node.is_start:
        return "start"
    if node.node_type in TERMINAL_NODE_TYPES:
        return "fault_identification"
    if node.node_type == "safety":
        return "safety_checkpoint"
    if node.node_type == "media":
        return "evidence"
    if node.node_type == "workflow":
        return "procedure"
    if node.node_type == "question":
        sims = [edge_sim(e) for e in node.outgoing_edges]
        if any(s.get("outcome") == "reveal" for s in sims):
            return "multi_action"
        if details.get("sim_zone") or any(s.get("zone") for s in sims):
            return "inspection"
        return "decision"
    if details.get("sim_clue") or details.get("sim_reading"):
        return "inspection" if details.get("sim_zone") else "diagnostic_test"
    return "explanation" if node.node_type == "action" and not node.expected_observation else "diagnostic_test"


def approved_path(version: TroubleshootingVersion) -> tuple[list[tuple[TroubleshootingNode, Optional[TroubleshootingEdge]]], Optional[TroubleshootingNode]]:
    """Follow answers marked ``correct`` (or a step's only branch) from the start to a result."""
    nodes = {n.id: n for n in version.nodes}
    current = next((n for n in version.nodes if n.is_start), None)
    path: list[tuple[TroubleshootingNode, Optional[TroubleshootingEdge]]] = []
    seen: set[str] = set()
    while current and current.id not in seen:
        seen.add(current.id)
        if current.node_type in TERMINAL_NODE_TYPES:
            path.append((current, None))
            return path, current
        out = [e for e in _out(current) if e.to_node_id]
        chosen = next((e for e in out if edge_sim(e).get("outcome") == "correct"), None)
        if not chosen:
            advancing = [e for e in out if edge_sim(e).get("outcome", "neutral") in ADVANCING]
            chosen = advancing[0] if len(advancing) == 1 else None
        path.append((current, chosen))
        if not chosen:
            return path, None
        current = nodes.get(chosen.to_node_id)
    return path, None


def _evidence_keys(path: list[tuple[TroubleshootingNode, Optional[TroubleshootingEdge]]]) -> set[str]:
    keys = set()
    for node, _ in path:
        details = node.details or {}
        if details.get("sim_clue") or details.get("sim_reading"):
            keys.add(f"node:{node.id}")
        for edge in node.outgoing_edges:
            sim = edge_sim(edge)
            if sim.get("outcome") == "reveal" and (sim.get("clue") or sim.get("reading")):
                keys.add(f"edge:{edge.id}")
    return keys


# ---------------------------------------------------------------------------
# Missions
# ---------------------------------------------------------------------------

def _mission_guides(db: Session) -> list[TroubleshootingGuide]:
    guides = (db.query(TroubleshootingGuide)
              .filter(TroubleshootingGuide.current_published_version_id.isnot(None), TroubleshootingGuide.is_archived.is_(False))
              .order_by(TroubleshootingGuide.title).all())
    return [g for g in guides if (g.simulation or {}).get("enabled")]


def _get_mission(db: Session, guide_id: str) -> TroubleshootingGuide:
    guide = db.get(TroubleshootingGuide, guide_id)
    if not guide or guide.is_archived or not guide.current_published_version_id or not (guide.simulation or {}).get("enabled"):
        raise NotFoundError(code="mission_not_found", message="This mission is not available.")
    return guide


def _mission_code(guide: TroubleshootingGuide) -> str:
    return (guide.simulation or {}).get("mission_code") or f"M-{guide.id[:4].upper()}"


def _xp_reward(guide: TroubleshootingGuide) -> int:
    return int((guide.simulation or {}).get("xp_reward") or DIFFICULTY_XP.get(guide.difficulty, 200))


def _unlock_state(db: Session, user: User, guides: list[TroubleshootingGuide]) -> dict[str, tuple[bool, Optional[str]]]:
    """A tier unlocks once the trainee completes a mission of the previous tier with a passing score."""
    tiers_present = {g.difficulty for g in guides}
    passed = defaultdict(bool)
    rows = (db.query(MissionAttempt, TroubleshootingGuide)
            .join(TroubleshootingGuide, TroubleshootingGuide.id == MissionAttempt.guide_id)
            .filter(MissionAttempt.user_id == user.id, MissionAttempt.status == "completed").all())
    for attempt, guide in rows:
        if (attempt.total_score or 0) >= UNLOCK_SCORE:
            passed[guide.difficulty] = True
    result = {}
    for difficulty in DIFFICULTY_ORDER:
        index = DIFFICULTY_ORDER.index(difficulty)
        previous = [d for d in DIFFICULTY_ORDER[:index] if d in tiers_present]
        if not previous or passed[previous[-1]] or any(passed[d] for d in DIFFICULTY_ORDER[index:]):
            result[difficulty] = (True, None)
        else:
            result[difficulty] = (False, f"Score {UNLOCK_SCORE}+ on a {previous[-1].title()} mission to unlock.")
    return result


def mission_summary(db: Session, user: User, guide: TroubleshootingGuide, unlock: dict) -> dict:
    sim = guide.simulation or {}
    machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
    cover = db.get(MediaAsset, guide.cover_media_id) if guide.cover_media_id else None
    attempts = db.query(MissionAttempt).filter(MissionAttempt.user_id == user.id, MissionAttempt.guide_id == guide.id).all()
    completed = [a for a in attempts if a.status == "completed"]
    in_progress = next((a for a in sorted(attempts, key=lambda a: a.started_at, reverse=True) if a.status == "in_progress"), None)
    unlocked, reason = unlock.get(guide.difficulty, (True, None))
    return {
        "id": guide.id,
        "mission_code": _mission_code(guide),
        "title": guide.title,
        "alert": sim.get("alert") or guide.title,
        "briefing_preview": (sim.get("scenario") or guide.description or "")[:220],
        "problem_category": guide.problem_category,
        "difficulty": guide.difficulty,
        "estimated_minutes": guide.estimated_minutes,
        "xp_reward": _xp_reward(guide),
        "skills": sim.get("skills") or [],
        "machine_id": guide.machine_id,
        "machine_name": machine.name if machine else None,
        "cover_media": media_payload(cover) if cover else None,
        "attempts": len(attempts),
        "best_score": max((a.total_score or 0 for a in completed), default=None),
        "status": "completed" if completed else "in_progress" if in_progress else "new",
        "in_progress_attempt_id": in_progress.id if in_progress else None,
        "locked": not unlocked,
        "locked_reason": reason,
        "leaderboard": bool(sim.get("leaderboard")),
    }


def list_missions(db: Session, user: User) -> list[dict]:
    guides = _mission_guides(db)
    unlock = _unlock_state(db, user, guides)
    missions = [mission_summary(db, user, guide, unlock) for guide in guides]
    return sorted(missions, key=lambda m: (DIFFICULTY_ORDER.index(m["difficulty"]) if m["difficulty"] in DIFFICULTY_ORDER else 9, m["title"]))


def _safety_briefing(version: TroubleshootingVersion) -> list[str]:
    items: list[str] = []
    for node in version.nodes:
        details = node.details or {}
        for text in [node.safety_warning, *(details.get("ppe") or []), *(details.get("precautions") or []),
                     *[f"Do not: {r}" for r in details.get("restricted_operations") or []]]:
            if isinstance(text, str) and text.strip() and text.strip() not in items:
                items.append(text.strip())
    return items


def briefing(db: Session, user: User, guide_id: str) -> dict:
    guide = _get_mission(db, guide_id)
    version = db.get(TroubleshootingVersion, guide.current_published_version_id)
    sim = guide.simulation or {}
    summary = mission_summary(db, user, guide, _unlock_state(db, user, _mission_guides(db)))
    start = next((n for n in version.nodes if n.is_start), None)
    zones = _zones(version)
    return {
        **summary,
        "scenario": sim.get("scenario") or guide.description or (start.instructions if start else ""),
        "objective": sim.get("objective") or "Investigate the problem, identify the likely cause, and select the approved corrective procedure.",
        "symptoms": sim.get("symptoms") or ([guide.description] if guide.description else []),
        "equipment": sim.get("equipment") or [],
        "safety": _safety_briefing(version),
        "criteria": sim.get("criteria") or [
            "Identify the root cause supported by evidence",
            "Collect the evidence on the approved diagnostic path",
            "Never perform an unsafe action",
            "Choose the approved corrective actions and verify the fix",
        ],
        "zones": zones,
        "version_id": version.id,
    }


def _zones(version: TroubleshootingVersion) -> list[str]:
    return sorted({(n.details or {}).get("sim_zone") for n in version.nodes if (n.details or {}).get("sim_zone")}
                  | {edge_sim(e).get("zone") for e in version.edges if edge_sim(e).get("zone")})


# ---------------------------------------------------------------------------
# Attempts
# ---------------------------------------------------------------------------

def _empty_state(start_id: str) -> dict:
    return {
        "visited": [start_id], "performed": [], "checks": {}, "evidence": [], "events": [], "safety_ack": [],
        "hints": {"2": 0, "3": 0}, "hint_text": {}, "counts": {"wrong": 0, "acceptable": 0, "premature": 0, "unnecessary": 0, "violations": 0},
        "diagnosis": None, "corrective": None, "corrective_retries": 0, "paused": False,
    }


def _state(attempt: MissionAttempt) -> dict:
    return copy.deepcopy(attempt.state or {})


def _save(attempt: MissionAttempt, state: dict) -> None:
    attempt.state = state
    flag_modified(attempt, "state")


def _tick(attempt: MissionAttempt) -> None:
    """Accumulate active time since the last resume (paused or finished missions don't count)."""
    now = utc_now()
    if attempt.resumed_at:
        resumed = attempt.resumed_at if attempt.resumed_at.tzinfo else attempt.resumed_at.replace(tzinfo=now.tzinfo)
        attempt.active_seconds = (attempt.active_seconds or 0) + max(0, int((now - resumed).total_seconds()))
    attempt.resumed_at = now if attempt.status == "in_progress" and not (attempt.state or {}).get("paused") else None


def _event(state: dict, kind: str, **data) -> dict:
    event = {"type": kind, "at": utc_now().isoformat(), **{k: v for k, v in data.items() if v is not None}}
    state["events"].append(event)
    return event


def get_attempt(db: Session, user: User, attempt_id: str) -> MissionAttempt:
    attempt = db.get(MissionAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise NotFoundError(code="attempt_not_found", message="Mission attempt not found.")
    return attempt


def _active(db: Session, user: User, attempt_id: str) -> tuple[MissionAttempt, dict, TroubleshootingVersion]:
    attempt = get_attempt(db, user, attempt_id)
    if attempt.status != "in_progress":
        raise ValidationError(code="mission_finished", message="This mission has ended. Replay it to try again.")
    state = _state(attempt)
    if state.get("paused"):
        raise ValidationError(code="mission_paused", message="Resume the mission to continue.")
    return attempt, state, db.get(TroubleshootingVersion, attempt.version_id)


def start_attempt(db: Session, user: User, guide_id: str, *, restart: bool = False) -> MissionAttempt:
    guide = _get_mission(db, guide_id)
    unlocked, reason = _unlock_state(db, user, _mission_guides(db)).get(guide.difficulty, (True, None))
    if not unlocked:
        raise ValidationError(code="mission_locked", message=reason or "This mission is locked.")
    existing = (db.query(MissionAttempt)
                .filter(MissionAttempt.user_id == user.id, MissionAttempt.guide_id == guide.id, MissionAttempt.status == "in_progress")
                .order_by(MissionAttempt.started_at.desc()).first())
    if existing and not restart:
        return existing
    if existing:
        _tick(existing)
        existing.status = "abandoned"
        existing.resumed_at = None
    version = db.get(TroubleshootingVersion, guide.current_published_version_id)
    start = next((n for n in version.nodes if n.is_start), None)
    if not start:
        raise ValidationError(code="mission_broken", message="This mission has no start step.")
    attempt = MissionAttempt(user_id=user.id, guide_id=guide.id, version_id=version.id, status="in_progress", stage="investigate",
                             current_node_id=start.id, state=_empty_state(start.id), resumed_at=utc_now())
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def _add_evidence(state: dict, key: str, node: TroubleshootingNode, title: str, clue: Optional[str], reading: Optional[dict], zone: Optional[str]) -> Optional[dict]:
    if any(e["key"] == key for e in state["evidence"]):
        return None
    item = {"key": key, "node_id": node.id, "title": title, "clue": clue, "reading": reading, "zone": zone,
            "step": node.title, "at": utc_now().isoformat()}
    state["evidence"].append(item)
    return item


def perform(db: Session, user: User, attempt_id: str) -> MissionAttempt:
    """Carry out the current inspection/test and record the expert-authored finding."""
    attempt, state, _ = _active(db, user, attempt_id)
    node = db.get(TroubleshootingNode, attempt.current_node_id)
    details = node.details or {}
    if not (details.get("sim_clue") or details.get("sim_reading")):
        raise ValidationError(code="nothing_to_inspect", message="There is nothing to inspect at this step.")
    if node.id in state["performed"]:
        state["counts"]["unnecessary"] += 1
        _event(state, "repeat", node_id=node.id, title=node.title, outcome="unnecessary",
               feedback="You already recorded this finding. Repeating checks costs time.")
    else:
        state["performed"].append(node.id)
        evidence = _add_evidence(state, f"node:{node.id}", node, node.title, details.get("sim_clue"), details.get("sim_reading"), details.get("sim_zone"))
        _event(state, "inspect", node_id=node.id, title=node.title, outcome="evidence", clue=details.get("sim_clue"), evidence_key=evidence and evidence["key"])
    _save(attempt, state)
    _tick(attempt)
    db.commit()
    return attempt


def act(db: Session, user: User, attempt_id: str, edge_id: str, *, acknowledged: bool = False) -> MissionAttempt:
    attempt, state, version = _active(db, user, attempt_id)
    if attempt.stage != "investigate":
        raise ValidationError(code="wrong_stage", message="The investigation is complete. Continue with the diagnosis.")
    node = db.get(TroubleshootingNode, attempt.current_node_id)
    edge = db.get(TroubleshootingEdge, edge_id)
    if not edge or edge.from_node_id != node.id:
        raise ValidationError(code="invalid_action", message="That action is not available at this step.")
    sim = edge_sim(edge)
    outcome = sim.get("outcome") or "neutral"
    if outcome in ADVANCING and not edge.to_node_id:
        raise ValidationError(code="invalid_action", message="That action is not available at this step.")
    details = node.details or {}
    checks = state["checks"].setdefault(node.id, [])

    if outcome == "reveal":
        if edge.id in checks:
            state["counts"]["unnecessary"] += 1
            _event(state, "repeat", node_id=node.id, edge_id=edge.id, label=edge.label, outcome="unnecessary",
                   feedback="You already performed this check.")
        else:
            checks.append(edge.id)
            evidence = _add_evidence(state, f"edge:{edge.id}", node, edge.label, sim.get("clue"), sim.get("reading"), sim.get("zone"))
            _event(state, "check", node_id=node.id, edge_id=edge.id, label=edge.label, outcome="evidence", clue=sim.get("clue"),
                   feedback=sim.get("feedback"), evidence_key=evidence and evidence["key"])
    elif outcome == "unsafe":
        state["counts"]["violations"] += 1
        _event(state, "decision", node_id=node.id, edge_id=edge.id, label=edge.label, outcome="unsafe",
               feedback=sim.get("feedback") or "This action is unsafe in this situation. Follow the safety instructions before continuing.")
    elif outcome == "wrong":
        state["counts"]["wrong"] += 1
        _event(state, "decision", node_id=node.id, edge_id=edge.id, label=edge.label, outcome="wrong",
               feedback=sim.get("feedback") or "That choice does not fit the evidence. Review your findings and try again.")
    else:
        if node.node_type == "safety" and node.id not in state["safety_ack"]:
            if not acknowledged:
                raise ValidationError(code="safety_checkpoint", message="Confirm every safety requirement before continuing.")
            state["safety_ack"].append(node.id)
            _event(state, "safety_ack", node_id=node.id, title=node.title, outcome="safe")
        needs_inspection = (details.get("sim_clue") or details.get("sim_reading")) and node.id not in state["performed"]
        min_checks = int(details.get("sim_min_checks") or 0)
        if needs_inspection or len(checks) < min_checks:
            state["counts"]["premature"] += 1
            message = ("Carry out this step's inspection before moving on." if needs_inspection
                       else f"Gather more evidence first — at least {min_checks} checks are expected here.")
            _event(state, "decision", node_id=node.id, edge_id=edge.id, label=edge.label, outcome="premature", feedback=message)
            _save(attempt, state)
            _tick(attempt)
            db.commit()
            return attempt
        if outcome == "acceptable":
            state["counts"]["acceptable"] += 1
        _event(state, "decision", node_id=node.id, edge_id=edge.id, label=edge.label, outcome=outcome, feedback=sim.get("feedback"))
        target = db.get(TroubleshootingNode, edge.to_node_id)
        attempt.current_node_id = target.id
        state["visited"].append(target.id)
        if target.node_type in TERMINAL_NODE_TYPES:
            target_details = target.details or {}
            attempt.stage = "diagnose" if _diagnosis_options(version, target) else (
                "correct" if target_details.get("recommended_actions") else "verify")
            _event(state, "fault_reached", node_id=target.id, outcome="investigation_complete")
    _save(attempt, state)
    _tick(attempt)
    db.commit()
    return attempt


def _target_result(version: TroubleshootingVersion, reached: TroubleshootingNode) -> TroubleshootingNode:
    _, target = approved_path(version)
    return target or reached


def _diagnosis_options(version: TroubleshootingVersion, reached: TroubleshootingNode) -> list[str]:
    options: list[str] = []
    for node in version.nodes:
        if node.node_type in TERMINAL_NODE_TYPES:
            for cause in (node.details or {}).get("possible_causes") or []:
                if cause not in options:
                    options.append(cause)
    return options


def _shuffled(items: list[str], seed: str) -> list[str]:
    result = list(items)
    random.Random(seed).shuffle(result)
    return result


def _corrective_options(version: TroubleshootingVersion, target: TroubleshootingNode) -> tuple[list[str], list[str]]:
    correct = list((target.details or {}).get("recommended_actions") or [])
    distractors: list[str] = []
    for node in version.nodes:
        if node.id == target.id:
            continue
        details = node.details or {}
        for action in [*(details.get("recommended_actions") or []), *(details.get("corrective_actions") or [])]:
            if action not in correct and action not in distractors:
                distractors.append(action)
    return correct, distractors[:4]


def diagnose(db: Session, user: User, attempt_id: str, causes: list[str]) -> MissionAttempt:
    attempt, state, version = _active(db, user, attempt_id)
    if attempt.stage != "diagnose":
        raise ValidationError(code="wrong_stage", message="Diagnosis is not open at this point of the mission.")
    reached = db.get(TroubleshootingNode, attempt.current_node_id)
    options = _diagnosis_options(version, reached)
    chosen = [c for c in dict.fromkeys(causes) if c in options]
    if not chosen:
        raise ValidationError(code="diagnosis_required", message="Select at least one root cause from the list.")
    target = _target_result(version, reached)
    correct = list((target.details or {}).get("possible_causes") or [])
    union = set(chosen) | set(correct)
    accuracy = (len(set(chosen) & set(correct)) / len(union)) if union else 1.0
    path, _ = approved_path(version)
    available = _evidence_keys(path)
    found = {e["key"] for e in state["evidence"]} & available
    state["diagnosis"] = {
        "chosen": chosen, "correct": correct, "accuracy": round(accuracy, 3),
        "reached_result_id": reached.id, "target_result_id": target.id, "reached_target": reached.id == target.id,
        "evidence_ratio": round(len(found) / len(available), 3) if available else 1.0,
    }
    _event(state, "diagnosis", node_id=reached.id, outcome="correct" if accuracy == 1 else "partial" if accuracy > 0 else "wrong",
           chosen=chosen)
    attempt.stage = "correct" if (target.details or {}).get("recommended_actions") else "verify"
    _save(attempt, state)
    _tick(attempt)
    db.commit()
    return attempt


def correct_fault(db: Session, user: User, attempt_id: str, actions: list[str]) -> MissionAttempt:
    attempt, state, version = _active(db, user, attempt_id)
    if attempt.stage != "correct":
        raise ValidationError(code="wrong_stage", message="Corrective actions are not open at this point of the mission.")
    reached = db.get(TroubleshootingNode, attempt.current_node_id)
    target = _target_result(version, reached)
    correct, distractors = _corrective_options(version, target)
    chosen = [a for a in dict.fromkeys(actions) if a in correct or a in distractors]
    if not chosen:
        raise ValidationError(code="actions_required", message="Choose the corrective actions you would perform.")
    hits = len(set(chosen) & set(correct))
    wrong = len(set(chosen) - set(correct))
    accuracy = max(0.0, (hits - wrong) / len(correct)) if correct else 1.0
    state["corrective"] = {"chosen": chosen, "correct": correct, "accuracy": round(accuracy, 3), "complete": hits == len(correct) and wrong == 0}
    _event(state, "corrective", node_id=reached.id, outcome="correct" if state["corrective"]["complete"] else "incomplete", chosen=chosen)
    attempt.stage = "verify"
    _save(attempt, state)
    _tick(attempt)
    db.commit()
    return attempt


def verify(db: Session, user: User, attempt_id: str) -> MissionAttempt:
    """Confirm the fix. The machine is only restored when the approved corrective procedure was completed."""
    attempt, state, version = _active(db, user, attempt_id)
    if attempt.stage != "verify":
        raise ValidationError(code="wrong_stage", message="Verification is not open at this point of the mission.")
    corrective = state.get("corrective")
    if corrective and not corrective.get("complete"):
        state["corrective_retries"] = state.get("corrective_retries", 0) + 1
        _event(state, "verification", outcome="failed",
               feedback="Verification failed: the machine is not restored. Your corrective actions don't match the approved procedure — review them and try again.")
        attempt.stage = "correct"
        _save(attempt, state)
        _tick(attempt)
        db.commit()
        return attempt
    _event(state, "verification", outcome="passed", feedback="Verification passed. The machine meets the scenario's restoration conditions.")
    _save(attempt, state)
    return _finish(db, attempt, version)


def use_hint(db: Session, user: User, attempt_id: str, level: int) -> tuple[MissionAttempt, str]:
    attempt, state, version = _active(db, user, attempt_id)
    if level not in (2, 3):
        raise ValidationError(code="invalid_hint", message="Hints are level 2 (smart hint) or 3 (expert guidance).")
    node = db.get(TroubleshootingNode, attempt.current_node_id)
    stored = state["hint_text"].setdefault(node.id, {})
    if str(level) in stored:
        return attempt, stored[str(level)]
    text = _hint_text(version, node, level)
    stored[str(level)] = text
    state["hints"][str(level)] = state["hints"].get(str(level), 0) + 1
    _event(state, "hint", node_id=node.id, level=level)
    _save(attempt, state)
    _tick(attempt)
    db.commit()
    return attempt, text


def _hint_text(version: TroubleshootingVersion, node: TroubleshootingNode, level: int) -> str:
    """Hints use only expert-authored content. Level 3 reveals the approved next action."""
    details = node.details or {}
    if level == 2:
        if details.get("sim_hint"):
            return details["sim_hint"]
        zones = sorted({edge_sim(e).get("zone") for e in node.outgoing_edges if edge_sim(e).get("zone")} | ({details["sim_zone"]} if details.get("sim_zone") else set()))
        if node.expected_observation:
            return f"Focus on what you can observe: {node.expected_observation}"
        if zones:
            return f"Look closely at the {', '.join(zones)} area before deciding."
        return "Compare every finding in your evidence log with the reference values before you decide."
    path, _ = approved_path(version)
    approved_edge = next((edge for step, edge in path if step.id == node.id), None)
    parts = [node.help_text] if node.help_text else []
    if approved_edge:
        feedback = edge_sim(approved_edge).get("feedback")
        parts.append(f"The expert-approved next action is “{approved_edge.label}”." + (f" {feedback}" if feedback else ""))
    elif node.instructions:
        parts.append(node.instructions)
    return " ".join(parts) or "Follow the approved instructions for this step."


def set_paused(db: Session, user: User, attempt_id: str, paused: bool) -> MissionAttempt:
    attempt = get_attempt(db, user, attempt_id)
    if attempt.status != "in_progress":
        raise ValidationError(code="mission_finished", message="This mission has ended.")
    _tick(attempt)
    state = _state(attempt)
    state["paused"] = paused
    _save(attempt, state)
    attempt.resumed_at = None if paused else utc_now()
    db.commit()
    return attempt


def abandon(db: Session, user: User, attempt_id: str) -> MissionAttempt:
    attempt = get_attempt(db, user, attempt_id)
    if attempt.status == "in_progress":
        _tick(attempt)
        attempt.status = "abandoned"
        attempt.resumed_at = None
        db.commit()
    return attempt


# ---------------------------------------------------------------------------
# Scoring, XP and achievements
# ---------------------------------------------------------------------------

def compute_score(attempt: MissionAttempt, version: TroubleshootingVersion, guide: TroubleshootingGuide, state: dict) -> dict:
    counts = state["counts"]
    path, _ = approved_path(version)
    visited = set(state["visited"])
    missed = [node for node, _ in path if node.id not in visited and (node.node_type == "safety" or (node.details or {}).get("sim_critical"))]
    available = _evidence_keys(path)
    found = {e["key"] for e in state["evidence"]} & available
    diagnosis = state.get("diagnosis") or {"accuracy": 1.0}
    corrective = state.get("corrective") or {"accuracy": 1.0}
    hints = state.get("hints", {})
    breakdown = {
        "root_cause": round(SCORE_MAX["root_cause"] * float(diagnosis.get("accuracy", 0))),
        "decisions": max(0, SCORE_MAX["decisions"] - 5 * counts["wrong"] - 2 * counts["acceptable"] - 2 * counts["premature"]
                         - counts["unnecessary"] - 5 * len(missed)),
        "safety": max(0, SCORE_MAX["safety"] - 10 * counts["violations"]),
        "evidence": round(SCORE_MAX["evidence"] * (len(found) / len(available))) if available else SCORE_MAX["evidence"],
        "corrective": max(0, round(SCORE_MAX["corrective"] * float(corrective.get("accuracy", 0))) - 2 * state.get("corrective_retries", 0)),
        "assistance": max(0, SCORE_MAX["assistance"] - hints.get("2", 0) - 2 * hints.get("3", 0)),
    }
    # Speed only earns points when the mission was completed safely.
    expected = (guide.estimated_minutes or 10) * 60
    if counts["violations"] == 0:
        ratio = attempt.active_seconds / expected if expected else 1
        breakdown["efficiency"] = SCORE_MAX["efficiency"] if ratio <= 1 else max(0, round(SCORE_MAX["efficiency"] * (2 - ratio)))
    else:
        breakdown["efficiency"] = 0
    return {
        "total": sum(breakdown.values()),
        "breakdown": breakdown,
        "max": SCORE_MAX,
        "missed_checkpoints": [n.title for n in missed],
        "evidence_found": len(found),
        "evidence_available": len(available),
    }


def _finish(db: Session, attempt: MissionAttempt, version: TroubleshootingVersion) -> MissionAttempt:
    guide = db.get(TroubleshootingGuide, attempt.guide_id)
    _tick(attempt)
    attempt.resumed_at = None
    state = _state(attempt)
    score = compute_score(attempt, version, guide, state)
    previous_best = (db.query(MissionAttempt)
                     .filter(MissionAttempt.user_id == attempt.user_id, MissionAttempt.guide_id == guide.id,
                             MissionAttempt.status == "completed", MissionAttempt.id != attempt.id)
                     .order_by(MissionAttempt.total_score.desc()).first())
    best_before = previous_best.total_score if previous_best else None
    earned = round(_xp_reward(guide) * score["total"] / 100)
    best_xp_before = round(_xp_reward(guide) * (best_before or 0) / 100)
    # Replays only award the improvement over the trainee's personal best, so XP can't be farmed.
    xp = max(0, earned - best_xp_before)

    earned_codes = set()
    counts = state["counts"]
    diagnosis = state.get("diagnosis") or {}
    conditions = {
        "first_responder": True,
        "sharp_observer": score["evidence_available"] > 0 and score["evidence_found"] == score["evidence_available"],
        "safety_first": counts["violations"] == 0,
        "root_cause_master": float(diagnosis.get("accuracy", 0)) == 1.0 and bool(diagnosis.get("correct")),
        "diagnostic_expert": guide.difficulty in {"ADVANCED", "EXPERT"} and score["total"] >= 85,
        "independent_investigator": not state["hints"].get("2") and not state["hints"].get("3"),
    }
    existing = {a.code for a in db.query(MissionAchievement).filter(MissionAchievement.user_id == attempt.user_id)}
    for code, met in conditions.items():
        if met and code not in existing:
            db.add(MissionAchievement(user_id=attempt.user_id, code=code, attempt_id=attempt.id))
            earned_codes.add(code)
    xp += ACHIEVEMENT_XP * len(earned_codes)

    score.update({"xp_earned": earned, "xp_awarded": xp, "new_achievements": sorted(earned_codes),
                  "previous_best": best_before, "is_personal_best": best_before is None or score["total"] > best_before})
    attempt.score = score
    attempt.total_score = score["total"]
    attempt.xp_awarded = xp
    attempt.status = "completed"
    attempt.stage = "complete"
    attempt.completed_at = utc_now()
    db.commit()
    db.refresh(attempt)
    return attempt


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def _reading(raw) -> Optional[dict]:
    return raw if isinstance(raw, dict) and raw else None


def _node_view(db: Session, attempt: MissionAttempt, state: dict, node: TroubleshootingNode) -> dict:
    details = node.details or {}
    kind = node_kind(node)
    checks = state["checks"].get(node.id, [])
    actions = []
    if attempt.stage == "investigate" and node.node_type not in TERMINAL_NODE_TYPES:
        for edge in _out(node):
            sim = edge_sim(edge)
            if not edge.to_node_id and sim.get("outcome", "neutral") in ADVANCING:
                continue
            reveal = sim.get("outcome") == "reveal"
            actions.append({
                "edge_id": edge.id, "label": edge.label, "zone": sim.get("zone"),
                "kind": "check" if reveal else "advance", "done": edge.id in checks,
                "attempted_wrong": any(ev.get("edge_id") == edge.id and ev.get("outcome") in {"wrong", "unsafe"} for ev in state["events"]),
            })
    from app.services.decision_tree_walk_service import workflow_info
    terminal = node.node_type in TERMINAL_NODE_TYPES
    return {
        "id": node.id,
        "node_type": node.node_type,
        "kind": kind,
        "kind_label": KIND_LABELS.get(kind, "Step"),
        # The result's title names the fault, so it stays hidden until the diagnosis is submitted.
        "title": node.title if not terminal or attempt.stage in {"correct", "verify", "complete"} else "Fault identification",
        "instructions": (node.instructions or "") if not terminal else "",
        "zone": details.get("sim_zone"),
        "media": [media_payload(m) for m in node.media_assets or []] if kind in {"evidence", "inspection", "diagnostic_test", "multi_action", "decision", "explanation"} else [],
        "safety": {
            "warning": node.safety_warning,
            "ppe": details.get("ppe") or [],
            "precautions": details.get("precautions") or [],
            "restricted": details.get("restricted_operations") or [],
        },
        "needs_ack": node.node_type == "safety" and node.id not in state["safety_ack"],
        "has_inspection": bool(details.get("sim_clue") or details.get("sim_reading")),
        "inspected": node.id in state["performed"],
        "min_checks": int(details.get("sim_min_checks") or 0),
        "checks_done": len(checks),
        "critical": bool(details.get("sim_critical")),
        "terms": details.get("technical_terms") or [],
        "workflow": workflow_info(db, node.linked_workflow_version_id),
        "actions": actions,
    }


def _map(version: TroubleshootingVersion, attempt: MissionAttempt, state: dict) -> dict:
    nodes = {n.id: n for n in version.nodes}
    path, _ = approved_path(version)
    approved_total = max(1, len(path) - 1)
    approved_ids = [n.id for n, _ in path]
    stages = []
    for index, node_id in enumerate(state["visited"]):
        node = nodes.get(node_id)
        if not node:
            continue
        current = node_id == attempt.current_node_id and attempt.stage == "investigate"
        stages.append({"node_id": node_id, "kind": node_kind(node), "label": KIND_LABELS.get(node_kind(node)),
                       "title": node.title if node.node_type not in TERMINAL_NODE_TYPES or attempt.stage != "diagnose" else "Fault identified",
                       "status": "current" if current else "done"})
    current = nodes.get(attempt.current_node_id)
    branches = []
    if current and attempt.stage == "investigate":
        for edge in _out(current):
            sim = edge_sim(edge)
            if sim.get("outcome") == "reveal" or not edge.to_node_id:
                continue
            locked = sim.get("outcome") in {"wrong", "unsafe"} and any(
                ev.get("edge_id") == edge.id for ev in state["events"])
            branches.append({"label": edge.label, "locked": locked})
    reached = sum(1 for node_id in dict.fromkeys(state["visited"]) if node_id in approved_ids)
    investigate_pct = min(1.0, reached / approved_total) if approved_total else 1.0
    stage_pct = {"investigate": 60 * investigate_pct, "diagnose": 60, "correct": 80, "verify": 90, "complete": 100}[attempt.stage]
    return {
        "stages": stages,
        "branches": branches,
        "resolution": [
            {"key": "diagnose", "label": "Root cause", "status": _stage_status(attempt.stage, "diagnose")},
            {"key": "correct", "label": "Corrective action", "status": _stage_status(attempt.stage, "correct")},
            {"key": "verify", "label": "Verification", "status": _stage_status(attempt.stage, "verify")},
        ],
        "progress": round(stage_pct),
    }


def _trainee_tree(db: Session, version: TroubleshootingVersion, attempt: MissionAttempt, state: dict) -> dict:
    """Return the published topology with progressive disclosure for unreached branches."""
    visited_order = list(dict.fromkeys(state.get("visited") or []))
    visited = set(visited_order)
    by_id = {node.id: node for node in version.nodes}
    evidence_nodes = {item.get("node_id") for item in state.get("evidence", [])}
    evidence_edges = {event.get("edge_id") for event in state.get("events", [])
                      if event.get("type") == "check" and event.get("outcome") == "evidence"}
    successful_edges = {event.get("edge_id") for event in state.get("events", [])
                        if event.get("type") == "decision" and event.get("outcome") in ADVANCING}
    failed_edges = {event.get("edge_id") for event in state.get("events", [])
                    if event.get("outcome") in {"wrong", "unsafe"}}
    current = by_id.get(attempt.current_node_id)
    current_view = _node_view(db, attempt, state, current) if current else None
    available_edges = {action["edge_id"] for action in (current_view or {}).get("actions", [])}
    can_advance = bool(current and attempt.stage == "investigate")
    if current and can_advance:
        details = current.details or {}
        can_advance = (
            (not (details.get("sim_clue") or details.get("sim_reading")) or current.id in state.get("performed", []))
            and len(state.get("checks", {}).get(current.id, [])) >= int(details.get("sim_min_checks") or 0)
            and (current.node_type != "safety" or current.id in state.get("safety_ack", []))
        )

    reachable = set()
    if can_advance and current:
        reachable = {edge.to_node_id for edge in _out(current)
                     if edge.to_node_id and edge.id in available_edges
                     and edge_sim(edge).get("outcome", "neutral") in ADVANCING}

    node_views = []
    visit_positions = {node_id: index + 1 for index, node_id in enumerate(visited_order)}
    reveal_terminal_titles = attempt.stage in {"correct", "verify", "complete"}
    for node in version.nodes:
        details = node.details or {}
        kind = node_kind(node)
        is_current = node.id == attempt.current_node_id and attempt.stage in {"investigate", "diagnose"}
        is_reached = node.id in visited
        reached_terminal_hidden = node.node_type in TERMINAL_NODE_TYPES and not reveal_terminal_titles
        if is_current:
            status = "current"
        elif node.id in evidence_nodes:
            status = "evidence_found"
        elif is_reached:
            status = "completed"
        elif node.id in reachable:
            status = "available"
        elif any(edge.to_node_id == node.id and edge.id in failed_edges for edge in version.edges):
            status = "failed_attempt"
        else:
            status = "locked"

        disclosed = is_reached or is_current
        from app.services.decision_tree_walk_service import workflow_info
        node_view = {
            "id": node.id,
            "node_type": node.node_type,
            "kind": kind,
            "kind_label": KIND_LABELS.get(kind, "Step"),
            "title": ("Fault identification" if reached_terminal_hidden else node.title) if disclosed else KIND_LABELS.get(kind, "Locked step"),
            "status": status,
            "is_start": bool(node.is_start),
            "is_final": node.node_type in TERMINAL_NODE_TYPES,
            "critical": bool(details.get("sim_critical") or node.node_type == "safety"),
            "evidence_found": node.id in evidence_nodes,
            "visit_order": visit_positions.get(node.id),
            "zone": details.get("sim_zone") if disclosed else None,
            "instructions": (node.instructions or "") if disclosed and not reached_terminal_hidden else "",
            "media": [media_payload(media) for media in node.media_assets or []]
                if disclosed and not reached_terminal_hidden else [],
            "safety": ({
                "warning": node.safety_warning,
                "ppe": details.get("ppe") or [],
                "precautions": details.get("precautions") or [],
                "restricted": details.get("restricted_operations") or [],
            } if disclosed else None),
            "terms": details.get("technical_terms") or [] if disclosed else [],
            "workflow": workflow_info(db, node.linked_workflow_version_id) if disclosed else None,
            "findings": [item for item in state.get("evidence", []) if item.get("node_id") == node.id] if disclosed else [],
            "actions": current_view["actions"] if is_current and current_view else [],
        }
        node_views.append(node_view)

    edge_views = []
    for edge in version.edges:
        sim = edge_sim(edge)
        if edge.id in successful_edges:
            status = "completed"
        elif edge.id in failed_edges:
            status = "failed_attempt"
        elif edge.id in evidence_edges:
            status = "evidence_found"
        elif edge.id in available_edges:
            status = "available"
        else:
            status = "locked"
        disclose_label = status != "locked"
        edge_views.append({
            "id": edge.id,
            "source": edge.from_node_id,
            "target": edge.to_node_id,
            "label": edge.label if disclose_label else None,
            "status": status,
            "conditional": bool(edge.condition),
        })

    # The simulator's repair, verification, and completion phases follow the
    # published decision tree. Keep them visible as runtime stages on the same
    # canvas while the authored node connections above remain unchanged.
    runtime_stages = [
        ("$runtime:corrective", "corrective_action", "Corrective action", "correct"),
        ("$runtime:verification", "verification", "Verification", "verify"),
        ("$runtime:complete", "mission_complete", "Mission complete", "complete"),
    ]
    stage_order = ["investigate", "diagnose", "correct", "verify", "complete"]
    current_stage_index = stage_order.index(attempt.stage)
    for node_id, kind, title, phase in runtime_stages:
        phase_index = stage_order.index(phase)
        status = "current" if phase_index == current_stage_index else "completed" if phase_index < current_stage_index else "locked"
        node_views.append({
            "id": node_id, "node_type": "mission_stage", "kind": kind, "kind_label": title,
            "title": title, "status": status, "is_start": False, "is_final": phase == "complete",
            "critical": phase == "correct", "evidence_found": False, "visit_order": None, "zone": None,
            "instructions": "", "media": [], "safety": None, "actions": [], "runtime_stage": True,
        })
    terminal_nodes = [node for node in version.nodes if node.node_type in TERMINAL_NODE_TYPES]
    for terminal in terminal_nodes:
        reached = terminal.id in visited
        edge_status = "completed" if reached and attempt.stage in {"correct", "verify", "complete"} else "available" if reached else "locked"
        edge_views.append({"id": f"$runtime:{terminal.id}:corrective", "source": terminal.id,
                           "target": "$runtime:corrective", "label": "Continue to repair" if edge_status != "locked" else None,
                           "status": edge_status, "conditional": False, "runtime_stage": True})
    runtime_edge_specs = [
        ("$runtime:corrective", "$runtime:verification", "Repair confirmed", "verify"),
        ("$runtime:verification", "$runtime:complete", "Verification passed", "complete"),
    ]
    for source, target, label, phase in runtime_edge_specs:
        phase_index = stage_order.index(phase)
        edge_status = "completed" if current_stage_index >= phase_index else "available" if current_stage_index == phase_index - 1 else "locked"
        edge_views.append({"id": f"{source}->{target}", "source": source, "target": target,
                           "label": label if edge_status != "locked" else None, "status": edge_status,
                           "conditional": False, "runtime_stage": True})
    canvas_current = attempt.current_node_id if attempt.stage in {"investigate", "diagnose"} else {
        "correct": "$runtime:corrective", "verify": "$runtime:verification", "complete": "$runtime:complete",
    }[attempt.stage]
    return {"nodes": node_views, "edges": edge_views, "current_node_id": canvas_current, "stage": attempt.stage}


def _stage_status(stage: str, key: str) -> str:
    order = ["investigate", "diagnose", "correct", "verify", "complete"]
    if order.index(stage) > order.index(key):
        return "done"
    return "current" if stage == key else "locked"


def _report(db: Session, attempt: MissionAttempt, version: TroubleshootingVersion, state: dict) -> dict:
    nodes = {n.id: n for n in version.nodes}
    path, target = approved_path(version)
    approved_edge = {node.id: edge for node, edge in path}
    events_by_node = defaultdict(list)
    for event in state["events"]:
        if event.get("node_id"):
            events_by_node[event["node_id"]].append(event)
    replay, did_well, mistakes = [], [], []
    for node_id in dict.fromkeys(state["visited"]):
        node = nodes.get(node_id)
        if not node or node.node_type in TERMINAL_NODE_TYPES:
            continue
        events = events_by_node[node_id]
        advance = next((e for e in reversed(events) if e["type"] == "decision" and e.get("outcome") in ADVANCING), None)
        approved = approved_edge.get(node_id)
        wrong = [e for e in events if e.get("outcome") in {"wrong", "unsafe", "premature"}]
        entry = {
            "node_id": node_id, "title": node.title, "kind": node_kind(node), "kind_label": KIND_LABELS.get(node_kind(node)),
            "your_choice": advance.get("label") if advance else None,
            "approved_choice": approved.label if approved else None,
            "matches": bool(advance and approved and advance.get("edge_id") == approved.id),
            "on_approved_path": node_id in approved_edge,
            "checks": [e.get("label") for e in events if e["type"] == "check"],
            "missteps": [{"label": e.get("label"), "outcome": e["outcome"], "feedback": e.get("feedback")} for e in wrong],
            "explanation": node.help_text,
        }
        replay.append(entry)
        if entry["matches"] and not wrong:
            did_well.append(f"Chose “{entry['your_choice']}” at “{node.title}”, matching the expert-approved path.")
        for miss in wrong:
            mistakes.append({"what": f"“{miss['label']}” at “{node.title}”", "why": miss["feedback"],
                             "approved": f"Expert-approved: “{approved.label}”" if approved else None})
        if advance and approved and not entry["matches"]:
            mistakes.append({"what": f"Continued with “{advance.get('label')}” at “{node.title}”",
                             "why": edge_sim(approved).get("feedback") or node.help_text,
                             "approved": f"Expert-approved: “{approved.label}”"})
    resources, seen = [], set()
    for node, _ in path:
        if node.linked_knowledge_version_id and node.linked_knowledge_version_id not in seen:
            seen.add(node.linked_knowledge_version_id)
            kv = db.get(KnowledgeVersion, node.linked_knowledge_version_id)
            if kv and kv.status == "published":
                resources.append({"type": "knowledge", "title": kv.title, "item_id": kv.item_id})
        if node.linked_workflow_version_id and node.linked_workflow_version_id not in seen:
            seen.add(node.linked_workflow_version_id)
            from app.services.decision_tree_walk_service import workflow_info
            info = workflow_info(db, node.linked_workflow_version_id)
            if info and info["available"]:
                resources.append({"type": "workflow", "title": info["title"], "id": info["id"]})
        for media in node.media_assets or []:
            if media.id not in seen:
                seen.add(media.id)
                resources.append({"type": "media", "title": media.title or media.original_name, "id": media.id, "url": f"/api/v1/media/{media.id}"})
    score = attempt.score or {}
    if score.get("breakdown", {}).get("safety") == SCORE_MAX["safety"]:
        did_well.append("Completed the mission without a safety violation.")
    if score.get("evidence_available") and score.get("evidence_found") == score.get("evidence_available"):
        did_well.append("Collected every piece of evidence on the approved path.")
    counts = state["counts"]
    return {
        "score": score,
        "stats": {**counts, "hints_smart": state["hints"].get("2", 0), "hints_expert": state["hints"].get("3", 0),
                  "time_seconds": attempt.active_seconds},
        "diagnosis": state.get("diagnosis"),
        "corrective": state.get("corrective"),
        "fault": {"title": target.title, "summary": target.instructions} if target else None,
        "replay": replay,
        "did_well": did_well,
        "mistakes": mistakes,
        "resources": resources,
        "achievements": [{"code": code, "title": ACHIEVEMENTS[code][0], "description": ACHIEVEMENTS[code][1]}
                         for code in score.get("new_achievements", [])],
    }


def attempt_payload(db: Session, attempt: MissionAttempt) -> dict:
    version = db.get(TroubleshootingVersion, attempt.version_id)
    guide = db.get(TroubleshootingGuide, attempt.guide_id)
    machine = db.get(Machine, guide.machine_id) if guide.machine_id else None
    cover = db.get(MediaAsset, guide.cover_media_id) if guide.cover_media_id else None
    state = _state(attempt)
    node = db.get(TroubleshootingNode, attempt.current_node_id) if attempt.current_node_id else None
    elapsed = attempt.active_seconds
    if attempt.resumed_at and attempt.status == "in_progress":
        now = utc_now()
        resumed = attempt.resumed_at if attempt.resumed_at.tzinfo else attempt.resumed_at.replace(tzinfo=now.tzinfo)
        elapsed += max(0, int((now - resumed).total_seconds()))
    preview_state = state
    if not preview_state.get("diagnosis"):
        preview_state["diagnosis"] = {"accuracy": 0}
    if not preview_state.get("corrective"):
        preview_state["corrective"] = {"accuracy": 0}
    score_preview = compute_score(attempt, version, guide, preview_state)
    if attempt.status != "completed":
        score_preview["missed_checkpoints"] = []
    payload = {
        "id": attempt.id,
        "status": attempt.status,
        "stage": attempt.stage,
        "paused": bool(state.get("paused")),
        "elapsed_seconds": elapsed,
        "mission": {
            "id": guide.id, "code": _mission_code(guide), "title": guide.title, "difficulty": guide.difficulty,
            "objective": (guide.simulation or {}).get("objective") or "Investigate the problem, identify the likely cause, and restore the machine.",
            "machine_name": machine.name if machine else None, "cover_media": media_payload(cover) if cover else None,
            "xp_reward": _xp_reward(guide), "estimated_minutes": guide.estimated_minutes,
            "equipment": (guide.simulation or {}).get("equipment") or [],
            "zones": _zones(version),
        },
        "current": _node_view(db, attempt, state, node) if node else None,
        "evidence": state["evidence"],
        "events": state["events"][-12:],
        "last_event": state["events"][-1] if state["events"] else None,
        "hints": {"used": state["hints"], "current": state["hint_text"].get(attempt.current_node_id, {})},
        "safety": {"violations": state["counts"]["violations"], "status": "warning" if state["counts"]["violations"] else "ok"},
        "map": _map(version, attempt, state),
        "tree": _trainee_tree(db, version, attempt, state),
        "score_preview": {
            **score_preview,
            "xp_projected": round(_xp_reward(guide) * score_preview["total"] / 100),
        },
        "diagnosis": None, "corrective": None, "verification": None, "report": None,
    }
    if node and attempt.stage == "diagnose":
        payload["diagnosis"] = {"options": _shuffled(_diagnosis_options(version, node), attempt.id)}
    if node and attempt.stage == "correct":
        target = _target_result(version, node)
        correct, distractors = _corrective_options(version, target)
        payload["corrective"] = {
            "options": _shuffled(correct + distractors, attempt.id + "c"),
            "fault": target.title,
            "safety": _safety_briefing(version),
            "tools": (guide.simulation or {}).get("equipment") or [],
            "expected": (target.details or {}).get("verification") or (target.details or {}).get("completion_condition"),
            "previous": state.get("corrective"),
            "retries": state.get("corrective_retries", 0),
        }
    if node and attempt.stage == "verify":
        target = _target_result(version, node)
        details = target.details or {}
        payload["verification"] = {
            "conditions": [c for c in [details.get("verification"), details.get("completion_condition")] if c]
                          or ["The machine operates normally and the original symptom no longer appears."],
            "fault": target.title,
        }
    if attempt.status == "completed":
        payload["report"] = _report(db, attempt, version, state)
    return payload


# ---------------------------------------------------------------------------
# Profile and leaderboard
# ---------------------------------------------------------------------------

def profile(db: Session, user: User) -> dict:
    attempts = db.query(MissionAttempt).filter(MissionAttempt.user_id == user.id).order_by(MissionAttempt.started_at.desc()).all()
    total_xp = sum(a.xp_awarded or 0 for a in attempts)
    level = int((total_xp / 100) ** 0.5) + 1
    next_level_xp = (level ** 2) * 100
    earned = {a.code: a.earned_at for a in db.query(MissionAchievement).filter(MissionAchievement.user_id == user.id)}
    best_by_guide: dict[str, int] = {}
    guides: dict[str, TroubleshootingGuide] = {}
    for attempt in attempts:
        if attempt.status == "completed":
            best_by_guide[attempt.guide_id] = max(best_by_guide.get(attempt.guide_id, 0), attempt.total_score or 0)
        guides.setdefault(attempt.guide_id, db.get(TroubleshootingGuide, attempt.guide_id))
    skills: dict[str, list[int]] = defaultdict(list)
    for guide_id, best in best_by_guide.items():
        guide = guides.get(guide_id)
        for skill in ((guide.simulation or {}).get("skills") if guide else None) or [guide.problem_category.replace("_", " ").title() if guide else "General"]:
            skills[skill].append(best)
    return {
        "total_xp": total_xp,
        "level": level,
        "next_level_xp": next_level_xp,
        "completed": sum(1 for a in attempts if a.status == "completed"),
        "achievements": [{"code": code, "title": title, "description": description, "earned_at": earned.get(code)}
                         for code, (title, description) in ACHIEVEMENTS.items()],
        "skills": sorted(({"skill": skill, "score": round(sum(scores) / len(scores)), "missions": len(scores)} for skill, scores in skills.items()),
                         key=lambda s: -s["score"]),
        "history": [
            {"attempt_id": a.id, "mission_id": a.guide_id, "title": guides[a.guide_id].title if guides.get(a.guide_id) else "Mission",
             "status": a.status, "stage": a.stage, "score": a.total_score, "xp": a.xp_awarded, "started_at": a.started_at,
             "completed_at": a.completed_at, "time_seconds": a.active_seconds}
            for a in attempts[:30]
        ],
    }


def leaderboard(db: Session, guide_id: str) -> list[dict]:
    guide = _get_mission(db, guide_id)
    if not (guide.simulation or {}).get("leaderboard"):
        raise NotFoundError(code="leaderboard_disabled", message="This mission has no leaderboard.")
    best: dict[str, MissionAttempt] = {}
    for attempt in db.query(MissionAttempt).filter(MissionAttempt.guide_id == guide.id, MissionAttempt.status == "completed"):
        current = best.get(attempt.user_id)
        if not current or (attempt.total_score or 0) > (current.total_score or 0):
            best[attempt.user_id] = attempt
    rows = sorted(best.values(), key=lambda a: (-(a.total_score or 0), a.active_seconds))[:10]
    result = []
    for rank, attempt in enumerate(rows, start=1):
        user = db.get(User, attempt.user_id)
        result.append({"rank": rank, "name": (user.name.split()[0] if user and user.name else "Trainee"),
                       "score": attempt.total_score, "time_seconds": attempt.active_seconds})
    return result
