"""Tests for file validation, integrity checks, and storage abstraction."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from app.ingestion.storage.local_storage import LocalStorageService
from app.ingestion.validation import (
    FileValidationError,
    validate_file_content,
    validate_file_metadata,
)


def test_validate_file_metadata_valid_formats() -> None:
    """Allowed file extensions should be accepted and return correct source type."""
    assert validate_file_metadata("sales.csv", 100) == "csv"
    assert validate_file_metadata("workbook.XLSX", 100) == "excel"
    assert validate_file_metadata("data.json", 100) == "json"
    assert validate_file_metadata("table.parquet", 100) == "parquet"


def test_validate_file_metadata_unsupported_format() -> None:
    """Unsupported file extensions should raise FileValidationError."""
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_metadata("script.py", 100)
    assert exc_info.value.code == "UNSUPPORTED_FORMAT"

    with pytest.raises(FileValidationError) as exc_info:
        validate_file_metadata("archive.zip", 100)
    assert exc_info.value.code == "UNSUPPORTED_FORMAT"


def test_validate_file_metadata_empty_file() -> None:
    """Empty files (0 bytes) should raise FileValidationError."""
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_metadata("sales.csv", 0)
    assert exc_info.value.code == "EMPTY_FILE"


def test_validate_file_metadata_oversized_file() -> None:
    """Files exceeding maximum allowed size should raise FileValidationError."""
    oversized = 30 * 1024 * 1024  # 30 MB (limit is 25 MB)
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_metadata("large.csv", oversized)
    assert exc_info.value.code == "FILE_TOO_LARGE"


def test_validate_parquet_magic_bytes(tmp_path: Path) -> None:
    """Parquet validation should check for PAR1 magic bytes."""
    valid_parquet = tmp_path / "valid.parquet"
    valid_parquet.write_bytes(b"PAR1somepayloadPAR1")
    # Should not raise
    validate_file_content(valid_parquet, "parquet")

    invalid_parquet = tmp_path / "invalid.parquet"
    invalid_parquet.write_bytes(b"NOT_PARQUET_DATA")
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_content(invalid_parquet, "parquet")
    assert exc_info.value.code == "INVALID_PARQUET"


def test_validate_excel_zip_signature(tmp_path: Path) -> None:
    """Excel validation should verify ZIP container signature and structure."""
    invalid_excel = tmp_path / "corrupt.xlsx"
    invalid_excel.write_bytes(b"NOT_A_ZIP_CONTAINER")
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_content(invalid_excel, "excel")
    assert exc_info.value.code == "INVALID_EXCEL"

    # Valid ZIP container
    valid_excel = tmp_path / "valid.xlsx"
    with zipfile.ZipFile(valid_excel, "w") as zf:
        zf.writestr("[Content_Types].xml", b"<xml></xml>")
    validate_file_content(valid_excel, "excel")


def test_validate_json_structure(tmp_path: Path) -> None:
    """JSON validation should accept arrays of objects and reject malformed JSON."""
    valid_array = tmp_path / "array.json"
    valid_array.write_text('[{"id": 1, "name": "Test"}]', encoding="utf-8")
    validate_file_content(valid_array, "json")

    valid_ndjson = tmp_path / "lines.json"
    valid_ndjson.write_text('{"id": 1}\n{"id": 2}\n', encoding="utf-8")
    validate_file_content(valid_ndjson, "json")

    invalid_json = tmp_path / "invalid.json"
    invalid_json.write_text('{"bad_json: missing_brace', encoding="utf-8")
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_content(invalid_json, "json")
    assert exc_info.value.code == "MALFORMED_JSON"

    empty_array = tmp_path / "empty_array.json"
    empty_array.write_text("[]", encoding="utf-8")
    with pytest.raises(FileValidationError) as exc_info:
        validate_file_content(empty_array, "json")
    assert exc_info.value.code == "EMPTY_JSON_ARRAY"


def test_storage_path_traversal_protection(tmp_path: Path) -> None:
    """StorageService should prevent path traversal attacks."""
    storage = LocalStorageService(root_dir=tmp_path)

    # Attempting to escape root_dir via ../ should be rejected
    with pytest.raises(ValueError, match="Path traversal detected"):
        storage.save_file(b"malicious", "../../../etc/passwd")

    with pytest.raises(ValueError, match="Path traversal detected"):
        storage.get_file_path("../../outside.txt")


def test_storage_crud_operations(tmp_path: Path) -> None:
    """StorageService should save, read, check existence, and delete files."""
    storage = LocalStorageService(root_dir=tmp_path)
    key = "orgs/1/projects/2/datasets/3/versions/1/original/test.csv"

    # Save
    saved_key = storage.save_file(b"id,val\n1,hello", key)
    assert saved_key == key
    assert storage.file_exists(key) is True
    assert storage.get_file_size(key) == len(b"id,val\n1,hello")

    # Read
    content = storage.read_file_bytes(key)
    assert content == b"id,val\n1,hello"

    # Delete
    deleted = storage.delete_file(key)
    assert deleted is True
    assert storage.file_exists(key) is False
