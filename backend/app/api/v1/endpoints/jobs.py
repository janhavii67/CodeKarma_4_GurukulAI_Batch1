from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.permissions import get_current_user, AuthenticatedContext
from app.core.exceptions import NotFoundError, ForbiddenError
from app.core.permissions import PERM_KNOWLEDGE_APPROVE, PERM_KNOWLEDGE_CREATE, csrf_protect
from app.models.processing_job import ProcessingJob
from app.schemas.voice import ProcessingJobResponse
from app.services.voice_service import retry_voice_job
from app.services.job_runner import execute_voice_processing_job
from app.services.media_service import MediaService

router = APIRouter(prefix="/processing-jobs", tags=["Processing Jobs"])


@router.get("/{job_id}", response_model=ProcessingJobResponse)
def get_job_status(
    job_id: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve real-time processing status, percentage progress, and safe error details.
    Polled every 2 seconds by the React frontend until terminal state.
    """
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise NotFoundError(code="job_not_found", message=f"Processing job '{job_id}' not found.")

    if not job.media:
        raise NotFoundError(code="media_not_found", message="The recording for this job was not found.")
    MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, job.media)

    return job


@router.post("/{job_id}/retry", response_model=ProcessingJobResponse, dependencies=[Depends(csrf_protect)])
def retry_failed_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retry a failed processing job.
    """
    if PERM_KNOWLEDGE_CREATE not in auth_ctx.permissions and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        raise ForbiddenError(code="forbidden", message="You do not have permission to retry transcription jobs.")
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise NotFoundError(code="job_not_found", message=f"Processing job '{job_id}' not found.")
    if not job.media:
        raise NotFoundError(code="media_not_found", message="The recording for this job was not found.")
    MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, job.media)
    job = retry_voice_job(
        db=db,
        job_id=job_id,
        user_id=auth_ctx.user.id,
        can_review=PERM_KNOWLEDGE_APPROVE in auth_ctx.permissions,
    )
    background_tasks.add_task(execute_voice_processing_job, job.id)
    return job
