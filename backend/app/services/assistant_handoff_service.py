"""Permission-checked, evidence-backed entry points from Tutor answers to existing modules."""
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.permissions import (
    AuthenticatedContext,
    PERM_PROCEDURE_EXECUTE,
    PERM_TROUBLESHOOT_USE,
)
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import Procedure, ProcedureRun
from app.models.troubleshooting import SESSION_STATUS_IN_PROGRESS, TroubleshootingSession
from app.modules.assistant.models import (
    ChatConversation,
    ChatMessage,
    KnowledgeSource,
    MESSAGE_ROLE_ASSISTANT,
    MESSAGE_ROLE_USER,
    EVIDENCE_STATUS_SUFFICIENT,
)
from app.modules.assistant.services.eligibility import get_eligibility_service
from app.schemas.assistant import TutorHandoffSuggestion
from app.services.procedure_service import (
    is_workflow_currently_published,
    start_or_resume_workflow_run,
)


_WORKFLOW_INTENT = re.compile(
    r"\b(?:how\s+(?:do\s+i|to)|steps?|walk\s+me\s+through|procedure|sop|"
    r"checklist|daily\s+checks?|before\s+operating|operate|setup|set\s*up|"
    r"start\s*up|perform|carry\s+out)\b",
    re.IGNORECASE,
)
_TROUBLESHOOTING_INTENT = re.compile(
    r"\b(?:problem|issue|fault|failure|error|alarm|troubleshoot|diagnos(?:e|is)|"
    r"investigat(?:e|ion)|not\s+working|won't|will\s+not|doesn't|does\s+not|"
    r"leak|vibrat\w*|noise|noisy|overheat\w*|stuck|jam(?:med)?|malfunction)\b",
    re.IGNORECASE,
)

_WORKFLOW_REASON = "A current approved workflow matches the cited knowledge and your request for operating steps."
_TROUBLESHOOTING_REASON = "A current published troubleshooting source matches the cited evidence and reported problem."


def _published_version(db: Session, version_id: str) -> tuple[KnowledgeVersion, KnowledgeItem] | None:
    version = db.get(KnowledgeVersion, version_id)
    item = db.get(KnowledgeItem, version.item_id) if version else None
    if not version or not item or version.status != "published" or item.current_published_version_id != version.id:
        return None
    return version, item


def _cited_versions(db: Session, auth_ctx: AuthenticatedContext, source_rows: list[Any]) -> list[dict[str, Any]]:
    """Resolve only still-eligible cited sources to current published revisions."""
    eligibility = get_eligibility_service()
    resolved: dict[str, dict[str, Any]] = {}
    for row in source_rows:
        source_id = getattr(row, "source_id", None) or (row.get("source_id") if isinstance(row, dict) else None)
        if not source_id or not eligibility.is_source_eligible(source_id, auth_ctx.user.id, db):
            continue
        source = db.get(KnowledgeSource, source_id)
        if not source or not source.knowledge_version_id:
            continue
        current = _published_version(db, source.knowledge_version_id)
        if not current:
            continue
        version, item = current
        resolved[version.id] = {
            "version": version,
            "item": item,
            "source": source,
            "ref": {
                "item_id": item.id,
                "version_id": version.id,
                "version_no": version.version_no,
                "source_id": source.id,
                "title": version.title or item.title,
                "category": item.category,
            },
        }
    return list(resolved.values())


def _workflow_suggestions(db: Session, auth_ctx: AuthenticatedContext, question: str, cited: list[dict[str, Any]], machine_id: str | None) -> list[TutorHandoffSuggestion]:
    if PERM_PROCEDURE_EXECUTE not in auth_ctx.permissions or not _WORKFLOW_INTENT.search(question):
        return []
    cited_version_ids = {entry["version"].id for entry in cited}
    if not cited_version_ids:
        return []

    results: list[TutorHandoffSuggestion] = []
    procedures = db.query(Procedure).filter(Procedure.status == "APPROVED").order_by(Procedure.title).all()
    for procedure in procedures:
        if not procedure.steps or not is_workflow_currently_published(db, procedure):
            continue
        cited_machine_ids = {
            entry["version"].machine_id or entry["item"].machine_id or entry["source"].machine_id
            for entry in cited
            if entry["version"].machine_id or entry["item"].machine_id or entry["source"].machine_id
        }
        if procedure.machine_id and machine_id and procedure.machine_id != machine_id:
            continue
        if procedure.machine_id and cited_machine_ids and procedure.machine_id not in cited_machine_ids:
            continue
        related_versions = {procedure.knowledge_version_id} if procedure.knowledge_version_id else set()
        related_versions.update(
            ref.get("version_id") for ref in (procedure.source_refs or [])
            if isinstance(ref, dict) and ref.get("version_id")
        )
        if not (related_versions & cited_version_ids):
            continue
        results.append(TutorHandoffSuggestion(
            kind="workflow",
            target_id=procedure.id,
            title=procedure.title,
            reason=_WORKFLOW_REASON,
        ))
        if len(results) == 1:
            break
    return results


def _troubleshooting_suggestions(db: Session, auth_ctx: AuthenticatedContext, question: str, cited: list[dict[str, Any]], machine_id: str | None) -> list[TutorHandoffSuggestion]:
    if PERM_TROUBLESHOOT_USE not in auth_ctx.permissions or not _TROUBLESHOOTING_INTENT.search(question):
        return []

    from app.services.troubleshooting_service import build_documented_checks

    results: list[TutorHandoffSuggestion] = []
    for entry in cited:
        version = entry["version"]
        item = entry["item"]
        category = (item.category or "").lower()
        if "troubleshoot" not in category:
            continue
        target_machine_id = version.machine_id or item.machine_id
        if machine_id and target_machine_id and machine_id != target_machine_id:
            continue
        if not build_documented_checks(db, [entry["ref"]], question):
            continue
        results.append(TutorHandoffSuggestion(
            kind="troubleshooting",
            target_id=version.id,
            title=version.title or item.title,
            reason=_TROUBLESHOOTING_REASON,
        ))
        if len(results) == 1:
            break
    return results


def get_tutor_handoffs(
    db: Session,
    auth_ctx: AuthenticatedContext,
    question: str,
    cited_sources: list[Any],
    machine_id: str | None = None,
) -> list[TutorHandoffSuggestion]:
    """Build recommendations only from cited, current, published targets the user can start."""
    if not question.strip() or not cited_sources:
        return []
    cited = _cited_versions(db, auth_ctx, cited_sources)
    if not cited:
        return []
    return [
        *_workflow_suggestions(db, auth_ctx, question, cited, machine_id),
        *_troubleshooting_suggestions(db, auth_ctx, question, cited, machine_id),
    ]


def _latest_question(db: Session, conversation: ChatConversation, assistant_message: ChatMessage) -> str:
    prior = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.conversation_id == conversation.id,
            ChatMessage.role == MESSAGE_ROLE_USER,
            ChatMessage.created_at <= assistant_message.created_at,
        )
        .order_by(ChatMessage.created_at.desc())
        .first()
    )
    return prior.content if prior else ""


def start_tutor_handoff(
    db: Session,
    auth_ctx: AuthenticatedContext,
    *,
    kind: str,
    target_id: str,
    conversation_id: str,
    message_id: str,
) -> dict[str, Any]:
    """Revalidate a Tutor card at click time and start/resume the existing module session."""
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or conversation.user_id != auth_ctx.user.id or conversation.status == "deleted":
        raise NotFoundError(code="conversation_not_found", message="The Tutor conversation was not found.")
    message = db.get(ChatMessage, message_id)
    if not message or message.conversation_id != conversation.id or message.role != MESSAGE_ROLE_ASSISTANT:
        raise NotFoundError(code="assistant_message_not_found", message="The Tutor answer was not found.")
    if message.audio_analysis_job_id or message.evidence_status != EVIDENCE_STATUS_SUFFICIENT:
        raise ValidationError(code="handoff_unavailable", message="This answer does not have current evidence for a module handoff.")

    cited = [row for row in message.message_sources if row.cited]
    eligibility = get_eligibility_service()
    if not cited or not all(
        eligibility.is_chunk_eligible(row.chunk_id, auth_ctx.user.id, db)
        and eligibility.is_source_eligible(row.source_id, auth_ctx.user.id, db)
        for row in cited
    ):
        raise NotFoundError(code="handoff_unavailable", message="The cited knowledge is no longer current or available.")

    question = _latest_question(db, conversation, message)
    suggestions = get_tutor_handoffs(db, auth_ctx, question, cited, machine_id=conversation.machine_id)
    suggestion = next((row for row in suggestions if row.kind == kind and row.target_id == target_id), None)
    if not suggestion:
        raise NotFoundError(code="handoff_target_unavailable", message="This handoff is no longer available. Ask the Tutor again for current guidance.")

    if kind == "workflow":
        if PERM_PROCEDURE_EXECUTE not in auth_ctx.permissions:
            raise ForbiddenError(code="forbidden", message="You do not have permission to start guided workflows.")
        procedure = db.get(Procedure, target_id)
        if not procedure or not is_workflow_currently_published(db, procedure):
            raise NotFoundError(code="workflow_not_found", message="This workflow is no longer published.")
        run, resumed = start_or_resume_workflow_run(db, procedure, auth_ctx.user.id)
        return {"kind": kind, "session_id": run.id, "title": procedure.title, "resumed": resumed}

    if kind == "troubleshooting":
        if PERM_TROUBLESHOOT_USE not in auth_ctx.permissions:
            raise ForbiddenError(code="forbidden", message="You do not have permission to start troubleshooting sessions.")
        entry = next((row for row in _cited_versions(db, auth_ctx, cited) if row["version"].id == target_id), None)
        if not entry:
            raise NotFoundError(code="troubleshooting_target_unavailable", message="This troubleshooting source is no longer published.")

        active_sessions = (
            db.query(TroubleshootingSession)
            .filter(
                TroubleshootingSession.user_id == auth_ctx.user.id,
                TroubleshootingSession.status == SESSION_STATUS_IN_PROGRESS,
            )
            .order_by(TroubleshootingSession.started_at.desc())
            .limit(200)
            .all()
        )
        existing = next((session for session in active_sessions if any(
            isinstance(ref, dict) and ref.get("version_id") == target_id
            for ref in (session.source_refs or [])
        ) and session.reported_symptom.strip().casefold() == question.strip().casefold()), None)
        if existing:
            return {"kind": kind, "session_id": existing.id, "title": suggestion.title, "resumed": True}

        from app.services.troubleshooting_service import create_session

        session = create_session(
            db,
            user=auth_ctx.user,
            reported_symptom=question,
            machine_id=conversation.machine_id or entry["version"].machine_id or entry["item"].machine_id,
            required_version_id=target_id,
            tutor_context={
                "conversation_id": conversation.id,
                "message_id": message.id,
                "source_version_id": target_id,
            },
        )
        from app.services.audit_service import AuditService
        AuditService.log(
            db,
            "troubleshooting.tutor_handoff_started",
            "troubleshooting_session",
            session.id,
            auth_ctx.user.id,
            {"conversation_id": conversation.id, "message_id": message.id, "source_version_id": target_id},
            commit=True,
        )
        return {"kind": kind, "session_id": session.id, "title": suggestion.title, "resumed": False}

    raise ValidationError(code="invalid_handoff_kind", message="Choose a workflow or troubleshooting handoff.")
