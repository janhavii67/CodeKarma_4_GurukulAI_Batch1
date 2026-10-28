from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
import io
import uuid
from fastapi import BackgroundTasks
from app.core.config import settings
from app.models.processing_job import ProcessingJob
from app.services.job_runner import execute_voice_processing_job
from app.models.transcript import Transcript
from app.models.media import MediaAsset
from app.integrations.storage import get_storage_service
from app.core.permissions import PERM_KNOWLEDGE_APPROVE
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from app.core.exceptions import ForbiddenError, RangeNotSatisfiableError, ValidationError
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    get_current_user,
    require_permission,
    PERM_KNOWLEDGE_CREATE,
)
from app.db.session import get_db
from app.schemas.media import MediaAssetResponse, MediaConfigResponse
from app.services.media_service import MediaService
from app.models.machine import Machine
from app.repositories.media_repository import MediaRepository
from app.core.exceptions import NotFoundError, PayloadTooLargeError
from app.integrations.speech.factory import get_speech_provider
from app.integrations.speech.mock_provider import MockSpeechProvider

router = APIRouter(tags=["Media Assets"])


def _asset_response(asset: MediaAsset, **overrides) -> MediaAssetResponse:
    """Serialize ORM attributes safely after commits may have expired instance state."""
    response = MediaAssetResponse.model_validate(asset)
    return response.model_copy(update=overrides)


class MediaMetadataUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    description: Optional[str] = None
    tags: Optional[str] = None
    content: Optional[str] = None


@router.post("/machine-knowledge/{machine_id}/media", response_model=MediaAssetResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def upload_machine_media(
    machine_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    kind: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    if not db.get(Machine, machine_id):
        raise NotFoundError(code="machine_not_found", message="The selected machine was not found.")
    asset = MediaService.upload(db, auth_ctx.user, auth_ctx.permissions, None, file, kind,
        file.content_type, file.filename, request.client.host if request.client else None,
        machine_id=machine_id, title=title, description=description, tags=tags)
    transcript_status = "not_configured"
    job = None
    if asset.kind == "audio":
        try:
            speech_provider = get_speech_provider()
        except ValidationError:
            # Preserve the standalone audio upload when speech service config is
            # unavailable; the recording itself remains independently accessible.
            speech_provider = None
        if speech_provider is not None and not isinstance(speech_provider, MockSpeechProvider):
            job = ProcessingJob(type="voice_to_knowledge", media_id=asset.id, version_id=None,
                status="queued", progress=0, idempotency_key=f"voice:{asset.id}",
                user_id=auth_ctx.user.id, created_by=auth_ctx.user.id)
            db.add(job); db.commit(); db.refresh(job)
            background_tasks.add_task(execute_voice_processing_job, job.id)
            transcript_status = "processing"
    return _asset_response(asset,
        url=f"/api/v1/media/{asset.id}",
        transcript_status=transcript_status,
        transcript_job_id=job.id if job else None,
    )


@router.get("/machine-knowledge/{machine_id}/media", response_model=List[MediaAssetResponse])
def list_machine_media(machine_id: str, kind: Optional[str] = None, q: Optional[str] = None,
    auth_ctx: AuthenticatedContext = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Machine, machine_id):
        raise NotFoundError(code="machine_not_found", message="The selected machine was not found.")
    if kind == "transcript":
        rows = db.query(Transcript, Machine.name).join(Transcript.media).join(Machine, Machine.id == MediaAsset.machine_id).filter(Machine.id == machine_id)
        if q:
            rows = rows.filter(Transcript.full_text.ilike(f"%{q}%"))
        visible = []
        for transcript, _ in rows.order_by(Transcript.created_at.desc()).all():
            try:
                MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, transcript.media)
                visible.append(transcript)
            except ForbiddenError:
                continue
        return [{"id": t.id, "media_id": t.media_id, "version_id": t.version_id, "machine_id": machine_id,
            "title": f"Transcript · {t.media.title}", "description": None, "tags": None,
            "content": t.full_text, "transcript_id": t.id, "transcript_status": t.status,
            "transcript_job_id": None, "transcript_error": None,
            "kind": "transcript", "original_name": t.media.original_name, "mime": "text/plain",
            "size_bytes": len(t.full_text.encode("utf-8")), "uploaded_by": t.media.uploaded_by,
            "author_name": t.media.uploader.name, "verification_status": "pending_review",
            "created_at": t.created_at, "url": None} for t in visible]
    assets = MediaRepository.list_by_machine_id(db, machine_id, kind)
    visible_assets = []
    for asset in assets:
        try:
            MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
            visible_assets.append(asset)
        except ForbiddenError:
            continue
    assets = visible_assets
    if q:
        query = q.casefold()
        assets = [a for a in assets if query in (a.title or "").casefold() or query in (a.description or "").casefold() or query in (a.tags or "").casefold() or query in a.original_name.casefold()]
    results = []
    storage = get_storage_service()
    for a in assets:
        payload = {**a.__dict__, "url": f"/api/v1/media/{a.id}", "verification_status": "pending_review", "author_name": a.uploader.name}
        if a.kind == "notes":
            stream, _ = storage.open(a.storage_key)
            payload["content"] = b"".join(stream).decode("utf-8", errors="replace")
        transcript = db.query(Transcript).filter(Transcript.media_id == a.id).order_by(Transcript.created_at.desc()).first() if a.kind == "audio" else None
        if transcript:
            payload["transcript_id"] = transcript.id
            payload["transcript_status"] = transcript.status
        elif a.kind == "audio":
            job = db.query(ProcessingJob).filter(ProcessingJob.media_id == a.id).order_by(ProcessingJob.created_at.desc()).first()
            payload["transcript_status"] = job.status if job else "not_configured"
            payload["transcript_job_id"] = job.id if job else None
            payload["transcript_error"] = job.error_safe if job and job.status == "failed" else None
        results.append(MediaAssetResponse.model_validate(payload))
    return results


@router.post("/machine-knowledge/{machine_id}/notes", response_model=MediaAssetResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(csrf_protect)])
def create_machine_note(machine_id: str, title: str = Form(...), content: str = Form(...),
    description: Optional[str] = Form(None), tags: Optional[str] = Form(None),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    if not db.get(Machine, machine_id):
        raise NotFoundError(code="machine_not_found", message="The selected machine was not found.")
    if not content.strip():
        raise ValidationError(code="empty_note", message="Note content is required.")
    if len(content.encode("utf-8")) > settings.MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError(code="payload_too_large", message="The note exceeds the maximum allowed size limit.")
    filename = f"{title.strip()[:200] or 'Machine note'}.txt"
    note_file = io.BytesIO(content.encode("utf-8"))
    note_file.content_type = "text/plain"
    note_file.filename = filename
    asset = MediaService.upload(db, auth_ctx.user, auth_ctx.permissions, None, note_file,
        "notes", "text/plain", filename, machine_id=machine_id, title=title,
        description=description, tags=tags)
    return _asset_response(asset, content=content, url=f"/api/v1/media/{asset.id}")


@router.patch("/media/{id}", response_model=MediaAssetResponse, dependencies=[Depends(csrf_protect)])
def update_media_metadata(id: str, payload: MediaMetadataUpdate,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)), db: Session = Depends(get_db)):
    asset = MediaRepository.get_by_id(db, id)
    if not asset:
        raise NotFoundError(code="not_found", message="The requested media asset was not found.")
    if asset.version_id:
        from app.repositories.knowledge_repository import KnowledgeRepository
        from app.services.knowledge_service import KnowledgeService
        version = KnowledgeRepository.get_version_by_id(db, asset.version_id)
        if not version:
            raise NotFoundError(code="not_found", message="The requested media asset was not found.")
        KnowledgeService.ensure_can_edit_version(auth_ctx.user, auth_ctx.permissions, version)
    elif asset.uploaded_by != auth_ctx.user.id and PERM_KNOWLEDGE_APPROVE not in auth_ctx.permissions:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError(code="forbidden", message="You may only edit your own machine knowledge assets.")
    fields = payload.model_dump(exclude_unset=True)
    content = fields.pop("content", None)
    if content is not None:
        if asset.kind != "notes" or not content.strip():
            raise ValidationError(code="invalid_note_content", message="Only notes can update text content, and content cannot be empty.")
        storage = get_storage_service()
        storage.save(asset.storage_key, io.BytesIO(content.encode("utf-8")), max_bytes=settings.MAX_UPLOAD_BYTES)
    for key, value in fields.items():
        setattr(asset, key, value)
    db.commit(); db.refresh(asset)
    return _asset_response(asset, url=f"/api/v1/media/{asset.id}", verification_status="pending_review")


@router.post(
    "/knowledge-versions/{vid}/media",
    response_model=MediaAssetResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(csrf_protect)],
    summary="Upload a media asset attached to an editable knowledge version",
)
def upload_media(
    vid: str,
    request: Request,
    file: UploadFile = File(..., description="Multipart file payload"),
    kind: Optional[str] = Form(None, description="Optional declared kind: audio, video, image, document"),
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    asset = MediaService.upload(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        version_id=vid,
        upload_file=file,
        declared_kind=kind,
        declared_content_type=file.content_type,
        original_name=file.filename,
        ip_address=client_ip,
    )
    return MediaAssetResponse(
        id=asset.id,
        version_id=asset.version_id,
        kind=asset.kind,
        original_name=asset.original_name,
        mime=asset.mime,
        size_bytes=asset.size_bytes,
        uploaded_by=asset.uploaded_by,
        created_at=asset.created_at,
        url=f"/api/v1/media/{asset.id}",
    )


@router.get(
    "/knowledge-versions/{vid}/media",
    response_model=List[MediaAssetResponse],
    summary="List media assets attached to a visible knowledge version",
)
def list_version_media(
    vid: str,
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assets = MediaService.list_for_version(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        version_id=vid,
    )
    return [
        MediaAssetResponse(
            id=a.id,
            version_id=a.version_id,
            kind=a.kind,
            original_name=a.original_name,
            mime=a.mime,
            size_bytes=a.size_bytes,
            uploaded_by=a.uploaded_by,
            created_at=a.created_at,
            url=f"/api/v1/media/{a.id}",
        )
        for a in assets
    ]


@router.get(
    "/media/config",
    response_model=MediaConfigResponse,
    summary="Retrieve media upload limits and allowed MIME types",
)
def get_media_config(
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
):
    return MediaService.get_config()


@router.get(
    "/media/{id}",
    summary="Stream or download a media asset with HTTP Range support",
)
def get_media_stream(
    id: str,
    range: Optional[str] = Header(None, description="HTTP Range header for byte seeking"),
    auth_ctx: AuthenticatedContext = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        dl_info = MediaService.get_for_download(
            db=db,
            user=auth_ctx.user,
            permissions=auth_ctx.permissions,
            media_id=id,
            range_header=range,
        )
    except RangeNotSatisfiableError as exc:
        total_size = (exc.details or {}).get("total_size", "*")
        return Response(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{total_size}"},
            content=b"",
        )

    return StreamingResponse(
        dl_info["stream"],
        status_code=dl_info["status_code"],
        headers=dl_info["headers"],
    )


@router.delete(
    "/media/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(csrf_protect)],
    summary="Delete a media asset from an editable draft version",
)
def delete_media(
    id: str,
    request: Request,
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    MediaService.delete(
        db=db,
        user=auth_ctx.user,
        permissions=auth_ctx.permissions,
        media_id=id,
        ip_address=client_ip,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
