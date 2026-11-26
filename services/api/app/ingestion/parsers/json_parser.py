"""JSON and NDJSON (JSON Lines) parser using Polars."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from app.core.config import settings
from app.ingestion.parsers.base import BaseParser, ParsedTable
from app.ingestion.validation import FileValidationError


class JSONParser(BaseParser):
    """Parser for JSON array of objects and JSON Lines (NDJSON)."""

    def parse(self, file_path: Path) -> list[ParsedTable]:
        if not file_path.exists():
            raise FileValidationError("FILE_NOT_FOUND", "JSON file not found.")

        is_ndjson = self._is_ndjson(file_path)

        try:
            df = pl.read_ndjson(file_path) if is_ndjson else pl.read_json(file_path)
        except Exception as err:
            raise FileValidationError(
                "JSON_PARSE_ERROR",
                f"Failed to parse JSON file: {err}",
            ) from err

        if df.width == 0:
            raise FileValidationError("EMPTY_JSON", "JSON dataset contains no columns.")

        if df.height == 0:
            raise FileValidationError("EMPTY_JSON", "JSON dataset contains no data records.")

        if df.width > settings.max_dataset_columns:
            raise FileValidationError(
                "COLUMN_LIMIT_EXCEEDED",
                f"JSON dataset has {df.width} columns, exceeding limit of {settings.max_dataset_columns}.",
            )

        if df.height > settings.max_dataset_rows:
            raise FileValidationError(
                "ROW_LIMIT_EXCEEDED",
                f"JSON dataset has {df.height} rows, exceeding limit of {settings.max_dataset_rows}.",
            )

        table_name = file_path.stem.lower() or "table"
        return [
            ParsedTable(
                table_name=table_name,
                original_table_name=file_path.stem or "table",
                df=df,
            )
        ]

    def _is_ndjson(self, file_path: Path) -> bool:
        """Determine if file is NDJSON (starts with {) or JSON array (starts with [)."""
        with file_path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith("["):
                    return False
                if stripped.startswith("{"):
                    return True
        return False
