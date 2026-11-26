"""Storage service interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO


class StorageService(ABC):
    """Abstract interface for dataset file storage."""

    @abstractmethod
    def save_file(self, data: bytes | BinaryIO, storage_key: str) -> str:
        """Save file content to the storage key and return the key."""

    @abstractmethod
    def get_file_path(self, storage_key: str) -> Path:
        """Get the local filesystem path for a storage key."""

    @abstractmethod
    def delete_file(self, storage_key: str) -> bool:
        """Delete file at storage key. Return True if deleted, False if not found."""

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int:
        """Delete all files starting with prefix. Return count of deleted files."""

    @abstractmethod
    def file_exists(self, storage_key: str) -> bool:
        """Check if file exists at storage key."""

    @abstractmethod
    def read_file_bytes(self, storage_key: str) -> bytes:
        """Read all bytes from storage key."""

    @abstractmethod
    def open_file(self, storage_key: str, mode: str = "rb") -> BinaryIO:
        """Open file for reading or writing."""

    @abstractmethod
    def get_file_size(self, storage_key: str) -> int:
        """Get file size in bytes."""
