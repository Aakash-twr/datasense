"""Local filesystem storage implementation with path traversal protection."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.ingestion.storage.interface import StorageService


class LocalStorageService(StorageService):
    """Local filesystem storage adhering to the DataSense directory layout."""

    def __init__(self, root_dir: str | Path | None = None) -> None:
        self.root_dir = Path(root_dir or settings.data_storage_root).resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_and_verify(self, storage_key: str) -> Path:
        """Resolve storage key against root directory and ensure no path traversal or symlink escape."""
        clean_key = storage_key.lstrip("/\\")
        if "\x00" in clean_key or ".." in Path(clean_key).parts:
            raise ValueError(f"Path traversal detected: {storage_key}")
        candidate = self.root_dir / clean_key
        # Reject any existing symlink component inside storage root
        curr = candidate
        while curr != self.root_dir and curr != curr.parent:
            if curr.exists() and curr.is_symlink():
                raise ValueError(f"Symlink escape detected: {storage_key}")
            curr = curr.parent
        target_path = candidate.resolve()
        try:
            target_path.relative_to(self.root_dir)
        except ValueError as err:
            raise ValueError(f"Path traversal detected: {storage_key}") from err
        return target_path

    def save_file(self, data: bytes | BinaryIO, storage_key: str) -> str:
        """Save bytes or stream to disk."""
        path = self._resolve_and_verify(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            with path.open("wb") as f:
                shutil.copyfileobj(data, f)
        return storage_key

    def get_file_path(self, storage_key: str) -> Path:
        """Return resolved path if file exists, else raise FileNotFoundError."""
        path = self._resolve_and_verify(storage_key)
        if not path.exists():
            raise FileNotFoundError(f"Storage file not found: {storage_key}")
        return path

    def delete_file(self, storage_key: str) -> bool:
        """Delete specific file."""
        try:
            path = self._resolve_and_verify(storage_key)
            if path.exists() and path.is_file():
                path.unlink()
                return True
            return False
        except (ValueError, FileNotFoundError):
            return False

    def delete_prefix(self, prefix: str) -> int:
        """Delete directory tree or file matching prefix."""
        try:
            path = self._resolve_and_verify(prefix)
            if not path.exists():
                return 0
            if path.is_file():
                path.unlink()
                return 1
            count = sum(1 for p in path.rglob("*") if p.is_file())
            shutil.rmtree(path, ignore_errors=True)
            return count
        except ValueError:
            return 0

    def file_exists(self, storage_key: str) -> bool:
        """Check if file exists."""
        try:
            path = self._resolve_and_verify(storage_key)
            return path.exists() and path.is_file()
        except ValueError:
            return False

    def read_file_bytes(self, storage_key: str) -> bytes:
        """Read bytes from storage."""
        path = self.get_file_path(storage_key)
        return path.read_bytes()

    def open_file(self, storage_key: str, mode: str = "rb") -> BinaryIO:
        """Open file stream."""
        path = self._resolve_and_verify(storage_key)
        if "r" in mode and not path.exists():
            raise FileNotFoundError(f"Storage file not found: {storage_key}")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path.open(mode)

    def get_file_size(self, storage_key: str) -> int:
        """Return size in bytes."""
        path = self.get_file_path(storage_key)
        return path.stat().st_size


def sanitize_filename(filename: str) -> str:
    """Sanitize original filename to remove path traversal and risky characters."""
    base = Path(filename).name
    # Keep alphanumeric, dots, underscores, dashes
    clean = re.sub(r"[^\w\.-]", "_", base)
    return clean or "unnamed_file"


def build_original_file_key(
    org_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    filename: str,
) -> str:
    """Construct key for original uploaded file."""
    safe_name = sanitize_filename(filename)
    return f"organizations/{org_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/original/{safe_name}"


def build_normalized_parquet_key(
    org_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    table_name: str,
) -> str:
    """Construct key for normalized Parquet table."""
    safe_table = re.sub(r"[^\w-]", "_", table_name)
    return f"organizations/{org_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/normalized/{safe_table}.parquet"


def build_manifest_key(
    org_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
) -> str:
    """Construct key for dataset version manifest."""
    return f"organizations/{org_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/manifest.json"


# Default storage singleton
default_storage: StorageService = LocalStorageService()
