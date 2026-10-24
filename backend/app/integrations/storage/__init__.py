from typing import Optional
from app.core.config import settings
from app.integrations.storage.base import StorageService
from app.integrations.storage.local import LocalStorageService

_storage_instance: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Dependency injection provider for the active StorageService."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalStorageService(media_root=settings.MEDIA_ROOT)
    return _storage_instance


def set_storage_service(service: Optional[StorageService]) -> None:
    """Allows test fixtures to inject an in-memory or custom storage provider."""
    global _storage_instance
    _storage_instance = service


__all__ = [
    "StorageService",
    "LocalStorageService",
    "get_storage_service",
    "set_storage_service",
]
