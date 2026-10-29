"""Recompute stored sound-reference fingerprints after the audio feature version changes.

References with an older ``feature_version`` are skipped by matching, so after upgrading
``FEATURE_VERSION`` every reference must be re-extracted from its original recording.
The audio is read from the linked media asset when present, otherwise from ``file_path``.

Run from the backend folder:  python -m scripts.reextract_audio_reference_features [--dry-run]
"""
import json
import sys
from pathlib import Path

from app.core.config import settings
from app.db.session import SessionLocal
from app.integrations.storage import get_storage_service
from app.models.audio import AudioReference
from app.models.media import MediaAsset
from app.services.audio_service import FEATURE_VERSION, AudioInputError, AudioProcessingError, extract_features


def _read_audio(db, reference: AudioReference) -> tuple[bytes, str] | None:
    if reference.media_asset_id:
        asset = db.get(MediaAsset, reference.media_asset_id)
        if asset:
            try:
                stream, _ = get_storage_service().open(asset.storage_key)
                return b"".join(stream), asset.original_name
            except Exception:
                pass
    for candidate in (Path(reference.file_path), Path(settings.MEDIA_ROOT) / reference.file_path):
        if candidate.is_file():
            return candidate.read_bytes(), candidate.name
    return None


def reextract(dry_run: bool = False) -> None:
    db = SessionLocal()
    updated, current, failed = 0, 0, []
    try:
        for reference in db.query(AudioReference).all():
            if reference.feature_version == FEATURE_VERSION:
                current += 1
                continue
            audio = _read_audio(db, reference)
            if not audio:
                failed.append((reference.title, "recording file not found"))
                continue
            try:
                features = extract_features(*audio)
            except (AudioInputError, AudioProcessingError) as exc:
                failed.append((reference.title, str(exc)))
                continue
            if not dry_run:
                reference.features_json = json.dumps({"version": features["version"], "vector": features["vector"]})
                reference.feature_version = FEATURE_VERSION
            updated += 1
        if not dry_run:
            db.commit()
    finally:
        db.close()
    print(f"{'Would update' if dry_run else 'Updated'} {updated}; already current {current}; failed {len(failed)}.")
    for title, reason in failed:
        print(f"  ! {title}: {reason}")


if __name__ == "__main__":
    reextract(dry_run="--dry-run" in sys.argv)
