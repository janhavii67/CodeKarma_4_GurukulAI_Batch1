import os
from pathlib import Path
import re
from typing import Any, BinaryIO, Dict, Iterator, List, Optional, Tuple, Union
import unicodedata
import urllib.parse
import uuid
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    PayloadTooLargeError,
    RangeNotSatisfiableError,
    UnsupportedMediaTypeError,
    ValidationError,
)
from app.core.logging import logger
from app.core.permissions import (
    PERM_KNOWLEDGE_CREATE,
    PERM_KNOWLEDGE_APPROVE,
)
from app.integrations.storage import StorageService, get_storage_service
from app.models.knowledge import (
    KnowledgeItem,
    KnowledgeVersion,
    STATUS_PUBLISHED,
)
from app.models.media import (
    KIND_AUDIO,
    KIND_DOCUMENT,
    KIND_IMAGE,
    KIND_VIDEO,
    MediaAsset,
)
from app.models.user import User
from app.repositories.knowledge_repository import KnowledgeRepository
from app.repositories.media_repository import MediaRepository
from app.services.audit_service import AuditService
from app.services.knowledge_service import KnowledgeService


# Canonical MIME mappings and signatures
MIME_ALIASES = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-m4a": "audio/mp4",
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
}

MIME_TO_KIND = {
    "audio/webm": KIND_AUDIO,
    "audio/mpeg": KIND_AUDIO,
    "audio/wav": KIND_AUDIO,
    "audio/mp4": KIND_AUDIO,
    "audio/ogg": KIND_AUDIO,
    "video/mp4": KIND_VIDEO,
    "video/webm": KIND_VIDEO,
    "image/png": KIND_IMAGE,
    "image/jpeg": KIND_IMAGE,
    "application/pdf": KIND_DOCUMENT,
}

MIME_TO_EXT = {
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "application/pdf": ".pdf",
}

ALLOWED_MIME_TYPES: Dict[str, List[str]] = {
    KIND_AUDIO: [
        "audio/webm",
        "audio/mpeg",
        "audio/wav",
        "audio/mp4",
        "audio/ogg",
    ],
    KIND_VIDEO: [
        "video/mp4",
        "video/webm",
    ],
    KIND_IMAGE: [
        "image/png",
        "image/jpeg",
    ],
    KIND_DOCUMENT: [
        "application/pdf",
    ],
}


def normalize_mime(content_type: str) -> str:
    """Strips MIME parameters (e.g. codecs=opus) and resolves aliases."""
    if not content_type:
        return ""
    base_type = content_type.split(";")[0].strip().lower()
    return MIME_ALIASES.get(base_type, base_type)


def sanitize_filename(name: Optional[str], default_ext: str = "") -> str:
    """Sanitizes user filename strictly for display and Content-Disposition headers."""
    if not name:
        return f"media_asset{default_ext}"

    # Strip path components and null bytes
    cleaned = os.path.basename(name).replace("\x00", "")
    cleaned = re.split(r"[/\\]", cleaned)[-1]

    # Normalize Unicode and strip unprintable characters
    cleaned = unicodedata.normalize("NFKC", cleaned)
    cleaned = "".join(c for c in cleaned if c.isprintable())

    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned or cleaned.startswith("."):
        return f"media_asset{default_ext}"

    # Split name and ext to cap length at 255 chars preserving extension
    root, ext = os.path.splitext(cleaned)
    max_root_len = 255 - len(ext)
    if len(root) > max_root_len:
        root = root[:max_root_len]

    return f"{root}{ext}"


def verify_file_signature(header: bytes, canonical_mime: str) -> bool:
    """Validates the initial bytes of a payload against the declared canonical MIME type."""
    if len(header) == 0:
        return False

    # WebM / Matroska (EBML header 1A 45 DF A3)
    if canonical_mime in ("audio/webm", "video/webm"):
        return header.startswith(b"\x1a\x45\xdf\xa3")

    # MP4 / M4A (ftyp box at offset 4)
    if canonical_mime in ("video/mp4", "audio/mp4"):
        if len(header) >= 8 and header[4:8] == b"ftyp":
            return True
        return False

    # Ogg (OggS)
    if canonical_mime == "audio/ogg":
        return header.startswith(b"OggS")

    # WAV (RIFF....WAVE)
    if canonical_mime == "audio/wav":
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WAVE"

    # MP3 (ID3 tag or MPEG audio frame sync)
    if canonical_mime == "audio/mpeg":
        if header.startswith(b"ID3"):
            return True
        if len(header) >= 2:
            # MPEG frame sync: 11 bits set (0xFF followed by 0xE0 mask)
            first_byte = header[0]
            second_byte = header[1]
            if first_byte == 0xFF and (second_byte & 0xE0) == 0xE0:
                return True
        return False

    # PNG
    if canonical_mime == "image/png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")

    # JPEG
    if canonical_mime == "image/jpeg":
        return header.startswith(b"\xff\xd8\xff")

    # PDF
    if canonical_mime == "application/pdf":
        return header.startswith(b"%PDF-")

    return False


class MediaService:
    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """Returns the media configuration limits and allowed MIME types."""
        return {
            "max_upload_bytes": settings.MAX_UPLOAD_BYTES,
            "allowed_mime_types": ALLOWED_MIME_TYPES,
            "max_media_per_version": settings.MAX_MEDIA_PER_VERSION,
        }

    @classmethod
    def upload(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        version_id: str,
        upload_file: Any,  # Starlette UploadFile or compatible file object
        declared_kind: Optional[str] = None,
        declared_content_type: Optional[str] = None,
        original_name: Optional[str] = None,
        ip_address: Optional[str] = None,
        storage: Optional[StorageService] = None,
    ) -> MediaAsset:
        """Processes upload, validates type and content signatures, saves to storage, and records in DB."""
        if storage is None:
            storage = get_storage_service()

        # 1. Authorize: Check knowledge.create, draft ownership, and editable status
        version = KnowledgeRepository.get_version_by_id(db, version_id)
        if not version:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge version was not found.",
            )

        KnowledgeService.ensure_can_edit_version(user, permissions, version)

        # 2. Check per-version asset quota
        current_count = MediaRepository.count_by_version_id(db, version.id)
        if current_count >= settings.MAX_MEDIA_PER_VERSION:
            raise ConflictError(
                code="media_cap_reached",
                message=f"Per-version media limit of {settings.MAX_MEDIA_PER_VERSION} assets reached.",
            )

        # 3. Validate MIME type allow-list
        raw_mime = (
            declared_content_type
            or getattr(upload_file, "content_type", None)
            or "application/octet-stream"
        )
        canonical_mime = normalize_mime(raw_mime)

        if canonical_mime not in MIME_TO_KIND:
            raise UnsupportedMediaTypeError(
                code="unsupported_media_type",
                message=f"MIME type '{raw_mime}' is not supported.",
            )

        derived_kind = MIME_TO_KIND[canonical_mime]

        # 4. Kind validation
        if declared_kind:
            cleaned_kind = declared_kind.strip().lower()
            if cleaned_kind != derived_kind:
                raise ValidationError(
                    code="kind_mismatch",
                    message=f"Declared kind '{declared_kind}' does not match file content type '{canonical_mime}' (derived: '{derived_kind}').",
                )

        # 5. Read initial chunk (up to 512 bytes) to check magic bytes and zero-length
        raw_filename = original_name or getattr(upload_file, "filename", None) or "media"
        file_obj = getattr(upload_file, "file", upload_file)

        header_chunk = file_obj.read(512)
        if not header_chunk or len(header_chunk) == 0:
            raise ValidationError(
                code="empty_file",
                message="The uploaded file is empty (0 bytes).",
            )

        # Validate magic bytes against canonical MIME
        if not verify_file_signature(header_chunk, canonical_mime):
            raise UnsupportedMediaTypeError(
                code="unsupported_media_type",
                message=f"File signature does not match declared MIME type '{canonical_mime}'.",
            )

        # 6. Stream file into storage with generated key
        ext = MIME_TO_EXT[canonical_mime]
        sanitized_name = sanitize_filename(raw_filename, default_ext=ext)

        # Generate fan-out storage key: ab/cd/<uuid>.<ext>
        raw_uuid = uuid.uuid4().hex
        storage_key = f"{raw_uuid[:2]}/{raw_uuid[2:4]}/{raw_uuid}{ext}"

        def _combined_stream() -> Iterator[bytes]:
            yield header_chunk
            while True:
                chunk = file_obj.read(64 * 1024)
                if not chunk:
                    break
                yield chunk

        try:
            total_bytes = storage.save(
                storage_key=storage_key,
                stream=_combined_stream(),
                max_bytes=settings.MAX_UPLOAD_BYTES,
            )
        except PayloadTooLargeError:
            raise
        except Exception as e:
            logger.error(f"Failed to stream media asset to storage: {e}")
            raise

        # 7. Insert row and audit log in one atomic DB transaction
        try:
            asset = MediaRepository.create(
                db=db,
                version_id=version.id,
                kind=derived_kind,
                storage_key=storage_key,
                original_name=sanitized_name,
                mime=canonical_mime,
                size_bytes=total_bytes,
                uploaded_by=user.id,
                commit=False,
            )

            AuditService.log(
                db=db,
                action="media.upload",
                entity_type="media_asset",
                entity_id=asset.id,
                actor_id=user.id,
                detail={
                    "version_id": version.id,
                    "kind": derived_kind,
                    "mime": canonical_mime,
                    "size_bytes": total_bytes,
                },
                ip_address=ip_address,
                commit=False,
            )

            db.commit()
            db.refresh(asset)
            return asset

        except Exception as db_exc:
            db.rollback()
            # Clean up stored file on DB failure
            try:
                storage.delete(storage_key)
            except Exception as cleanup_err:
                logger.error(f"Failed to clean up stored file after DB error: {cleanup_err}")
            raise db_exc

    @classmethod
    def list_for_version(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        version_id: str,
    ) -> List[MediaAsset]:
        """Lists media assets for a version visible to the caller."""
        version = KnowledgeRepository.get_version_by_id(db, version_id)
        if not version:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge version was not found.",
            )

        item = KnowledgeRepository.get_item_by_id(db, version.item_id)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested knowledge item was not found.",
            )

        KnowledgeService.ensure_can_view_version(user, permissions, version, item)
        return MediaRepository.list_by_version_id(db, version.id)

    @classmethod
    def get_for_download(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        media_id: str,
        range_header: Optional[str] = None,
        storage: Optional[StorageService] = None,
    ) -> Dict[str, Any]:
        """Verifies download authorization and prepares chunked streaming and Range metadata."""
        if storage is None:
            storage = get_storage_service()

        asset = MediaRepository.get_by_id(db, media_id)
        if not asset:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        version = KnowledgeRepository.get_version_by_id(db, asset.version_id)
        if not version:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        item = KnowledgeRepository.get_item_by_id(db, version.item_id)
        if not item:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        # Enforce visibility rules (identical 404 for nonexistent and unauthorized)
        KnowledgeService.ensure_can_view_version(user, permissions, version, item)

        if not storage.exists(asset.storage_key):
            logger.error(f"Missing media file in storage for asset_id={asset.id}")
            raise NotFoundError(
                code="not_found",
                message="The requested media file was not found on disk.",
            )

        total_size = asset.size_bytes

        # Range header parsing (RFC 7233)
        status_code = 200
        content_range: Optional[str] = None
        offset = 0
        length = total_size

        if range_header and range_header.startswith("bytes="):
            range_val = range_header[len("bytes="):].strip()

            # Multi-range requests: ignore Range and serve full response (legal per RFC 7233)
            if "," in range_val:
                offset = 0
                length = total_size
                status_code = 200
            else:
                parts = range_val.split("-")
                start_str, end_str = parts[0].strip(), parts[1].strip()

                if start_str == "" and end_str != "":
                    # Suffix range: bytes=-N
                    try:
                        suffix_len = int(end_str)
                    except ValueError:
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    if suffix_len <= 0:
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    suffix_len = min(suffix_len, total_size)
                    offset = total_size - suffix_len
                    length = suffix_len
                    status_code = 206
                    content_range = f"bytes {offset}-{total_size - 1}/{total_size}"

                elif start_str != "" and end_str == "":
                    # Open-ended range: bytes=start-
                    try:
                        start_pos = int(start_str)
                    except ValueError:
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    if start_pos >= total_size or start_pos < 0:
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    offset = start_pos
                    length = total_size - start_pos
                    status_code = 206
                    content_range = f"bytes {offset}-{total_size - 1}/{total_size}"

                elif start_str != "" and end_str != "":
                    # Explicit range: bytes=start-end
                    try:
                        start_pos = int(start_str)
                        end_pos = int(end_str)
                    except ValueError:
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    if (
                        start_pos < 0
                        or start_pos > end_pos
                        or start_pos >= total_size
                    ):
                        raise RangeNotSatisfiableError(
                            details={"total_size": total_size}
                        )
                    end_pos = min(end_pos, total_size - 1)
                    offset = start_pos
                    length = end_pos - start_pos + 1
                    status_code = 206
                    content_range = f"bytes {offset}-{end_pos}/{total_size}"

        stream_iterator, _ = storage.open(
            storage_key=asset.storage_key,
            offset=offset,
            length=length,
        )

        # RFC 5987 / RFC 6266 filename encoding
        safe_ascii = re.sub(r"[^\x20-\x7E]", "_", asset.original_name).replace('"', '\\"')
        encoded_utf8 = urllib.parse.quote(asset.original_name, safe="")
        content_disposition = f'inline; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded_utf8}'

        headers: Dict[str, str] = {
            "Content-Type": asset.mime,
            "Content-Length": str(length),
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": content_disposition,
            "Cache-Control": "private, no-store",
        }

        if content_range:
            headers["Content-Range"] = content_range

        if asset.mime == "application/pdf":
            headers["Content-Security-Policy"] = "sandbox"

        return {
            "asset": asset,
            "stream": stream_iterator,
            "status_code": status_code,
            "headers": headers,
        }

    @classmethod
    def delete(
        cls,
        db: Session,
        user: User,
        permissions: List[str],
        media_id: str,
        ip_address: Optional[str] = None,
        storage: Optional[StorageService] = None,
    ) -> None:
        """Deletes media row and audit log first, then deletes file from storage."""
        if storage is None:
            storage = get_storage_service()

        asset = MediaRepository.get_by_id(db, media_id)
        if not asset:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        version = KnowledgeRepository.get_version_by_id(db, asset.version_id)
        if not version:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        KnowledgeService.ensure_can_edit_version(user, permissions, version)

        storage_key = asset.storage_key
        asset_id = asset.id
        version_id = version.id
        kind = asset.kind
        mime = asset.mime
        size_bytes = asset.size_bytes

        # 1. DB-first: delete row and audit log in one transaction
        MediaRepository.delete(db, asset, commit=False)

        AuditService.log(
            db=db,
            action="media.delete",
            entity_type="media_asset",
            entity_id=asset_id,
            actor_id=user.id,
            detail={
                "version_id": version_id,
                "kind": kind,
                "mime": mime,
                "size_bytes": size_bytes,
            },
            ip_address=ip_address,
            commit=False,
        )

        db.commit()

        # 2. Storage second: Best effort deletion
        try:
            storage.delete(storage_key)
        except Exception as e:
            logger.error(
                f"Failed to delete storage file for asset_id={asset_id} key={storage_key}: {e}"
            )

    @classmethod
    def get_asset_for_processing(
        cls,
        db: Session,
        media_id: str,
        storage: Optional[StorageService] = None,
    ) -> Tuple[MediaAsset, Iterator[bytes]]:
        """Internal interface for inter-module integration (e.g. Module 04 speech transcription).

        NOTE: This is an internal read interface that performs NO user authorization.
        Callers must run from trusted server-side code and perform their own authorization.
        """
        if storage is None:
            storage = get_storage_service()

        asset = MediaRepository.get_by_id(db, media_id)
        if not asset:
            raise NotFoundError(
                code="not_found",
                message="The requested media asset was not found.",
            )

        stream, _ = storage.open(asset.storage_key)
        return asset, stream
