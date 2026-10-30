from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.base import utc_now
from app.core.permissions import (
    get_current_user,
    AuthenticatedContext,
    require_permission,
    csrf_protect,
    PERM_TROUBLESHOOT_USE,
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
)
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.models import TroubleshootingCase, TroubleshootingNode, TroubleshootingEdge, Machine
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.process import ManufacturingProcess
from app.models.procedure import ProcedureRun
from app.models.troubleshooting import (
    TroubleshootingEscalation, TroubleshootingSession,
    SESSION_STATUS_IN_PROGRESS, SESSION_STATUS_ESCALATED, SESSION_STATUS_RESOLVED,
    SESSION_STATUS_UNRESOLVED,
)
from app.schemas.troubleshooting import (
    TroubleshootingCaseListItem,
    TroubleshootingCaseDetailResponse,
    TroubleshootingNodeResponse,
    TroubleshootingEdgeResponse,
    TroubleshootingTopicResponse,
    TroubleshootingSessionCreateRequest,
    TroubleshootingCheckOutcomeRequest,
    TroubleshootingCheckNavigationRequest,
    TroubleshootingEscalationRequest,
    TroubleshootingKnowledgeDraftResponse,
    TroubleshootingExpertDispositionRequest,
)

router = APIRouter(prefix="/troubleshooting", tags=["Troubleshooting"])


def _legacy_case_has_published_evidence(db: Session, case: TroubleshootingCase) -> bool:
    """Legacy trees are discoverable only when every displayed node cites published knowledge."""
    if not case.nodes:
        return False
    for node in case.nodes:
        version_id = node.linked_knowledge_version_id
        version = db.get(KnowledgeVersion, version_id) if version_id else None
        if not version or version.status != "published":
            return False
    return True


@router.get("/processes")
def list_troubleshooting_processes(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    return [{"id": process.id, "name": process.name, "code": process.code}
            for process in db.query(ManufacturingProcess).order_by(ManufacturingProcess.name).all()]


@router.get("/topics", response_model=List[TroubleshootingTopicResponse])
def search_troubleshooting_topics(
    q: str,
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    if len(q.strip()) < 2:
        raise ValidationError(code="search_too_short", message="Enter at least two characters to search approved knowledge.")
    from app.services.troubleshooting_service import retrieve_topics
    return retrieve_topics(q.strip(), auth_ctx.user.id, db, machine_id=machine_id)


@router.post("/sessions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_troubleshooting_session(
    payload: TroubleshootingSessionCreateRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import create_session, session_payload
    from app.services.audit_service import AuditService
    session = create_session(db, user=auth_ctx.user, **payload.model_dump())
    AuditService.log(db, "troubleshooting.session_started", "troubleshooting_session", session.id,
                     auth_ctx.user.id, {"source_count": len(session.source_refs or []), "check_count": len(session.checks_snapshot or []),
                                        "workflow_run_id": session.workflow_run_id, "workflow_issue_id": session.workflow_issue_id}, commit=True)
    return session_payload(session)


@router.get("/sessions/my/all")
def list_my_troubleshooting_sessions(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import session_payload
    # Decision-tree walks have their own history (/decision-trees/walk/my); this list is evidence sessions.
    sessions = (db.query(TroubleshootingSession).filter(TroubleshootingSession.user_id == auth_ctx.user.id,
                                                        TroubleshootingSession.guide_version_id.is_(None))
                .order_by(TroubleshootingSession.started_at.desc()).limit(100).all())
    return [session_payload(session) for session in sessions]


@router.get("/sessions/{session_id}")
def get_troubleshooting_session(
    session_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import get_owned_session, session_payload
    session = get_owned_session(db, session_id, auth_ctx.user.id, auth_ctx.user.role_id, auth_ctx.permissions)
    return session_payload(session)


@router.patch("/sessions/{session_id}/current-check", dependencies=[Depends(csrf_protect)])
def navigate_troubleshooting_check(
    session_id: str,
    payload: TroubleshootingCheckNavigationRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import get_owned_session, session_payload
    session = get_owned_session(db, session_id, auth_ctx.user.id, auth_ctx.user.role_id, auth_ctx.permissions)
    if session.status != SESSION_STATUS_IN_PROGRESS:
        raise ValidationError(code="session_not_active", message="This troubleshooting session is no longer active.")
    if payload.check_index >= len(session.checks_snapshot or []):
        raise ValidationError(code="check_not_found", message="That documented check is not part of this session.")
    session.current_check_index = payload.check_index
    db.commit()
    from app.services.audit_service import AuditService
    AuditService.log(db, "troubleshooting.check_navigated", "troubleshooting_session", session.id,
                     auth_ctx.user.id, {"check_index": payload.check_index}, commit=True)
    return session_payload(session)


@router.post("/sessions/{session_id}/checks/{check_index}/outcome", dependencies=[Depends(csrf_protect)])
def record_troubleshooting_outcome(
    session_id: str,
    check_index: int,
    payload: TroubleshootingCheckOutcomeRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import get_owned_session, record_check_outcome, session_payload
    from app.services.audit_service import AuditService
    session = get_owned_session(db, session_id, auth_ctx.user.id, auth_ctx.user.role_id, auth_ctx.permissions)
    session = record_check_outcome(db, session, check_index, payload.outcome, payload.observation)
    AuditService.log(db, "troubleshooting.check_recorded", "troubleshooting_session", session.id,
                     auth_ctx.user.id, {"check_index": check_index, "outcome": payload.outcome}, commit=True)
    return session_payload(session)


@router.post("/sessions/{session_id}/escalate", dependencies=[Depends(csrf_protect)])
def escalate_troubleshooting_session(
    session_id: str,
    payload: TroubleshootingEscalationRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import get_owned_session, session_payload
    from app.services.audit_service import AuditService
    session = get_owned_session(db, session_id, auth_ctx.user.id, auth_ctx.user.role_id, auth_ctx.permissions)
    if session.status not in {SESSION_STATUS_IN_PROGRESS, SESSION_STATUS_UNRESOLVED}:
        raise ValidationError(code="session_not_escalatable", message="Only an active or unresolved session can be escalated.")
    escalation = TroubleshootingEscalation(session_id=session.id, reason=payload.reason.strip(), status="pending")
    db.add(escalation)
    session.status = SESSION_STATUS_ESCALATED
    session.ended_at = utc_now()
    db.commit()
    db.refresh(session)
    AuditService.log(db, "troubleshooting.escalated", "troubleshooting_session", session.id,
                     auth_ctx.user.id, {"escalation_id": escalation.id}, commit=True)
    return session_payload(session)


@router.post("/sessions/{session_id}/knowledge-draft", response_model=TroubleshootingKnowledgeDraftResponse,
             status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_knowledge_draft_from_session(
    session_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import get_owned_session
    from app.repositories.knowledge_repository import KnowledgeRepository
    from app.services.audit_service import AuditService
    session = get_owned_session(db, session_id, auth_ctx.user.id, auth_ctx.user.role_id, auth_ctx.permissions)
    title = f"Troubleshooting case: {session.reported_symptom[:180]}"
    item, version = KnowledgeRepository.create_item_and_version_1(
        db, title=title, author_id=auth_ctx.user.id, machine_id=session.machine_id,
        summary=session.reported_symptom, description="Operator-reported troubleshooting case. Review and author approved checks before publication.",
        commit=False,
    )
    item.category = "TROUBLESHOOTING"
    item.tags = "troubleshooting,operator-case"
    version.source_refs = [dict(ref) for ref in (session.source_refs or []) if isinstance(ref, dict)]
    version.content = __import__("json").dumps({
        "originating_session_id": session.id,
        "reported_symptom": session.reported_symptom,
        "context": session.context or {},
        "recorded_outcomes": [{"check_index": r.check_index, "outcome": r.outcome, "answer": r.answer} for r in session.responses],
    }, ensure_ascii=False)
    db.commit()
    db.refresh(item)
    db.refresh(version)
    AuditService.log(db, "troubleshooting.knowledge_draft_created", "knowledge_item", item.id,
                     auth_ctx.user.id, {"session_id": session.id, "source_count": len(version.source_refs or [])}, commit=True)
    return TroubleshootingKnowledgeDraftResponse(item_id=item.id, version_id=version.id, title=title, status=version.status)


@router.get("/escalations/queue")
def list_troubleshooting_escalations(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    records = (db.query(TroubleshootingEscalation).filter(TroubleshootingEscalation.status == "pending")
               .order_by(TroubleshootingEscalation.requested_at.asc()).limit(100).all())
    return [{
        "escalation_id": row.id,
        "reason": row.reason,
        "session_id": row.session_id,
        "reported_symptom": row.session.reported_symptom,
        "requested_at": row.requested_at,
        "assigned_to_me": row.assigned_expert_id == auth_ctx.user.id,
    } for row in records]


@router.post("/escalations/{escalation_id}/claim", dependencies=[Depends(csrf_protect)])
def claim_troubleshooting_escalation(
    escalation_id: str,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    escalation = db.get(TroubleshootingEscalation, escalation_id)
    if not escalation or escalation.status != "pending":
        raise NotFoundError(code="escalation_not_found", message="An open troubleshooting escalation was not found.")
    if escalation.assigned_expert_id and escalation.assigned_expert_id != auth_ctx.user.id:
        raise ForbiddenError(code="escalation_assigned", message="This escalation is assigned to another reviewer.")
    escalation.assigned_expert_id = auth_ctx.user.id
    db.commit()
    from app.services.troubleshooting_service import session_payload
    return session_payload(escalation.session)


@router.post("/escalations/{escalation_id}/disposition", dependencies=[Depends(csrf_protect)])
def dispose_troubleshooting_escalation(
    escalation_id: str,
    payload: TroubleshootingExpertDispositionRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    from app.services.troubleshooting_service import session_payload
    from app.services.audit_service import AuditService
    escalation = db.get(TroubleshootingEscalation, escalation_id)
    if not escalation:
        raise NotFoundError(code="escalation_not_found", message="Troubleshooting escalation was not found.")
    if escalation.status != "pending" or escalation.assigned_expert_id != auth_ctx.user.id:
        raise ForbiddenError(code="escalation_not_assigned", message="Claim this open escalation before recording an expert disposition.")
    escalation.status = payload.status
    escalation.assigned_expert_id = auth_ctx.user.id
    escalation.resolution_note = payload.resolution_note.strip()
    escalation.resolved_at = utc_now()
    escalation.session.status = SESSION_STATUS_RESOLVED if payload.status == "resolved" else SESSION_STATUS_UNRESOLVED
    escalation.session.ended_at = utc_now()
    db.commit()
    AuditService.log(db, "troubleshooting.expert_disposition", "troubleshooting_escalation", escalation.id,
                     auth_ctx.user.id, {"status": payload.status}, commit=True)
    return session_payload(escalation.session)


@router.get("", response_model=List[TroubleshootingCaseListItem])
def list_troubleshooting_cases(
    machine_id: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    """List available expert diagnostic cases and symptoms."""
    query = db.query(TroubleshootingCase).filter(TroubleshootingCase.is_published == True)
    if machine_id:
        query = query.filter(TroubleshootingCase.machine_id == machine_id)
    cases = [c for c in query.order_by(TroubleshootingCase.title).all() if _legacy_case_has_published_evidence(db, c)]

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
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_TROUBLESHOOT_USE)),
    db: Session = Depends(get_db),
):
    """Retrieve complete decision tree with nodes, branches, and safety warnings."""
    c = db.get(TroubleshootingCase, case_id)
    if not c or not c.is_published or not _legacy_case_has_published_evidence(db, c):
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
