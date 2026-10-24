import os
from pathlib import Path
import re
from typing import BinaryIO, Iterator, Optional, Tuple, Union
import uuid
from app.core.exceptions import PayloadTooLargeError
from app.core.logging import logger
from app.integrations.storage.base import StorageService


KEY_REGEX = re.compile(r"^[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{32}(?:\.[a-z0-9]+)?$")
DEFAULT_CHUNK_SIZE = 64 * 1024  # 64 KB


class LocalStorageService(StorageService):
    """Local filesystem storage implementation rooted at media_root."""

    def __init__(self, media_root: Union[str, Path]):
        self.media_root = Path(media_root).resolve()
        self.media_root.mkdir(parents=True, exist_ok=True, mode=0o750)

    def _resolve_path(self, storage_key: str) -> Path:
        """Validates key format and ensures path resolves strictly inside media_root."""
        if not isinstance(storage_key, str) or not KEY_REGEX.match(storage_key):
            raise ValueError("Invalid storage key format.")

        target = (self.media_root / storage_key).resolve()

        # Reject path traversal / symlink escapes
        try:
            target.relative_to(self.media_root)
        except ValueError:
            raise ValueError("Storage key path traversal detected.")

        return target

    def save(
        self,
        storage_key: str,
        stream: Union[BinaryIO, Iterator[bytes]],
        max_bytes: Optional[int] = None,
    ) -> int:
        final_path = self._resolve_path(storage_key)
        final_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)

        temp_name = f"{final_path.name}.part.{uuid.uuid4().hex}"
        temp_path = final_path.parent / temp_name

        total_bytes = 0
        try:
            with open(temp_path, "wb") as f:
                if hasattr(stream, "read"):
                    while True:
                        chunk = stream.read(DEFAULT_CHUNK_SIZE)
                        if not chunk:
                            break
                        total_bytes += len(chunk)
                        if max_bytes is not None and total_bytes > max_bytes:
                            raise PayloadTooLargeError(
                                code="payload_too_large",
                                message=f"Payload exceeds maximum allowed size limit of {max_bytes} bytes.",
                            )
                        f.write(chunk)
                else:
                    for chunk in stream:
                        if not chunk:
                            continue
                        total_bytes += len(chunk)
                        if max_bytes is not None and total_bytes > max_bytes:
                            raise PayloadTooLargeError(
                                code="payload_too_large",
                                message=f"Payload exceeds maximum allowed size limit of {max_bytes} bytes.",
                            )
                        f.write(chunk)

                f.flush()
                os.fsync(f.fileno())

            # Atomic replace into final key
            os.replace(temp_path, final_path)
            try:
                os.chmod(final_path, 0o640)
            except OSError:
                pass

            return total_bytes

        except Exception:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError as e:
                    logger.warning(f"Failed to remove temporary file: {e}")
            raise

    def open(
        self,
        storage_key: str,
        offset: int = 0,
        length: Optional[int] = None,
    ) -> Tuple[Iterator[bytes], int]:
        final_path = self._resolve_path(storage_key)
        if not final_path.is_file():
            raise FileNotFoundError(f"Storage file not found: {storage_key}")

        total_size = final_path.stat().st_size

        if offset < 0:
            offset = 0
        if offset > total_size:
            offset = total_size

        def _reader() -> Iterator[bytes]:
            f = open(final_path, "rb")
            try:
                if offset > 0:
                    f.seek(offset)
                remaining = length if length is not None else (total_size - offset)
                while remaining > 0:
                    read_size = min(DEFAULT_CHUNK_SIZE, remaining)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
            finally:
                f.close()

        return _reader(), total_size

    def delete(self, storage_key: str) -> bool:
        try:
            final_path = self._resolve_path(storage_key)
        except ValueError:
            return False

        if not final_path.exists():
            return False

        try:
            final_path.unlink()
            return True
        except OSError as e:
            logger.error(f"Failed to delete storage file: {e}")
            raise

    def exists(self, storage_key: str) -> bool:
        try:
            final_path = self._resolve_path(storage_key)
            return final_path.is_file()
        except ValueError:
            return False

    def get_size(self, storage_key: str) -> int:
        final_path = self._resolve_path(storage_key)
        if not final_path.is_file():
            raise FileNotFoundError(f"Storage file not found: {storage_key}")
        return final_path.stat().st_size
