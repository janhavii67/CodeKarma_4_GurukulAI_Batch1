from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.permissions import (AuthenticatedContext, PERM_SIMULATION_ATTEMPT, PERM_KNOWLEDGE_APPROVE,
    PERM_KNOWLEDGE_CREATE, PERM_KNOWLEDGE_SUBMIT_REVIEW, csrf_protect, require_permission)
from app.db.base import utc_now
from app.db.session import get_db
from app.models.simulation import SimulationScenario, SimulationScenarioRevision, SimulationAttempt, SimulationScenarioReport
from app.models.knowledge import KnowledgeVersion, KnowledgeItem, STATUS_IN_REVIEW, STATUS_PUBLISHED
from app.schemas.knowledge import KnowledgeCreateRequest, RevisionCreateRequest
from app.schemas.review import ReviewDecisionRequest
from app.services.knowledge_service import KnowledgeService
from app.schemas.simulation import SimulationDraftCreate, SimulationDraftUpdate, SimulationDecisionRequest, SimulationReportRequest, SimulationReportDisposition
from app.services.simulation_service import validate_scenario, source_snapshots, source_refs_are_current, session_payload, submit_choice
from app.services.audit_service import AuditService

router = APIRouter(prefix="/simulator", tags=["Failure Simulator"])


@router.get("/knowledge-sources")
def search_approved_sources(q: str = "", auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    query = db.query(KnowledgeVersion, KnowledgeItem).join(KnowledgeItem, KnowledgeVersion.item_id == KnowledgeItem.id).filter(KnowledgeVersion.status == "published")
    if q.strip():
        query = query.filter(KnowledgeVersion.title.ilike(f"%{q.strip()}%"))
    rows = query.order_by(KnowledgeVersion.published_at.desc()).limit(100).all()
    return [{"version_id": version.id, "title": version.title or item.title, "version_no": version.version_no,
             "summary": version.summary} for version, item in rows]


def _revision_for_author(db: Session, revision_id: str, auth: AuthenticatedContext) -> SimulationScenarioRevision:
    revision = db.get(SimulationScenarioRevision, revision_id)
    if not revision:
        raise NotFoundError(code="scenario_revision_not_found", message="Scenario revision was not found.")
    if revision.created_by != auth.user.id and PERM_KNOWLEDGE_APPROVE not in auth.permissions:
        raise NotFoundError(code="scenario_revision_not_found", message="Scenario revision was not found.")
    return revision


def _published_revision(db: Session, scenario_id: str) -> SimulationScenarioRevision:
    revision = (db.query(SimulationScenarioRevision).filter_by(scenario_id=scenario_id, status="published")
                .order_by(SimulationScenarioRevision.revision_no.desc()).first())
    own_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision and revision.knowledge_version_id else None
    if not revision or not own_version or own_version.status != STATUS_PUBLISHED or not source_refs_are_current(db, revision):
        raise NotFoundError(code="scenario_not_found", message="No currently published scenario was found.")
    return revision


@router.get("/scenarios")
def list_scenarios(q: str = "", auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    revisions = (db.query(SimulationScenarioRevision).filter_by(status="published")
                 .order_by(SimulationScenarioRevision.published_at.desc()).limit(200).all())
    latest = {}
    for revision in revisions:
        own_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision.knowledge_version_id else None
        if revision.scenario_id not in latest and own_version and own_version.status == STATUS_PUBLISHED and source_refs_are_current(db, revision):
            latest[revision.scenario_id] = revision
    needle = q.strip().lower()
    rows = []
    for scenario_id, revision in latest.items():
        c = revision.content_json
        if needle and needle not in (c.get("title", "") + " " + c.get("description", "") + " " + (c.get("operation") or "")).lower():
            continue
        rows.append({"id": scenario_id, "title": c["title"], "description": c["description"], "difficulty": c["difficulty"],
                     "operation": c.get("operation"), "machine_id": c.get("machine_id"), "revision_id": revision.id,
                     "revision_no": revision.revision_no, "learning_objectives": c["learning_objectives"]})
    return rows


@router.get("/drafts")
def list_drafts(auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    query = db.query(SimulationScenarioRevision).order_by(SimulationScenarioRevision.created_at.desc())
    if PERM_KNOWLEDGE_APPROVE not in auth.permissions:
        query = query.filter(SimulationScenarioRevision.created_by == auth.user.id)
    return [{"id": rev.id, "scenario_id": rev.scenario_id, "revision_no": rev.revision_no, "status": rev.status,
             "title": (rev.content_json or {}).get("title", "Untitled scenario"), "created_at": rev.created_at,
             "reviewer_id": rev.reviewer_id, "published_at": rev.published_at} for rev in query.limit(200).all()]


@router.get("/drafts/{revision_id}")
def get_draft(revision_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    revision = _revision_for_author(db, revision_id, auth)
    if revision.status == "published" and PERM_KNOWLEDGE_APPROVE not in auth.permissions:
        raise NotFoundError(code="scenario_revision_not_found", message="Scenario revision was not found.")
    return {"id": revision.id, "scenario_id": revision.scenario_id, "revision_no": revision.revision_no,
            "status": revision.status, "content": revision.content_json}


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    revision = _published_revision(db, scenario_id)
    c = revision.content_json
    return {"id": scenario_id, "revision_id": revision.id, "revision_no": revision.revision_no, "title": c["title"],
            "description": c["description"], "difficulty": c["difficulty"], "operation": c.get("operation"),
            "initial_situation": c["initial_situation"], "learning_objectives": c["learning_objectives"],
            "prerequisites": c["prerequisites"], "safety_precautions": c["safety_precautions"],
            "source_refs": revision.source_refs, "related_workflow_ids": c.get("related_workflow_ids", []),
            "related_troubleshooting_ids": c.get("related_troubleshooting_ids", [])}


@router.get("/scenarios/{scenario_id}/authoring")
def get_scenario_for_authoring(scenario_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    scenario = db.get(SimulationScenario, scenario_id)
    if not scenario or (scenario.created_by != auth.user.id and PERM_KNOWLEDGE_APPROVE not in auth.permissions):
        raise NotFoundError(code="scenario_not_found", message="Scenario was not found.")
    revision = (db.query(SimulationScenarioRevision).filter_by(scenario_id=scenario_id)
                .order_by(SimulationScenarioRevision.revision_no.desc()).first())
    if not revision:
        raise NotFoundError(code="scenario_revision_not_found", message="Scenario has no editable revision.")
    return {"scenario_id": scenario_id, "revision_id": revision.id, "revision_no": revision.revision_no, "content": revision.content_json}


@router.post("/drafts", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_draft(payload: SimulationDraftCreate, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    content = validate_scenario(db, payload.content.model_dump())
    knowledge_item, knowledge_version = KnowledgeService.create_knowledge(db, auth.user, KnowledgeCreateRequest(
        title=content.title, machine_id=content.machine_id, description=content.description,
        summary="Interactive manufacturing learning scenario. Simulation-only; not a machine procedure.",
        category="SIMULATION_SCENARIO", content=content.model_dump_json()))
    knowledge_item.category = "SIMULATION_SCENARIO"
    knowledge_version.content = "Simulation-only scenario. Review its decision branches in the Failure Simulator review workspace; this is not a real-world operating procedure."
    knowledge_version.source_refs = source_snapshots(db, content)
    scenario = SimulationScenario(title=content.title, description=content.description, machine_id=content.machine_id,
        difficulty=content.difficulty, initial_state_json=content.initial_situation,
        scenario_tree_json=content.model_dump_json(), completion_criteria="All approved decision branches reach a reviewed terminal outcome.", created_by=auth.user.id)
    db.add(scenario)
    db.flush()
    revision = SimulationScenarioRevision(scenario_id=scenario.id, revision_no=1, status="draft",
        knowledge_version_id=knowledge_version.id, content_json=content.model_dump(), source_refs=source_snapshots(db, content), created_by=auth.user.id)
    db.add(revision)
    db.commit()
    AuditService.log(db, "simulator.draft_created", "simulation_scenario_revision", revision.id, auth.user.id, {"scenario_id": scenario.id})
    return {"scenario_id": scenario.id, "revision_id": revision.id, "revision_no": revision.revision_no, "status": revision.status}


@router.put("/drafts/{revision_id}", dependencies=[Depends(csrf_protect)])
def update_draft(revision_id: str, payload: SimulationDraftUpdate, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    revision = _revision_for_author(db, revision_id, auth)
    if revision.status not in {"draft", "changes_requested"} or revision.created_by != auth.user.id:
        raise ForbiddenError(code="scenario_not_editable", message="Only the author can edit a draft revision.")
    content = validate_scenario(db, payload.content.model_dump())
    knowledge_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision.knowledge_version_id else None
    if not knowledge_version:
        raise ValidationError(code="scenario_knowledge_revision_missing", message="The shared knowledge draft for this scenario is missing.")
    KnowledgeService.ensure_can_edit_version(auth.user, auth.permissions, knowledge_version)
    knowledge_version.title = content.title
    knowledge_version.machine_id = content.machine_id
    knowledge_version.content = "Simulation-only scenario. Review its decision branches in the Failure Simulator review workspace; this is not a real-world operating procedure."
    knowledge_version.source_refs = source_snapshots(db, content)
    revision.content_json = content.model_dump()
    revision.source_refs = source_snapshots(db, content)
    scenario = db.get(SimulationScenario, revision.scenario_id)
    scenario.title, scenario.description, scenario.machine_id = content.title, content.description, content.machine_id
    knowledge_item = db.get(KnowledgeItem, knowledge_version.item_id)
    if knowledge_item:
        knowledge_item.title = content.title
    db.commit()
    return {"revision_id": revision.id, "status": revision.status}


@router.post("/drafts/{revision_id}/submit", dependencies=[Depends(csrf_protect)])
def submit_draft(revision_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_SUBMIT_REVIEW)), db: Session = Depends(get_db)):
    revision = _revision_for_author(db, revision_id, auth)
    if revision.created_by != auth.user.id or revision.status not in {"draft", "changes_requested"}:
        raise ForbiddenError(code="scenario_not_submittable", message="Only the author can submit an editable draft.")
    validate_scenario(db, revision.content_json)
    knowledge_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision.knowledge_version_id else None
    knowledge_item = db.get(KnowledgeItem, knowledge_version.item_id) if knowledge_version else None
    if not knowledge_version or not knowledge_item or knowledge_version.created_by != auth.user.id:
        raise NotFoundError(code="scenario_revision_not_found", message="Scenario draft was not found.")
    if knowledge_version.status not in {"draft", "changes_requested"}:
        raise ValidationError(code="scenario_not_submittable", message="The linked knowledge draft is not editable.")
    knowledge_version.status = STATUS_IN_REVIEW
    knowledge_version.submitted_at = utc_now()
    knowledge_item.status = "PENDING_REVIEW"
    revision.status = "in_review"
    db.commit()
    AuditService.log(db, "knowledge.submit_review", "knowledge_item", knowledge_item.id, auth.user.id,
        {"version_no": knowledge_version.version_no, "module": "failure_simulator"})
    return {"revision_id": revision.id, "status": revision.status}


@router.post("/drafts/{revision_id}/publish", dependencies=[Depends(csrf_protect)])
def publish_draft(revision_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)), db: Session = Depends(get_db)):
    revision = _revision_for_author(db, revision_id, auth)
    if revision.status != "in_review":
        raise ValidationError(code="scenario_not_in_review", message="Only a revision in review can be approved and published.")
    validate_scenario(db, revision.content_json)
    if not source_refs_are_current(db, revision):
        raise ValidationError(code="scenario_sources_outdated", message="All supporting knowledge revisions must still be published.")
    knowledge_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision.knowledge_version_id else None
    if not knowledge_version:
        raise ValidationError(code="scenario_knowledge_revision_missing", message="The shared knowledge revision for this scenario is missing.")
    from app.api.v1.endpoints.reviews import submit_review_decision
    submit_review_decision(knowledge_version.item_id,
        ReviewDecisionRequest(decision="APPROVED", comments="Reviewed and approved as a deterministic simulation scenario."), auth, db)
    db.refresh(revision)
    return {"scenario_id": revision.scenario_id, "revision_id": revision.id, "revision_no": revision.revision_no, "status": revision.status}


@router.post("/scenarios/{scenario_id}/revisions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_revision(scenario_id: str, payload: SimulationDraftCreate, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    scenario = db.get(SimulationScenario, scenario_id)
    if not scenario or (scenario.created_by != auth.user.id and PERM_KNOWLEDGE_APPROVE not in auth.permissions):
        raise NotFoundError(code="scenario_not_found", message="Scenario was not found.")
    content = validate_scenario(db, payload.content.model_dump())
    prior = (db.query(SimulationScenarioRevision).filter_by(scenario_id=scenario_id, status="published")
             .order_by(SimulationScenarioRevision.revision_no.desc()).first())
    prior_version = db.get(KnowledgeVersion, prior.knowledge_version_id) if prior and prior.knowledge_version_id else None
    if not prior_version:
        raise ValidationError(code="scenario_knowledge_revision_missing", message="The published scenario is not linked to a knowledge revision.")
    knowledge_item, knowledge_version = KnowledgeService.create_revision(db, auth.user, prior_version.item_id,
        RevisionCreateRequest(revision_reason="Revise the documented failure simulator scenario."))
    knowledge_version.title = content.title
    knowledge_version.machine_id = content.machine_id
    knowledge_version.content = "Simulation-only scenario. Review its decision branches in the Failure Simulator review workspace; this is not a real-world operating procedure."
    knowledge_version.source_refs = source_snapshots(db, content)
    knowledge_item.category = "SIMULATION_SCENARIO"
    revision_no = (db.query(SimulationScenarioRevision.revision_no).filter_by(scenario_id=scenario_id).order_by(SimulationScenarioRevision.revision_no.desc()).first() or (0,))[0] + 1
    revision = SimulationScenarioRevision(scenario_id=scenario_id, revision_no=revision_no, status="draft",
        knowledge_version_id=knowledge_version.id, content_json=content.model_dump(), source_refs=source_snapshots(db, content), created_by=auth.user.id)
    db.add(revision)
    db.commit()
    return {"scenario_id": scenario_id, "revision_id": revision.id, "revision_no": revision_no, "status": revision.status}


@router.post("/drafts/{revision_id}/review", dependencies=[Depends(csrf_protect)])
def review_draft(revision_id: str, payload: ReviewDecisionRequest, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)), db: Session = Depends(get_db)):
    revision = _revision_for_author(db, revision_id, auth)
    if revision.status != "in_review":
        raise ValidationError(code="scenario_not_in_review", message="Only submitted revisions can receive a review decision.")
    if revision.created_by == auth.user.id:
        raise ForbiddenError(code="self_review_forbidden", message="Scenario authors cannot review their own revisions.")
    if payload.decision != "REJECTED":
        raise ValidationError(code="invalid_review_status", message="Use publish to approve a scenario revision.")
    if not payload.comments or len(payload.comments.strip()) < 3:
        raise ValidationError(code="review_comment_required", message="Add a brief explanation when rejecting a scenario revision.")
    knowledge_version = db.get(KnowledgeVersion, revision.knowledge_version_id) if revision.knowledge_version_id else None
    if not knowledge_version:
        raise ValidationError(code="scenario_knowledge_revision_missing", message="The shared knowledge revision for this scenario is missing.")
    from app.api.v1.endpoints.reviews import submit_review_decision
    submit_review_decision(knowledge_version.item_id,
        payload, auth, db)
    db.refresh(revision)
    return {"revision_id": revision.id, "status": revision.status, "reviewer_note": payload.comments}


@router.post("/scenarios/{scenario_id}/sessions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def start_session(scenario_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    revision = _published_revision(db, scenario_id)
    attempt = SimulationAttempt(scenario_id=scenario_id, user_id=auth.user.id, status="IN_PROGRESS", decisions_log_json=[],
        revision_id=revision.id, current_decision_id=revision.content_json["start_decision_id"], updated_at=utc_now())
    db.add(attempt)
    db.commit()
    AuditService.log(db, "simulator.session_started", "simulation_attempt", attempt.id, auth.user.id, {"scenario_id": scenario_id, "revision_id": revision.id})
    return session_payload(db, attempt)


def _owned_attempt(db: Session, session_id: str, auth: AuthenticatedContext) -> SimulationAttempt:
    attempt = db.get(SimulationAttempt, session_id)
    if not attempt or (attempt.user_id != auth.user.id and PERM_KNOWLEDGE_APPROVE not in auth.permissions):
        raise NotFoundError(code="simulation_session_not_found", message="Simulation session was not found.")
    return attempt


@router.get("/sessions/my")
def list_my_sessions(auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    attempts = db.query(SimulationAttempt).filter_by(user_id=auth.user.id).order_by(SimulationAttempt.started_at.desc()).limit(100).all()
    return [session_payload(db, attempt) for attempt in attempts]


@router.get("/sessions/{session_id}")
def get_session(session_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    return session_payload(db, _owned_attempt(db, session_id, auth))


@router.post("/sessions/{session_id}/decisions", dependencies=[Depends(csrf_protect)])
def make_decision(session_id: str, payload: SimulationDecisionRequest, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    attempt = _owned_attempt(db, session_id, auth)
    result = submit_choice(db, attempt, payload.choice_id)
    db.commit()
    AuditService.log(db, "simulator.decision_recorded", "simulation_attempt", attempt.id, auth.user.id,
        {"decision_id": result["decision_id"], "preferred": result["preferred"], "safety_critical": result["safety_critical"]})
    return {"decision": result, "session": session_payload(db, attempt)}


@router.post("/sessions/{session_id}/restart", dependencies=[Depends(csrf_protect)])
def restart_session(session_id: str, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    old = _owned_attempt(db, session_id, auth)
    revision = _published_revision(db, old.scenario_id)
    new_attempt = SimulationAttempt(scenario_id=old.scenario_id, user_id=auth.user.id, status="IN_PROGRESS", decisions_log_json=[], revision_id=revision.id,
        current_decision_id=revision.content_json["start_decision_id"], updated_at=utc_now())
    db.add(new_attempt)
    db.commit()
    return session_payload(db, new_attempt)


@router.post("/sessions/{session_id}/reports", status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def report_content(session_id: str, payload: SimulationReportRequest, auth: AuthenticatedContext = Depends(require_permission(PERM_SIMULATION_ATTEMPT)), db: Session = Depends(get_db)):
    attempt = _owned_attempt(db, session_id, auth)
    if payload.decision_id and payload.decision_id not in [d.get("decision_id") for d in (attempt.decisions_log_json or [])] and payload.decision_id != attempt.current_decision_id:
        raise ValidationError(code="invalid_report_decision", message="The reported decision must belong to this completed session history.")
    report = SimulationScenarioReport(attempt_id=attempt.id, revision_id=attempt.revision_id, user_id=auth.user.id,
        decision_id=payload.decision_id, reason=payload.reason)
    db.add(report)
    db.commit()
    AuditService.log(db, "simulator.content_reported", "simulation_scenario_report", report.id, auth.user.id,
        {"reason": payload.reason, "decision_id": payload.decision_id, "scenario_id": attempt.scenario_id})
    return {"status": "submitted", "message": "Your report was sent for expert review."}


@router.get("/reports")
def list_reports(auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)), db: Session = Depends(get_db)):
    reports = db.query(SimulationScenarioReport).order_by(SimulationScenarioReport.created_at.desc()).limit(200).all()
    return [{"id": r.id, "session_id": r.attempt_id, "revision_id": r.revision_id, "user_id": r.user_id,
        "decision_id": r.decision_id, "reason": r.reason, "status": r.status, "reviewer_note": r.reviewer_note,
        "created_at": r.created_at} for r in reports]


@router.post("/reports/{report_id}/disposition", dependencies=[Depends(csrf_protect)])
def disposition_report(report_id: str, payload: SimulationReportDisposition, auth: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)), db: Session = Depends(get_db)):
    report = db.get(SimulationScenarioReport, report_id)
    if not report:
        raise NotFoundError(code="simulation_report_not_found", message="Scenario report was not found.")
    report.status, report.reviewer_id, report.reviewer_note = payload.status, auth.user.id, payload.reviewer_note
    db.commit()
    AuditService.log(db, "simulator.report_reviewed", "simulation_scenario_report", report.id, auth.user.id, {"status": report.status})
    return {"id": report.id, "status": report.status, "reviewer_note": report.reviewer_note}

