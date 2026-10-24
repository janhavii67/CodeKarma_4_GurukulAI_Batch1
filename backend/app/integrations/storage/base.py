from abc import ABC, abstractmethod
from typing import BinaryIO, Iterator, Optional, Tuple, Union


class StorageService(ABC):
    """Abstract interface for media storage backends.

    Encapsulates raw byte storage and retrieval. Size policies and MIME validation
    reside in the service layer, keeping storage implementations decoupled from HTTP
    and application semantics.
    """

    @abstractmethod
    def save(
        self,
        storage_key: str,
        stream: Union[BinaryIO, Iterator[bytes]],
        max_bytes: Optional[int] = None,
    ) -> int:
        """Stream data into storage at storage_key.

        Accepts chunked or streaming sources without loading the entire payload into
        memory. Aborts immediately and cleans up temporary resources if max_bytes is
        exceeded. Returns total bytes written.
        """
        raise NotImplementedError

    @abstractmethod
    def open(
        self,
        storage_key: str,
        offset: int = 0,
        length: Optional[int] = None,
    ) -> Tuple[Iterator[bytes], int]:
        """Open an asset stream with optional byte range slicing.

        Returns an iterator of byte chunks and the total file size in bytes. Closes
        underlying file handles reliably even on partial consumption or client disconnect.
        """
        raise NotImplementedError

    @abstractmethod
    def delete(self, storage_key: str) -> bool:
        """Idempotently delete the asset at storage_key.

        Returns True if deleted, False if already missing. Raises on unexpected I/O errors.
        """
        raise NotImplementedError

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        """Returns True if the asset exists in storage."""
        raise NotImplementedError

    @abstractmethod
    def get_size(self, storage_key: str) -> int:
        """Returns the total size of the asset in bytes."""
        raise NotImplementedError
