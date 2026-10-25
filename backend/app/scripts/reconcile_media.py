import argparse
import os
from pathlib import Path
import sys
import time
from typing import List, Optional, Tuple

# Ensure backend root is on sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import SessionLocal
from app.integrations.storage import get_storage_service
from app.integrations.storage.local import KEY_REGEX
from app.models.media import MediaAsset
from app.repositories.media_repository import MediaRepository


def scan_storage_files(media_root: Path) -> List[Tuple[str, Path, float]]:
    """Walks the media_root directory and collects relative keys matching storage format, file paths, and mtime."""
    found_files = []
    if not media_root.exists():
        return found_files

    for root, _, files in os.walk(media_root):
        for f in files:
            # Ignore active temp files (.part)
            if ".part." in f:
                continue
            full_path = Path(root) / f
            try:
                rel_key = full_path.relative_to(media_root).as_posix()
            except ValueError:
                continue

            if KEY_REGEX.match(rel_key):
                mtime = full_path.stat().st_mtime
                found_files.append((rel_key, full_path, mtime))

    return found_files


def reconcile_media(
    safety_seconds: int = 3600,
    delete_orphans: bool = False,
    db: Optional[Session] = None,
) -> Tuple[List[str], List[str]]:
    """Scans media storage and database for synchronization drift.

    Returns:
        (orphaned_files, missing_files)
    """
    storage = get_storage_service()
    media_root = Path(settings.MEDIA_ROOT).resolve()
    current_time = time.time()

    close_db = False
    if db is None:
        session = SessionLocal()
        close_db = True
    else:
        session = db

    try:
        db_assets = MediaRepository.list_all(session)
        db_keys = {a.storage_key: a for a in db_assets}
    finally:
        if close_db:
            session.close()

    storage_files = scan_storage_files(media_root)
    storage_keys = {k for k, _, _ in storage_files}

    # 1. Identify orphaned files in storage older than safety_seconds
    orphaned_files = []
    for rel_key, full_path, mtime in storage_files:
        if rel_key not in db_keys:
            age_seconds = current_time - mtime
            if age_seconds >= safety_seconds:
                orphaned_files.append((rel_key, full_path, age_seconds))

    # 2. Identify DB records whose files are missing on disk
    missing_files = []
    for key, asset in db_keys.items():
        if key not in storage_keys or not storage.exists(key):
            missing_files.append((asset.id, key))

    # Reporting
    print(f"--- Media Storage Reconciliation Report ---")
    print(f"Media Root: {media_root}")
    print(f"Total DB records: {len(db_keys)}")
    print(f"Total Storage files: {len(storage_files)}")
    print(f"Safety age threshold: {safety_seconds}s")
    print()

    if orphaned_files:
        print(f"[!] Found {len(orphaned_files)} orphaned file(s) in storage with no DB record:")
        for rel_key, full_path, age in orphaned_files:
            print(f"    - Key: {rel_key} (age: {int(age)}s)")
    else:
        print("[-] No orphaned files found in storage.")

    print()
    if missing_files:
        print(f"[!] Found {len(missing_files)} DB record(s) with missing storage files on disk:")
        for asset_id, key in missing_files:
            print(f"    - Asset ID: {asset_id} | Expected Key: {key}")
    else:
        print("[-] No missing storage files for DB records.")

    print()

    # Deletion of orphaned files if requested
    deleted_keys = []
    if delete_orphans:
        if orphaned_files:
            print("[*] Deleting orphaned files from storage...")
            for rel_key, full_path, _ in orphaned_files:
                try:
                    full_path.unlink()
                    deleted_keys.append(rel_key)
                    print(f"    Deleted: {rel_key}")
                except OSError as e:
                    print(f"    Failed to delete {rel_key}: {e}", file=sys.stderr)
            print(f"[+] Successfully deleted {len(deleted_keys)} orphaned file(s).")
        else:
            print("[-] No orphaned files to delete.")
    else:
        if orphaned_files:
            print("[i] Dry-run mode: orphaned files were NOT deleted. Use --delete-orphans to remove them.")

    return [k for k, _, _ in orphaned_files], [k for _, k in missing_files]


def main():
    parser = argparse.ArgumentParser(
        description="Reconcile media assets between database and storage directory."
    )
    parser.add_argument(
        "--safety-seconds",
        type=int,
        default=3600,
        help="Age in seconds before an unindexed storage file is flagged as orphaned (default: 3600s / 1hr).",
    )
    parser.add_argument(
        "--delete-orphans",
        action="store_true",
        help="Explicitly delete orphaned files on disk (never deletes DB records).",
    )
    args = parser.parse_args()

    reconcile_media(
        safety_seconds=args.safety_seconds,
        delete_orphans=args.delete_orphans,
    )


if __name__ == "__main__":
    main()
