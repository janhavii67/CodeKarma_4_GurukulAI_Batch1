"""Evidence-first troubleshooting sessions built on the shared published RAG index."""
import json
import re
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.db.base import utc_now
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import ProcedureRun, ProcedureStep
from app.models.process import ManufacturingProcess
from app.models.troubleshooting import (
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_RESOLVED,
    SESSION_STATUS_UNRESOLVED,
    SESSION_STATUS_ESCALATED,
    TroubleshootingEscalation,
    TroubleshootingResponse,
    TroubleshootingSession,
)
from app.models.user import User
from app.modules.assistant.services.retrieval_service import RetrievalQuery, RetrievalService


STOP_WORDS = {"about", "after", "before", "with", "from", "that", "this", "what", "when", "where", "which", "have", "does", "machine", "issue", "problem", "check"}
VALID_OUTCOMES = {"pass", "fail", "unknown", "issue_persists", "resolved"}


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in STOP_WORDS}


def workflow_issue_context(db: Session, run_id: str, issue_id: str, user_id: str) -> tuple[ProcedureRun, dict, ProcedureStep]:
    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="workflow_run_not_found", message="The linked workflow session was not found.")
    if run.operator_id != user_id:
        raise ForbiddenError(code="unauthorized_run", message="You may only troubleshoot issues from your own workflow sessions.")
    issue = next((row for row in (run.issues or []) if isinstance(row, dict) and row.get("id") == issue_id), None)
    if not issue:
        raise NotFoundError(code="workflow_issue_not_found", message="The linked workflow issue was not found.")
    step = db.get(ProcedureStep, issue.get("step_id")) if issue.get("step_id") else None
    if not step or step.procedure_id != run.procedure_id:
        raise ValidationError(code="workflow_issue_invalid", message="The linked workflow issue does not match a step in this session.")
    return run, issue, step


def retrieve_topics(query: str, user_id: str, db: Session, machine_id: Optional[str] = None, top_k: int = 12, knowledge_item_id: Optional[str] = None) -> list[dict]:
    matches = RetrievalService.retrieve_chunks(
        RetrievalQuery(query=query, user_id=user_id, machine_id=machine_id, knowledge_item_id=knowledge_item_id, top_k=top_k, min_score=0.08), db
    )
    results: list[dict] = []
    seen = set()
    for match in matches:
        version = db.get(KnowledgeVersion, match.knowledge_version_id) if match.knowledge_version_id else None
        if not version or version.status != "published":
            continue
        item = db.get(KnowledgeItem, version.item_id)
        if not item:
            continue
        key = (version.id, match.source_id)
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "item_id": item.id,
            "version_id": version.id,
            "version_no": version.version_no,
            "source_id": match.source_id,
            "title": version.title or item.title,
            "category": item.category,
            "source_type": match.source_type,
            "summary": version.summary,
            "excerpt": match.text,
            "section": match.section_label,
            "score": match.score,
            "machine_id": version.machine_id or item.machine_id,
        })
    def priority(topic: dict) -> tuple[int, float]:
        category = str(topic.get("category") or "").lower()
        source_type = str(topic.get("source_type") or "").lower()
        if "troubleshoot" in category:
            order = 0
        elif "workflow" in category or source_type == "workflow":
            order = 1
        elif source_type in {"transcript", "expert_recording"}:
            order = 2
        else:
            order = 3
        return order, -float(topic.get("score") or 0)

    return sorted(results, key=priority)


def build_documented_checks(db: Session, refs: list[dict], query: str) -> list[dict]:
    """Select only source-authored ordered steps with direct symptom term overlap."""
    query_tokens = _tokens(query)
    versions: dict[str, tuple[KnowledgeVersion, KnowledgeItem, float]] = {}
    for ref in refs:
        version = db.get(KnowledgeVersion, ref["version_id"])
        if not version or version.status != "published":
            continue
        item = db.get(KnowledgeItem, version.item_id)
        if not item:
            continue
        current = versions.get(version.id)
        score = float(ref.get("score") or 0)
        if not current or score > current[2]:
            versions[version.id] = (version, item, score)

    prioritized = sorted(
        versions.values(),
        key=lambda row: (0 if "troubleshoot" in (row[1].category or "").lower() else 1, -row[2]),
    )
    checks: list[dict] = []
    for version, item, _ in prioritized:
        raw_steps = version.steps if isinstance(version.steps, list) else []
        candidates = []
        for index, raw in enumerate(raw_steps, start=1):
            if not isinstance(raw, dict):
                continue
            instruction = str(raw.get("instruction") or raw.get("text") or "").strip()
            if not instruction:
                continue
            content_tokens = _tokens(" ".join([str(raw.get("title") or ""), instruction, str(raw.get("expected_result") or "")]))
            overlap = len(query_tokens & content_tokens)
            # Do not turn an entire unrelated operating procedure into a diagnostic path.
            if query_tokens and overlap == 0:
                continue
            source_ref = next((ref for ref in refs if ref["version_id"] == version.id), None)
            citation = {k: source_ref[k] for k in ("item_id", "version_id", "version_no", "source_id", "title", "category") if source_ref and k in source_ref}
            checks.append({
                "index": len(checks),
                "title": str(raw.get("title") or f"Documented check {index}"),
                "instruction": instruction,
                "why_relevant": "This text is an ordered step in a published source retrieved for the reported symptoms.",
                "tools": raw.get("tools") or [],
                "materials": raw.get("materials") or [],
                "parameters": raw.get("machine_parameters") or raw.get("parameters") or [],
                "safety_warning": raw.get("safety_warning") or raw.get("safety_warning_text") or version.safety_warnings,
                "expected_observation": raw.get("expected_result") or raw.get("expected_observation"),
                "quality_checkpoints": raw.get("quality_checkpoints") or [],
                "authorized_role": raw.get("authorized_role"),
                "source_refs": [citation] if citation else [],
            })
            if len(checks) >= 8:
                return checks
    return checks


def create_session(
    db: Session,
    *,
    user: User,
    reported_symptom: str,
    machine_id: Optional[str] = None,
    process_id: Optional[str] = None,
    problem_category: Optional[str] = None,
    operation_context: Optional[str] = None,
    checked_already: Optional[str] = None,
    workflow_run_id: Optional[str] = None,
    workflow_issue_id: Optional[str] = None,
    required_version_id: Optional[str] = None,
    tutor_context: Optional[dict] = None,
) -> TroubleshootingSession:
    workflow_snapshot = None
    issue_context = ""
    if machine_id:
        from app.models.machine import Machine
        if not db.get(Machine, machine_id):
            raise ValidationError(code="machine_not_found", message="Choose a machine from the registered machine list.")
    if process_id and not db.get(ManufacturingProcess, process_id):
        raise ValidationError(code="process_not_found", message="Choose a manufacturing process from the registered process list.")
    if workflow_run_id or workflow_issue_id:
        if not workflow_run_id or not workflow_issue_id:
            raise ValidationError(code="workflow_context_incomplete", message="Both workflow run and issue identifiers are required.")
        run, issue, step = workflow_issue_context(db, workflow_run_id, workflow_issue_id, user.id)
        procedure = run.procedure
        machine_id = machine_id or procedure.machine_id
        reported_symptom = reported_symptom.strip() or str(issue.get("description") or "")
        issue_context = f"{procedure.title}; step {step.step_order}: {step.title}. {step.instruction}. Issue: {issue.get('description', '')}"
        workflow_snapshot = {
            "run_id": run.id,
            "procedure_id": procedure.id,
            "workflow_revision": procedure.version,
            "knowledge_version_id": procedure.knowledge_version_id,
            "issue_id": issue.get("id"),
            "step_id": step.id,
            "step_order": step.step_order,
            "step_title": step.title,
            "issue_description": issue.get("description"),
        }
    if not reported_symptom.strip():
        raise ValidationError(code="symptom_required", message="Describe what you observed before starting the investigation.")

    query_parts = [reported_symptom.strip(), problem_category or "", operation_context or "", checked_already or "", issue_context]
    query = " ".join(part for part in query_parts if part).strip()
    required_version = None
    if required_version_id:
        required_version = db.get(KnowledgeVersion, required_version_id)
        required_item = db.get(KnowledgeItem, required_version.item_id) if required_version else None
        if (
            not required_version
            or required_version.status != "published"
            or not required_item
            or required_item.current_published_version_id != required_version.id
            or "troubleshoot" not in (required_item.category or "").lower()
        ):
            raise NotFoundError(code="troubleshooting_target_unavailable", message="This troubleshooting source is no longer published.")

    refs = retrieve_topics(
        query,
        user.id,
        db,
        machine_id=machine_id,
        knowledge_item_id=required_version.item_id if required_version else None,
    )
    if required_version and not any(ref.get("version_id") == required_version.id for ref in refs):
        raise NotFoundError(code="troubleshooting_target_unavailable", message="The cited troubleshooting source is no longer available for this machine and symptom.")
    checks = build_documented_checks(db, refs, query)
    context = {
        "operation_context": operation_context,
        "checked_already": checked_already,
        "workflow": workflow_snapshot,
        "evidence_status": "matched_published_knowledge" if refs else "insufficient_evidence",
    }
    if tutor_context:
        context["tutor_handoff"] = {
            key: tutor_context[key]
            for key in ("conversation_id", "message_id", "source_version_id")
            if key in tutor_context
        }
    session = TroubleshootingSession(
        user_id=user.id,
        guide_version_id=None,
        machine_id=machine_id,
        process_id=process_id,
        problem_category=problem_category,
        reported_symptom=reported_symptom.strip(),
        current_check_index=0,
        context=context,
        checks_snapshot=checks,
        source_refs=refs,
        workflow_run_id=workflow_run_id,
        workflow_issue_id=workflow_issue_id,
        status=SESSION_STATUS_IN_PROGRESS,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_owned_session(db: Session, session_id: str, user_id: str, role_id: str, permissions: Optional[list[str]] = None) -> TroubleshootingSession:
    session = db.get(TroubleshootingSession, session_id)
    if not session:
        raise NotFoundError(code="troubleshooting_session_not_found", message="Troubleshooting session was not found.")
    assigned_reviewer = (
        "knowledge.approve" in (permissions or [])
        and session.escalation is not None
        and session.escalation.assigned_expert_id == user_id
    )
    if session.user_id != user_id and role_id != "ADMIN" and not assigned_reviewer:
        raise NotFoundError(code="troubleshooting_session_not_found", message="Troubleshooting session was not found.")
    return session


def record_check_outcome(db: Session, session: TroubleshootingSession, check_index: int, outcome: str, observation: Optional[str]) -> TroubleshootingSession:
    if session.status != SESSION_STATUS_IN_PROGRESS:
        raise ValidationError(code="session_not_active", message="This troubleshooting session is not active.")
    checks = session.checks_snapshot or []
    if check_index < 0 or check_index >= len(checks):
        raise ValidationError(code="check_not_found", message="That documented check is not part of this session.")
    if check_index != session.current_check_index:
        raise ValidationError(code="check_not_current", message="Navigate to this check before recording an outcome.")
    if outcome not in VALID_OUTCOMES:
        raise ValidationError(code="invalid_outcome", message="Choose pass, fail, unknown, issue_persists, or resolved.")
    if outcome == "resolved":
        session.status = SESSION_STATUS_RESOLVED
        session.ended_at = utc_now()
    response = TroubleshootingResponse(
        session_id=session.id,
        node_id=None,
        check_index=check_index,
        outcome=outcome,
        answer=json.dumps({"outcome": outcome, "observation": (observation or "").strip()}, ensure_ascii=False),
        server_timestamp=utc_now(),
    )
    db.add(response)
    db.flush()
    # Checks are sequential only. A failed result never asserts a root cause.
    if outcome != "resolved" and check_index + 1 < len(checks):
        session.current_check_index = check_index + 1
    elif outcome in {"fail", "unknown", "issue_persists"} and check_index + 1 >= len(checks):
        session.status = SESSION_STATUS_UNRESOLVED
        session.ended_at = utc_now()
    db.commit()
    db.refresh(session)
    return session


def session_payload(session: TroubleshootingSession) -> dict:
    responses = []
    for response in session.responses:
        try:
            answer = json.loads(response.answer)
        except (ValueError, TypeError):
            answer = {"observation": response.answer}
        responses.append({
            "id": response.id,
            "check_index": response.check_index,
            "outcome": response.outcome,
            "observation": answer.get("observation"),
            "recorded_at": response.server_timestamp,
        })
    return {
        "id": session.id,
        "user_id": session.user_id,
        "reported_symptom": session.reported_symptom,
        "machine_id": session.machine_id,
        "process_id": session.process_id,
        "problem_category": session.problem_category,
        "workflow_run_id": session.workflow_run_id,
        "workflow_issue_id": session.workflow_issue_id,
        "context": session.context or {},
        "source_refs": session.source_refs or [],
        "checks": session.checks_snapshot or [],
        "current_check_index": session.current_check_index,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "responses": responses,
        "escalation": ({
            "id": session.escalation.id,
            "reason": session.escalation.reason,
            "status": session.escalation.status,
            "requested_at": session.escalation.requested_at,
        } if session.escalation else None),
    }
