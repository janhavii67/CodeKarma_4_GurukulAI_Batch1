from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.db.session import get_db
from app.core.permissions import (
    require_permission,
    AuthenticatedContext,
    PERM_KNOWLEDGE_APPROVE,
)
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.models import (
    KnowledgeItem,
    KnowledgeVersion,
    KnowledgeArticle,
    KnowledgeRevision,
    Machine,
    User,
    ReviewRecord,
)
from app.schemas.review import ReviewDecisionRequest, ReviewQueueItem
from app.schemas.knowledge import KnowledgeArticleDetailResponse
from app.api.v1.endpoints.knowledge import _build_detail_response
from app.core.logging import logger

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.get("/queue", response_model=List[ReviewQueueItem])
def get_review_queue(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    """List pending drafts awaiting peer review and formal approval."""
    query = (
        db.query(KnowledgeArticle, Machine.name.label("machine_name"), User.name.label("author_name"))
        .outerjoin(Machine, KnowledgeArticle.machine_id == Machine.id)
        .join(User, KnowledgeArticle.author_id == User.id)
        .filter(KnowledgeArticle.status == "PENDING_REVIEW")
        .order_by(KnowledgeArticle.updated_at.asc())
        .all()
    )

    items = []
    from sqlalchemy import or_
    for art, mach_name, auth_name in query:
        latest_rev = (
            db.query(KnowledgeRevision)
            .filter(or_(KnowledgeRevision.item_id == art.id, KnowledgeRevision.article_id == art.id))
            .order_by(desc(KnowledgeRevision.version_no), desc(KnowledgeRevision.version))
            .first()
        )
        raw_text = ""
        if latest_rev:
            raw_text = latest_rev.content or latest_rev.summary or (latest_rev.title if latest_rev.title else "") or ""
            if not raw_text and latest_rev.steps:
                step_instructions = [s.get("instruction", "") for s in (latest_rev.steps or []) if isinstance(s, dict)]
                raw_text = " ".join([st for st in step_instructions if st])
        preview = (raw_text[:200] + "...") if len(raw_text) > 200 else raw_text
        items.append(
            ReviewQueueItem(
                article_id=art.id,
                title=art.title,
                category=art.category,
                machine_name=mach_name,
                author_id=art.author_id,
                author_name=auth_name or "Expert",
                version=art.current_version,
                submitted_at=art.updated_at,
                content_preview=preview,
                requires_ai_draft_acknowledgment=bool(latest_rev and latest_rev.origin in ("ai_draft", "ai_draft_edited")),
            )
        )
    return items


@router.post("/{article_id}/decision", response_model=KnowledgeArticleDetailResponse)
def submit_review_decision(
    article_id: str,
    payload: ReviewDecisionRequest,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_APPROVE)),
    db: Session = Depends(get_db),
):
    """
    Approve or reject a submitted knowledge revision.
    Enforces Strict Peer Review Invariant: Authors can NEVER review or approve their own submissions.
    """
    article = db.get(KnowledgeArticle, article_id)
    if not article:
        raise NotFoundError(code="knowledge_not_found", message=f"Article '{article_id}' not found.")

    if article.status != "PENDING_REVIEW":
        raise ForbiddenError(code="not_pending_review", message="Only articles with status 'PENDING_REVIEW' can be reviewed.")

    # STRICT INVARIANT: Self-Review is strictly prohibited for standard authors.
    # Exception: Administrators (ROLE_ADMIN) possess governance override authority to review, audit, and unblock deployments.
    if article.author_id == auth_ctx.user.id and auth_ctx.user.role_id != "ADMIN":
        raise ForbiddenError(
            code="self_review_forbidden",
            message="Authors are strictly forbidden from approving or reviewing their own submissions (Invariant 3). A separate qualified peer expert must perform the review.",
        )

    from sqlalchemy import or_
    latest_rev = (
        db.query(KnowledgeRevision)
        .filter(or_(KnowledgeRevision.item_id == article.id, KnowledgeRevision.article_id == article.id))
        .order_by(desc(KnowledgeRevision.version_no), desc(KnowledgeRevision.version))
        .first()
    )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    decision_lower = payload.decision.lower()
    is_ai_generated_draft = bool(latest_rev and latest_rev.origin in ("ai_draft", "ai_draft_edited"))
    if decision_lower == "approved" and is_ai_generated_draft and not payload.acknowledged_ai_draft:
        raise ValidationError(
            code="ai_draft_acknowledgment_required",
            message="A reviewer must acknowledge that this AI-generated draft was checked against its source before publishing.",
        )

    if decision_lower == "approved" and latest_rev:
        from app.services.source_verification import validate_sources_for_publication

        validate_sources_for_publication(latest_rev, article, db)

    review_record = ReviewRecord(
        article_id=article.id,
        item_id=article.id,
        revision_id=latest_rev.id if latest_rev else None,
        version_id=latest_rev.id if latest_rev else None,
        reviewer_id=auth_ctx.user.id,
        status=decision_lower,
        decision=decision_lower,
        comments=payload.comments,
        comment=payload.comments,
        acknowledged_ai_draft=bool(payload.acknowledged_ai_draft and is_ai_generated_draft),
    )
    db.add(review_record)

    article.status = payload.decision  # "APPROVED" or "REJECTED"
    if latest_rev:
        if decision_lower == "approved":
            # Machine-sound interpretations share the regular knowledge approval
            # lifecycle. Publish the reference only after this knowledge revision
            # is the current approved version and its audio features are usable.
            if article.category == "MACHINE_SOUND_REFERENCE":
                from app.models.audio import AudioReference
                from app.models.media import MediaAsset
                from app.services.audio_service import FEATURE_VERSION
                import json

                audio_reference = db.query(AudioReference).filter_by(knowledge_version_id=latest_rev.id).first()
                if not audio_reference or not audio_reference.media_asset_id or not audio_reference.features_json:
                    raise ForbiddenError(code="audio_reference_not_ready", message="This audio reference has no stored recording or extracted features and cannot be published.")
                media = db.get(MediaAsset, audio_reference.media_asset_id)
                from app.integrations.storage import get_storage_service
                try:
                    features = json.loads(audio_reference.features_json or "{}")
                except (TypeError, json.JSONDecodeError):
                    features = {}
                if not media or media.kind != "audio" or not get_storage_service().exists(media.storage_key) or audio_reference.feature_version != FEATURE_VERSION or features.get("version") != FEATURE_VERSION:
                    raise ForbiddenError(code="audio_reference_not_ready", message="This audio reference must be reprocessed before it can be published.")
                source_refs = latest_rev.source_refs or []
                if not source_refs:
                    raise ForbiddenError(code="audio_reference_sources_required", message="An audio reference must retain at least one approved knowledge source.")
                for source_ref in source_refs:
                    source_version_id = source_ref.get("version_id") if isinstance(source_ref, dict) else None
                    source_version = db.get(KnowledgeVersion, source_version_id) if source_version_id else None
                    source_item = db.get(KnowledgeItem, source_version.item_id) if source_version else None
                    if not source_version or not source_item or source_version.status != "published" or source_item.current_published_version_id != source_version.id:
                        raise ForbiddenError(code="audio_reference_source_unavailable", message="A linked knowledge source is no longer current and published.")

            # Transition any currently published version of this article to superseded
            prev_published = (
                db.query(KnowledgeVersion)
                .filter(
                    KnowledgeVersion.item_id == article.id,
                    KnowledgeVersion.id != latest_rev.id,
                    KnowledgeVersion.status == "published",
                )
                .all()
            )
            for pv in prev_published:
                pv.status = "superseded"
            if prev_published:
                db.flush()

            latest_rev.status = "published"
            latest_rev.published_at = now
            article.current_published_version_id = latest_rev.id
            article.title = latest_rev.title
            article.machine_id = latest_rev.machine_id
        elif decision_lower == "rejected":
            latest_rev.status = "rejected"

        if article.category == "MACHINE_SOUND_REFERENCE":
            from app.models.audio import AudioReference
            audio_reference = db.query(AudioReference).filter_by(knowledge_version_id=latest_rev.id).first()
            if audio_reference:
                audio_reference.reviewer_id = auth_ctx.user.id
                audio_reference.reviewed_at = now
                audio_reference.review_comment = payload.comments
                if decision_lower == "approved":
                    old_versions = db.query(KnowledgeVersion).filter(
                        KnowledgeVersion.item_id == article.id,
                        KnowledgeVersion.id != latest_rev.id,
                    ).all()
                    old_ids = [v.id for v in old_versions]
                    if old_ids:
                        db.query(AudioReference).filter(
                            AudioReference.knowledge_version_id.in_(old_ids),
                            AudioReference.status == "published",
                        ).update({"status": "superseded", "is_expert_verified": False}, synchronize_session=False)
                    audio_reference.status = "published"
                    audio_reference.is_expert_verified = True
                elif decision_lower == "rejected":
                    audio_reference.status = "rejected"
                    audio_reference.is_expert_verified = False
                elif decision_lower == "changes_requested":
                    audio_reference.status = "changes_requested"
                    audio_reference.is_expert_verified = False

        # A simulator scenario revision uses the shared KnowledgeVersion and
        # ApprovalRecord lifecycle; keep its immutable learner snapshot aligned.
        from app.models.simulation import SimulationScenarioRevision
        scenario_revision = db.query(SimulationScenarioRevision).filter_by(knowledge_version_id=latest_rev.id).first()
        if scenario_revision:
            if decision_lower == "approved":
                db.query(SimulationScenarioRevision).filter(
                    SimulationScenarioRevision.scenario_id == scenario_revision.scenario_id,
                    SimulationScenarioRevision.id != scenario_revision.id,
                    SimulationScenarioRevision.status == "published",
                ).update({"status": "superseded"}, synchronize_session=False)
                scenario_revision.status = "published"
                scenario_revision.published_at = now
            else:
                scenario_revision.status = "rejected"
            scenario_revision.reviewer_id = auth_ctx.user.id
            scenario_revision.reviewed_at = now

    db.commit()
    db.refresh(article)
    if latest_rev:
        db.refresh(latest_rev)
        # If approved and published, immediately index into the Assistant Knowledge Base and deactivate superseded versions
        if decision_lower == "approved":
            try:
                from app.modules.assistant.services.indexing_service import IndexingService
                from app.modules.assistant.models import KnowledgeSource, SOURCE_TYPE_KNOWLEDGE_VERSION

                prev_sources = (
                    db.query(KnowledgeSource)
                    .filter(
                        KnowledgeSource.source_type == SOURCE_TYPE_KNOWLEDGE_VERSION,
                        KnowledgeSource.knowledge_version_id != latest_rev.id,
                    )
                    .join(KnowledgeVersion, KnowledgeVersion.id == KnowledgeSource.knowledge_version_id)
                    .filter(KnowledgeVersion.item_id == article.id)
                    .all()
                )
                for ps in prev_sources:
                    IndexingService.deactivate_source_for_version(ps.source_ref_id, db, new_status="superseded")

                IndexingService.index_knowledge_version(latest_rev.id, db)
                # Transcript chunks share the same publication lifecycle as their version.
                from app.models.transcript import Transcript
                from app.modules.assistant.models import SOURCE_TYPE_TRANSCRIPT
                previous_version_ids = [pv.id for pv in prev_published]
                if previous_version_ids:
                    old_transcript_sources = (
                        db.query(KnowledgeSource)
                        .filter(
                            KnowledgeSource.source_type == SOURCE_TYPE_TRANSCRIPT,
                            KnowledgeSource.knowledge_version_id.in_(previous_version_ids),
                        )
                        .all()
                    )
                    for old_source in old_transcript_sources:
                        old_source.status = "superseded"
                        from app.modules.assistant.models import KnowledgeChunk
                        db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == old_source.id).update({"is_active": False})
                for transcript in db.query(Transcript).filter(Transcript.version_id == latest_rev.id).all():
                    media = transcript.media
                    IndexingService.index_transcript(transcript.id, db, title=media.title if media else None)
                from app.services.procedure_service import publish_workflow_snapshot
                publish_workflow_snapshot(db, latest_rev)
            except Exception as e:
                logger.error("Published knowledge workflow/RAG synchronization failed for version %s: %s", latest_rev.id, type(e).__name__)

    return _build_detail_response(db, article, latest_rev)

