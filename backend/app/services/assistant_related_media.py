"""Media that backs a tutor answer: files attached to the knowledge the answer actually cites.

Only cited sources are considered, every file passes the normal media access check, and
nothing is generated or guessed; when no attached file exists, the list is empty.
"""
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.permissions import AuthenticatedContext
from app.models.media import MediaAsset
from app.modules.assistant.models import KnowledgeSource
from app.schemas.assistant import RelatedMediaItem, SourceItem
from app.services.media_service import MediaService

RELATED_KINDS = ("image", "video", "audio", "document")
MAX_RELATED_MEDIA = 6


def _assets_for_source(db: Session, source: KnowledgeSource) -> List[MediaAsset]:
    query = db.query(MediaAsset).filter(MediaAsset.kind.in_(RELATED_KINDS))
    if source.knowledge_version_id:
        return query.filter(MediaAsset.version_id == source.knowledge_version_id).order_by(MediaAsset.created_at).all()
    if source.source_type == "knowledge_base_document" and (source.source_ref_id or "").startswith("kb:"):
        # Folder-ingested manuals map to the machine-library copy of the same file.
        query = query.filter(MediaAsset.original_name == source.source_ref_id[3:])
        if source.machine_id:
            query = query.filter(MediaAsset.machine_id == source.machine_id)
        return query.order_by(MediaAsset.created_at).all()
    return []


def get_related_media(db: Session, auth_ctx: AuthenticatedContext, sources: Optional[Sequence[SourceItem]]) -> List[RelatedMediaItem]:
    """Return viewable files attached to cited sources, in citation rank order."""
    items: List[RelatedMediaItem] = []
    seen: set[str] = set()
    for cited in sorted(sources or [], key=lambda item: item.rank):
        source = db.get(KnowledgeSource, cited.source_id)
        if not source:
            continue
        for asset in _assets_for_source(db, source):
            if asset.id in seen:
                continue
            try:
                MediaService.ensure_can_view_asset(db, auth_ctx.user, auth_ctx.permissions, asset)
            except (ForbiddenError, NotFoundError):
                continue
            seen.add(asset.id)
            items.append(RelatedMediaItem(
                id=asset.id,
                title=asset.title if asset.title and asset.title != "Untitled Media" else asset.original_name,
                kind=asset.kind,
                mime=asset.mime,
                filename=asset.original_name,
                size_bytes=asset.size_bytes,
                url=f"/api/v1/media/{asset.id}",
                source_id=source.id,
                source_title=cited.title,
            ))
            if len(items) >= MAX_RELATED_MEDIA:
                return items
    return items
