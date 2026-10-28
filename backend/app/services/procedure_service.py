"""Bridge approved knowledge revisions into immutable workflow snapshots."""
import json
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.core.exceptions import NotFoundError, ValidationError
from app.models.knowledge import KnowledgeItem, KnowledgeVersion
from app.models.procedure import Procedure, ProcedureRun, ProcedureRunStep, ProcedureStep


def _step_instruction(step: Dict[str, Any]) -> str:
    return str(step.get("instruction") or step.get("text") or "").strip()


def workflow_sources_are_current(db: Session, procedure: Procedure) -> bool:
    """An approved workflow stays available only while its cited source revisions remain published."""
    for ref in procedure.source_refs or []:
        version_id = ref.get("version_id") if isinstance(ref, dict) else None
        if not version_id or version_id == procedure.knowledge_version_id:
            continue
        source_version = db.get(KnowledgeVersion, version_id)
        source_item = db.get(KnowledgeItem, source_version.item_id) if source_version else None
        if not source_version or source_version.status != "published" or not source_item or source_item.current_published_version_id != source_version.id:
            return False
    return True


def is_workflow_currently_published(db: Session, procedure: Procedure) -> bool:
    """Require the executable snapshot and all cited revisions to still be current and published."""
    if procedure.status != "APPROVED" or not workflow_sources_are_current(db, procedure):
        return False
    if procedure.knowledge_version_id:
        version = db.get(KnowledgeVersion, procedure.knowledge_version_id)
        item = db.get(KnowledgeItem, version.item_id) if version else None
        if not version or version.status != "published" or not item or item.current_published_version_id != version.id:
            return False
    return True


def start_or_resume_workflow_run(db: Session, procedure: Procedure, user_id: str) -> tuple[ProcedureRun, bool]:
    """Use the existing workflow session model and reuse an operator's active run."""
    from app.core.exceptions import NotFoundError, ValidationError

    if not is_workflow_currently_published(db, procedure):
        raise NotFoundError(code="workflow_not_found", message="This workflow is not currently published.")
    if not procedure.steps:
        raise ValidationError(code="workflow_has_no_steps", message="This workflow has no executable steps.")
    existing = (
        db.query(ProcedureRun)
        .filter(
            ProcedureRun.procedure_id == procedure.id,
            ProcedureRun.operator_id == user_id,
            ProcedureRun.status == "IN_PROGRESS",
        )
        .order_by(ProcedureRun.started_at.desc())
        .first()
    )
    if existing:
        return existing, True
    run = ProcedureRun(
        procedure_id=procedure.id,
        operator_id=user_id,
        status="IN_PROGRESS",
        current_step_order=1,
    )
    db.add(run)
    db.flush()
    for step in procedure.steps:
        db.add(ProcedureRunStep(run_id=run.id, step_id=step.id, is_completed=False))
    db.commit()
    db.refresh(run)
    return run, False


def publish_workflow_snapshot(db: Session, version: KnowledgeVersion) -> Procedure | None:
    """Create one runnable snapshot only from a published knowledge revision with steps."""
    raw_steps = version.steps if isinstance(version.steps, list) else []
    step_payloads = [step for step in raw_steps if isinstance(step, dict) and _step_instruction(step)]
    if not step_payloads:
        return None
    def source_order(pair):
        index, step = pair
        try:
            return int(step.get("step_order") or step.get("order") or index + 1)
        except (TypeError, ValueError):
            return index + 1

    step_payloads = [step for _, step in sorted(enumerate(step_payloads), key=source_order)]

    existing = db.query(Procedure).filter(Procedure.knowledge_version_id == version.id).first()
    if existing:
        return existing

    item = db.get(KnowledgeItem, version.item_id)
    if not item:
        raise NotFoundError(code="knowledge_item_not_found", message="Workflow knowledge item was not found.")
    content_metadata = {}
    if version.content:
        try:
            candidate = json.loads(version.content)
            if isinstance(candidate, dict):
                content_metadata = candidate
        except (ValueError, TypeError):
            pass

    # Preserve each approved knowledge citation and any upstream source references.
    # Prior revisions of this workflow can appear as self-references when the
    # knowledge revision was copied. Keep upstream evidence links, then cite
    # only the revision being published for this workflow item.
    source_refs = [
        dict(ref)
        for ref in (version.source_refs or [])
        if isinstance(ref, dict) and ref.get("item_id") != item.id
    ]
    own_ref = {
        "item_id": item.id,
        "version_id": version.id,
        "title": version.title or item.title,
        "version_no": version.version_no,
        "status": "published",
    }
    if not any(ref.get("version_id") == version.id for ref in source_refs):
        source_refs.insert(0, own_ref)
    for media in version.media_assets:
        source_refs.append({
            "media_id": media.id,
            "title": media.title,
            "kind": media.kind,
            "original_name": media.original_name,
        })

    # Keep the old immutable procedure snapshot available to sessions already using it.
    previous = (
        db.query(Procedure)
        .join(KnowledgeVersion, Procedure.knowledge_version_id == KnowledgeVersion.id)
        .filter(KnowledgeVersion.item_id == item.id, Procedure.id != None)
        .all()
    )
    for old in previous:
        old.status = "ARCHIVED"

    procedure = Procedure(
        title=version.title or item.title,
        description=version.description or version.summary or "",
        machine_id=version.machine_id or item.machine_id,
        author_id=version.created_by,
        status="APPROVED",
        version=version.version_no,
        prerequisites=version.prerequisites,
        required_tools=None,
        safety_warnings=version.safety_warnings,
        operating_conditions=version.operating_conditions,
        operation=content_metadata.get("operation"),
        troubleshooting_guidance="\n".join(value for value in (version.common_mistakes, version.corrective_actions) if value) or None,
        knowledge_version_id=version.id,
        source_refs=source_refs,
    )
    # Aggregate only tools explicitly present in the source steps.
    tools = []
    for step in step_payloads:
        tools.extend(str(tool) for tool in (step.get("tools") or step.get("materials") or []) if str(tool).strip())
    procedure.required_tools = ", ".join(dict.fromkeys(tools)) or version.prerequisites
    db.add(procedure)
    db.flush()

    for order, source_step in enumerate(step_payloads, start=1):
        step_order = order
        warning = source_step.get("safety_warning") or source_step.get("safety_warning_text")
        procedure_step = ProcedureStep(
            procedure_id=procedure.id,
            step_order=int(step_order),
            title=str(source_step.get("title") or f"Step {step_order}")[:256],
            instruction=_step_instruction(source_step),
            expected_observation=source_step.get("expected_result") or source_step.get("expected_observation") or source_step.get("quality_checkpoint"),
            safety_warning=warning,
            is_critical=bool(source_step.get("is_critical") or source_step.get("critical")),
            details=dict(source_step),
        )
        db.add(procedure_step)
    db.commit()
    db.refresh(procedure)
    return procedure


def create_workflow_draft_from_published_source(
    db: Session,
    source_version_id: str,
    author_id: str,
) -> tuple[KnowledgeItem, KnowledgeVersion]:
    """Copy an approved step-based source into an editable knowledge draft."""
    source_version = db.get(KnowledgeVersion, source_version_id)
    if not source_version or source_version.status != "published":
        raise NotFoundError(code="published_source_not_found", message="Choose a published knowledge source to start a workflow draft.")
    source_item = db.get(KnowledgeItem, source_version.item_id)
    raw_steps = source_version.steps if isinstance(source_version.steps, list) else []
    if not source_item or not any(isinstance(step, dict) and _step_instruction(step) for step in raw_steps):
        raise ValidationError(code="source_has_no_steps", message="The approved source does not contain ordered steps for a workflow.")

    from app.repositories.knowledge_repository import KnowledgeRepository
    item, version = KnowledgeRepository.create_item_and_version_1(
        db=db,
        title=source_version.title or source_item.title,
        author_id=author_id,
        machine_id=source_version.machine_id or source_item.machine_id,
        summary=source_version.summary,
        description=source_version.description,
        commit=False,
    )
    item.category = "GUIDED_WORKFLOW"
    item.tags = "guided-workflow"
    version.content = source_version.content
    version.operating_conditions = source_version.operating_conditions
    version.prerequisites = source_version.prerequisites
    version.safety_warnings = source_version.safety_warnings
    version.common_mistakes = source_version.common_mistakes
    version.corrective_actions = source_version.corrective_actions
    version.steps = [dict(step) for step in raw_steps if isinstance(step, dict)]
    version.source_refs = [
        {"item_id": source_item.id, "version_id": source_version.id, "title": source_version.title or source_item.title,
         "version_no": source_version.version_no, "status": "published"}
    ]
    db.commit()
    db.refresh(item)
    db.refresh(version)
    return item, version


def advance_workflow_step(db: Session, run_id: str, user_id: str, step_order: int):
    from app.core.exceptions import ForbiddenError
    from app.models.procedure import ProcedureRun
    run = db.get(ProcedureRun, run_id)
    if not run:
        raise NotFoundError(code="run_not_found", message="Workflow session was not found.")
    if run.operator_id != user_id:
        raise ForbiddenError(code="unauthorized_run", message="You may only navigate your own workflow session.")
    if run.status != "IN_PROGRESS":
        raise ValidationError(code="run_not_active", message="This workflow session is no longer active.")
    count = len(run.procedure.steps)
    if step_order < 1 or step_order > count:
        raise ValidationError(code="invalid_step", message="Choose a step in this workflow.")
    run.current_step_order = step_order
    db.commit()
    db.refresh(run)
    return run
