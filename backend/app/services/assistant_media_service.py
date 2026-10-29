"""Bounded parsing and MIME validation for one-off AI Tutor attachments."""
from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Any
from xml.etree import ElementTree

from app.core.exceptions import PayloadTooLargeError, ValidationError


MAX_MEDIA_BYTES = 14 * 1024 * 1024
MAX_TEXT_CHARS = 40_000
MAX_ARCHIVE_EXPANDED_BYTES = 40 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 1_000
MAX_EMBEDDED_IMAGES = 4

SUPPORTED_MEDIA_FORMATS = ".mp3, .wav, .flac, .m4a, .aac, .aiff, .aif, .ogg, .opus, .weba, .webm, .mp4, .mov, .avi, .flv, .mpeg, .mpg, .wmv, .3gp, .png, .jpg, .jpeg, .webp, .pdf, .docx, .pptx, .xlsx, .csv, .txt, .md"


@dataclass
class PreparedAttachment:
    filename: str
    mime_type: str
    text: str = ""
    media_parts: list[dict[str, Any]] = field(default_factory=list)


def _check_size(data: bytes) -> None:
    if not data:
        raise ValidationError(code="empty_file", message="The attachment is empty.")
    if len(data) > MAX_MEDIA_BYTES:
        raise PayloadTooLargeError(code="payload_too_large", message="Tutor attachments must be 14 MB or smaller.")


def _zip_entries(data: bytes) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        entries = archive.infolist()
    except (zipfile.BadZipFile, OSError) as exc:
        raise ValidationError(code="invalid_document", message="The document is incomplete or invalid.") from exc
    if len(entries) > MAX_ARCHIVE_ENTRIES or sum(entry.file_size for entry in entries) > MAX_ARCHIVE_EXPANDED_BYTES:
        archive.close()
        raise PayloadTooLargeError(code="document_too_complex", message="The compressed document expands beyond the supported processing limit.")
    return archive


def _mime_from_image(data: bytes) -> str | None:
    if data.startswith(b"BM"):
        return "image/bmp"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _is_quicktime_mov(data: bytes) -> bool:
    """Accept MOV only when its ISO BMFF ftyp box identifies the QuickTime brand."""
    if len(data) < 16 or data[4:8] != b"ftyp":
        return False

    box_size = int.from_bytes(data[:4], "big")
    if box_size < 16 or box_size > len(data) or (box_size - 16) % 4:
        return False

    brands = [data[8:12]]
    brands.extend(data[offset : offset + 4] for offset in range(16, box_size, 4))
    return b"qt  " in brands


def _extract_archive_images(archive: zipfile.ZipFile, prefix: str) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    for entry in archive.infolist():
        normalized = entry.filename.replace("\\", "/").lower()
        if not normalized.startswith(prefix) or not re.search(r"\.(png|jpe?g|webp)$", normalized):
            continue
        if entry.file_size > 3 * 1024 * 1024:
            continue
        content = archive.read(entry)
        mime = _mime_from_image(content)
        if mime:
            images.append({"mime_type": mime, "data": content})
        if len(images) >= MAX_EMBEDDED_IMAGES:
            break
    return images


def _extract_docx(data: bytes) -> tuple[str, list[dict[str, Any]]]:
    try:
        from docx import Document

        document = Document(io.BytesIO(data))
        blocks = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    blocks.append(" | ".join(cells))
        with _zip_entries(data) as archive:
            images = _extract_archive_images(archive, "word/media/")
        return "\n".join(blocks)[:MAX_TEXT_CHARS], images
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(code="invalid_document", message="The Word document could not be read.") from exc


def _extract_xlsx(data: bytes) -> str:
    try:
        import openpyxl

        book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        blocks: list[str] = []
        for sheet in book.worksheets[:20]:
            blocks.append(f"Sheet: {sheet.title}")
            for row_number, row in enumerate(sheet.iter_rows(values_only=True), start=1):
                if row_number > 200:
                    blocks.append("[remaining rows omitted]")
                    break
                values = [str(value).strip() for value in row[:40] if value is not None and str(value).strip()]
                if values:
                    blocks.append(" | ".join(values))
                if sum(map(len, blocks)) >= MAX_TEXT_CHARS:
                    break
            if sum(map(len, blocks)) >= MAX_TEXT_CHARS:
                break
        book.close()
        return "\n".join(blocks)[:MAX_TEXT_CHARS]
    except Exception as exc:
        raise ValidationError(code="invalid_document", message="The spreadsheet could not be read.") from exc


def _extract_pptx(data: bytes) -> tuple[str, list[dict[str, Any]]]:
    try:
        with _zip_entries(data) as archive:
            slide_names = sorted(
                (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
                key=lambda name: int(re.search(r"slide(\d+)", name).group(1)),  # type: ignore[union-attr]
            )
            lines: list[str] = []
            for index, slide in enumerate(slide_names[:100], start=1):
                root = ElementTree.fromstring(archive.read(slide))
                text = [node.text.strip() for node in root.iter() if node.tag.endswith("}t") and node.text and node.text.strip()]
                if text:
                    lines.append(f"Slide {index}: " + " | ".join(text))
                if sum(map(len, lines)) >= MAX_TEXT_CHARS:
                    break
            images = _extract_archive_images(archive, "ppt/media/")
            return "\n".join(lines)[:MAX_TEXT_CHARS], images
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(code="invalid_document", message="The PowerPoint presentation could not be read.") from exc


def prepare_attachment(data: bytes, filename: str | None) -> PreparedAttachment:
    """Validate the declared extension against signatures, then extract bounded text/media."""
    _check_size(data)
    safe_name = PurePath((filename or "attachment").replace("\\", "/")).name[:180]
    suffix = PurePath(safe_name).suffix.lower()

    if suffix == ".bmp":
        if _mime_from_image(data) != "image/bmp":
            raise ValidationError(code="invalid_media_signature", message="The image contents do not match the selected file type.")
        raise ValidationError(
            code="unsupported_media_type",
            message="BMP images are not supported by the AI provider. Convert the image to PNG, JPEG, or WebP and upload it again.",
        )

    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        mime = _mime_from_image(data)
        if not mime or (suffix == ".png" and mime != "image/png") or (suffix in {".jpg", ".jpeg"} and mime != "image/jpeg") or (suffix == ".webp" and mime != "image/webp"):
            raise ValidationError(code="invalid_media_signature", message="The image contents do not match the selected file type.")
        return PreparedAttachment(safe_name, mime, media_parts=[{"mime_type": mime, "data": data}])

    audio_types = {
        ".wav": ("audio/wav", lambda: data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WAVE"),
        ".flac": ("audio/flac", lambda: data.startswith(b"fLaC")),
        ".mp3": ("audio/mpeg", lambda: data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and (data[1] & 0x06) != 0)),
        ".m4a": ("audio/m4a", lambda: len(data) >= 12 and data[4:8] == b"ftyp"),
        ".aac": ("audio/aac", lambda: len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xF6) == 0xF0),
        ".aiff": ("audio/aiff", lambda: len(data) >= 12 and data.startswith(b"FORM") and data[8:12] in {b"AIFF", b"AIFC"}),
        ".aif": ("audio/aiff", lambda: len(data) >= 12 and data.startswith(b"FORM") and data[8:12] in {b"AIFF", b"AIFC"}),
        ".ogg": ("audio/ogg", lambda: data.startswith(b"OggS")),
        ".opus": ("audio/opus", lambda: data.startswith(b"OggS")),
        ".weba": ("audio/webm", lambda: data.startswith(b"\x1aE\xdf\xa3")),
    }
    if suffix in audio_types:
        mime, signature_check = audio_types[suffix]
        if not signature_check():
            raise ValidationError(code="invalid_media_signature", message="The audio contents do not match the selected file type.")
        return PreparedAttachment(safe_name, mime, media_parts=[{"mime_type": mime, "data": data}])

    video_types = {
        ".mp4": ("video/mp4", lambda: len(data) >= 12 and data[4:8] == b"ftyp"),
        ".webm": ("video/webm", lambda: data.startswith(b"\x1aE\xdf\xa3")),
        ".mov": ("video/mov", lambda: _is_quicktime_mov(data)),
        ".avi": ("video/avi", lambda: len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"AVI "),
        ".flv": ("video/x-flv", lambda: data.startswith(b"FLV")),
        ".mpeg": ("video/mpeg", lambda: len(data) >= 4 and data[:3] == b"\x00\x00\x01" and data[3] in {0x00, 0xB3, 0xBA}),
        ".mpg": ("video/mpeg", lambda: len(data) >= 4 and data[:3] == b"\x00\x00\x01" and data[3] in {0x00, 0xB3, 0xBA}),
        ".wmv": ("video/wmv", lambda: data.startswith(bytes.fromhex("3026B2758E66CF11A6D900AA0062CE6C"))),
        ".3gp": ("video/3gpp", lambda: len(data) >= 12 and data[4:8] == b"ftyp" and data[8:11] == b"3gp"),
    }
    if suffix in video_types:
        mime, signature_check = video_types[suffix]
        if not signature_check():
            raise ValidationError(code="invalid_media_signature", message="The video contents do not match the selected file type.")
        return PreparedAttachment(safe_name, mime, media_parts=[{"mime_type": mime, "data": data}])

    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise ValidationError(code="invalid_media_signature", message="The file is not a valid PDF document.")
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data), strict=False)
            text = "\n".join((page.extract_text() or "") for page in reader.pages[:200])[:MAX_TEXT_CHARS]
        except Exception as exc:
            raise ValidationError(code="invalid_document", message="The PDF document could not be read.") from exc
        return PreparedAttachment(safe_name, "application/pdf", text=text, media_parts=[{"mime_type": "application/pdf", "data": data}])

    if suffix in {".docx", ".pptx", ".xlsx"}:
        with _zip_entries(data) as archive:
            names = set(archive.namelist())
        if suffix == ".docx" and "word/document.xml" in names:
            text, images = _extract_docx(data)
        elif suffix == ".pptx" and "ppt/presentation.xml" in names:
            text, images = _extract_pptx(data)
        elif suffix == ".xlsx" and "xl/workbook.xml" in names:
            text, images = _extract_xlsx(data), []
            with _zip_entries(data) as archive:
                images = _extract_archive_images(archive, "xl/media/")
        else:
            raise ValidationError(code="invalid_document", message="The document contents do not match the selected file type.")
        return PreparedAttachment(safe_name, "application/vnd.openxmlformats-officedocument", text=text, media_parts=images)

    if suffix in {".txt", ".md"}:
        try:
            text = data.decode("utf-8-sig")[:MAX_TEXT_CHARS]
        except UnicodeDecodeError as exc:
            raise ValidationError(code="invalid_document", message="Text attachments must use UTF-8 encoding.") from exc
        return PreparedAttachment(safe_name, "text/plain", text=text)

    if suffix == ".csv":
        try:
            content = data.decode("utf-8-sig")
            rows = csv.reader(io.StringIO(content))
            text = "\n".join(" | ".join(cell.strip() for cell in row[:40]) for _, row in zip(range(500), rows))[:MAX_TEXT_CHARS]
        except (UnicodeDecodeError, csv.Error) as exc:
            raise ValidationError(code="invalid_document", message="The CSV document could not be read as UTF-8.") from exc
        return PreparedAttachment(safe_name, "text/csv", text=text)

    raise ValidationError(
        code="unsupported_media_type",
        message=f"This file type is not supported. Supported formats: {SUPPORTED_MEDIA_FORMATS}.",
    )
