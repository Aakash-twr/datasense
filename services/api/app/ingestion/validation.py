"""Dataset file validation: signatures, size limits, format checks, and integrity."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from app.core.config import settings


class FileValidationError(Exception):
    """Raised when an uploaded file fails validation."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".json", ".parquet"}

# Parquet files must begin with PAR1
PARQUET_MAGIC = b"PAR1"

# ZIP files (including XLSX) begin with PK\x03\x04
ZIP_MAGIC = b"PK\x03\x04"


def validate_file_metadata(filename: str, file_size: int) -> str:
    """Validate filename extension and byte size before reading content."""
    if not filename:
        raise FileValidationError("EMPTY_FILENAME", "Filename is required.")

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise FileValidationError(
            "UNSUPPORTED_FORMAT",
            f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    if file_size <= 0:
        raise FileValidationError("EMPTY_FILE", "The uploaded file is empty (0 bytes).")

    if file_size > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes // (1024 * 1024)
        raise FileValidationError(
            "FILE_TOO_LARGE",
            f"File size exceeds the {max_mb} MB limit.",
        )

    # Determine canonical source type
    if ext == ".csv":
        return "csv"
    if ext == ".xlsx":
        return "excel"
    if ext == ".json":
        return "json"
    if ext == ".parquet":
        return "parquet"
    return "csv"


def validate_file_content(file_path: Path, source_type: str) -> None:
    """Validate content integrity, magic bytes, and basic structure."""
    if not file_path.exists():
        raise FileValidationError("FILE_NOT_FOUND", "Uploaded file could not be found on disk.")

    size = file_path.stat().st_size
    if size == 0:
        raise FileValidationError("EMPTY_FILE", "The uploaded file is empty (0 bytes).")

    if size > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes // (1024 * 1024)
        raise FileValidationError("FILE_TOO_LARGE", f"File size exceeds the {max_mb} MB limit.")

    if source_type == "parquet":
        _validate_parquet(file_path)
    elif source_type == "excel":
        _validate_excel(file_path)
    elif source_type == "json":
        _validate_json(file_path)
    elif source_type == "csv":
        _validate_csv(file_path)


def _validate_parquet(file_path: Path) -> None:
    """Validate Parquet header magic bytes."""
    with file_path.open("rb") as f:
        header = f.read(4)
        if header != PARQUET_MAGIC:
            raise FileValidationError(
                "INVALID_PARQUET",
                "The file is not a valid Parquet file (missing PAR1 signature).",
            )


def _validate_excel(file_path: Path) -> None:
    """Validate XLSX ZIP container integrity and guard against ZIP bombs."""
    with file_path.open("rb") as f:
        header = f.read(4)
        if header != ZIP_MAGIC:
            raise FileValidationError(
                "INVALID_EXCEL",
                "The file is not a valid Excel (.xlsx) workbook.",
            )

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            # Check for bad zip CRC
            bad_file = zf.testzip()
            if bad_file:
                raise FileValidationError(
                    "CORRUPT_EXCEL",
                    f"Excel workbook archive is corrupted (bad CRC on {bad_file}).",
                )

            # Zip bomb mitigation: check total uncompressed size vs limit
            total_uncompressed = sum(info.file_size for info in zf.infolist())
            max_uncompressed = settings.max_upload_size_bytes * 10  # 10x compression safety ceiling
            if total_uncompressed > max_uncompressed:
                raise FileValidationError(
                    "ARCHIVE_TOO_LARGE",
                    "Uncompressed workbook contents exceed safety expansion limits.",
                )
    except zipfile.BadZipFile as err:
        raise FileValidationError("CORRUPT_EXCEL", "Malformed Excel workbook.") from err


def _validate_json(file_path: Path) -> None:
    """Validate JSON is either a non-empty array of objects or valid JSON Lines."""
    try:
        with file_path.open("r", encoding="utf-8") as f:
            first_char = ""
            while True:
                ch = f.read(1)
                if not ch:
                    break
                if not ch.isspace():
                    first_char = ch
                    break

            if not first_char:
                raise FileValidationError("EMPTY_JSON", "The JSON file contains no data.")

            f.seek(0)
            if first_char == "[":
                # JSON array: sample first chunk or parse
                data = json.load(f)
                if not isinstance(data, list):
                    raise FileValidationError(
                        "INVALID_JSON_STRUCTURE",
                        "Root element must be a JSON array of objects.",
                    )
                if len(data) == 0:
                    raise FileValidationError("EMPTY_JSON_ARRAY", "JSON array is empty.")
                if not isinstance(data[0], dict):
                    raise FileValidationError(
                        "INVALID_JSON_ELEMENTS",
                        "JSON array must contain JSON objects ({...}).",
                    )
            elif first_char == "{":
                # JSON Lines / NDJSON: validate first line is an object
                first_line = f.readline().strip()
                item = json.loads(first_line)
                if not isinstance(item, dict):
                    raise FileValidationError(
                        "INVALID_JSON_LINE",
                        "JSON lines must contain JSON objects ({...}).",
                    )
            else:
                raise FileValidationError(
                    "INVALID_JSON_STRUCTURE",
                    "JSON must be either a JSON array of objects or JSON Lines (NDJSON).",
                )
    except UnicodeDecodeError as err:
        raise FileValidationError("INVALID_ENCODING", "JSON file must be encoded in UTF-8.") from err
    except json.JSONDecodeError as err:
        raise FileValidationError("MALFORMED_JSON", f"Malformed JSON: {err.msg}") from err


def _validate_csv(file_path: Path) -> None:
    """Validate CSV encoding and ensure it has content."""
    # Attempt UTF-8 reading
    try:
        with file_path.open("r", encoding="utf-8-sig") as f:
            first_line = f.readline()
            if not first_line.strip():
                raise FileValidationError("EMPTY_CSV", "CSV file contains no readable header row.")
    except UnicodeDecodeError as err:
        raise FileValidationError(
            "INVALID_ENCODING",
            "CSV file must be encoded in UTF-8 or UTF-8-SIG.",
        ) from err
