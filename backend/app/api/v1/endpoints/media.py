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
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from app.core.exceptions import RangeNotSatisfiableError
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

router = APIRouter(tags=["Media Assets"])


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
