import argparse
import sys
from pathlib import Path
from app.db.session import SessionLocal
from app.modules.assistant.services.folder_ingest_service import FolderIngestService


def main():
    parser = argparse.ArgumentParser(description="Ingest documentation files from a knowledge base folder.")
    parser.add_argument(
        "--path",
        type=str,
        required=True,
        help="Path to the knowledge base folder (e.g. 'Knowledge Base' or 'data/knowledge_base')",
    )
    args = parser.parse_args()

    # Resolve target directory (check direct path, relative to repo root, or relative to backend)
    target_path = Path(args.path)
    if not target_path.exists():
        # Try parent directory if running inside backend/
        alt_path = Path("..") / args.path
        if alt_path.exists():
            target_path = alt_path
        else:
            print(f"Error: Directory '{args.path}' not found.", file=sys.stderr)
            sys.exit(1)

    print(f"Ingesting technical documentation from: {target_path.resolve()}")
    db = SessionLocal()
    try:
        summary = FolderIngestService.ingest_folder(str(target_path), db)
        for f in summary.ingested_files:
            print(f"[INGESTED] {f.name}: {f.chunk_count} chunks ({f.status})")
        for s in summary.skipped_files:
            print(f"[SKIPPED] {s.name}: {s.reason}")

        print(f"\nIngestion Complete: {len(summary.ingested_files)} files processed, {summary.total_chunks} total chunks.")
    except Exception as e:
        print(f"Ingestion failed: {type(e).__name__} - {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
