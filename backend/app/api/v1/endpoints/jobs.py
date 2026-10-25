from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.permissions import get_current_user, AuthenticatedContext
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.processing_job import ProcessingJob
from app.schemas.voice import ProcessingJobResponse
from app.services.voice_service import retry_voice_job
from app.services.job_runner import execute_voice_processing_job

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

    return job


@router.post("/{job_id}/retry", response_model=ProcessingJobResponse)
def retry_failed_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retry a failed processing job.
    """
    job = retry_voice_job(db=db, job_id=job_id, user_id=auth_ctx.user.id)
    background_tasks.add_task(execute_voice_processing_job, job.id)
    return job
