"""Give media rows with non-standard storage keys a valid fan-out key.

Local storage only serves keys shaped like ``ab/cd/<32-hex>.ext``. Rows created by
older import scripts (for example ``documents/<machine>/<file>.pdf``) therefore read
as "not found on disk" even though the file exists. This copies each such file to a
valid key and updates the row. The original files are left in place.

Run from the backend folder:  python -m scripts.repair_media_storage_keys [--dry-run]
"""
import shutil
import sys
import uuid
from pathlib import Path

from app.core.config import settings
from app.db.session import SessionLocal
from app.integrations.storage.local import KEY_REGEX
from app.models.media import MediaAsset


def repair(dry_run: bool = False) -> int:
    media_root = Path(settings.MEDIA_ROOT).resolve()
    db = SessionLocal()
    repaired = 0
    try:
        for asset in db.query(MediaAsset).all():
            if KEY_REGEX.match(asset.storage_key or ""):
                continue
            source = (media_root / (asset.storage_key or "")).resolve()
            if not source.is_file() or media_root not in source.parents:
                print(f"  ! {asset.id} {asset.original_name}: file not found at {asset.storage_key}; skipped")
                continue
            ext = source.suffix.lower() if source.suffix.lower()[1:].isalnum() else ""
            raw_uuid = uuid.uuid4().hex
            new_key = f"{raw_uuid[:2]}/{raw_uuid[2:4]}/{raw_uuid}{ext}"
            print(f"  {asset.original_name}: {asset.storage_key} -> {new_key}")
            if not dry_run:
                target = media_root / new_key
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                asset.storage_key = new_key
            repaired += 1
        if not dry_run:
            db.commit()
    finally:
        db.close()
    print(f"{'Would repair' if dry_run else 'Repaired'} {repaired} media row(s).")
    return repaired


if __name__ == "__main__":
    repair(dry_run="--dry-run" in sys.argv)
