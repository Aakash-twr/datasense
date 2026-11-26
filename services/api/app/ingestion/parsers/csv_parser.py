"""CSV parser using Polars with encoding and delimiter detection."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from app.core.config import settings
from app.ingestion.parsers.base import BaseParser, ParsedTable
from app.ingestion.validation import FileValidationError


class CSVParser(BaseParser):
    """Robust CSV parser with delimiter sniffing and conservative limits."""

    def parse(self, file_path: Path) -> list[ParsedTable]:
        if not file_path.exists():
            raise FileValidationError("FILE_NOT_FOUND", "CSV file not found.")

        # Detect delimiter
        delimiter = self._detect_delimiter(file_path)

        try:
            # Read using Polars with date parsing and encoding detection
            df = pl.read_csv(
                file_path,
                separator=delimiter,
                try_parse_dates=True,
                ignore_errors=True,
                truncate_ragged_lines=True,
            )
        except Exception as err:
            raise FileValidationError(
                "CSV_PARSE_ERROR",
                f"Failed to parse CSV file: {err}",
            ) from err

        if df.width == 0:
            raise FileValidationError("EMPTY_CSV", "CSV file contains no columns.")

        if df.height == 0:
            raise FileValidationError("EMPTY_CSV", "CSV file contains no data rows.")

        if df.width > settings.max_dataset_columns:
            raise FileValidationError(
                "COLUMN_LIMIT_EXCEEDED",
                f"CSV has {df.width} columns, exceeding the maximum allowed {settings.max_dataset_columns}.",
            )

        if df.height > settings.max_dataset_rows:
            raise FileValidationError(
                "ROW_LIMIT_EXCEEDED",
                f"CSV has {df.height} rows, exceeding the maximum allowed {settings.max_dataset_rows}.",
            )

        table_name = file_path.stem.lower() or "table"
        return [
            ParsedTable(
                table_name=table_name,
                original_table_name=file_path.stem or "table",
                df=df,
            )
        ]

    def _detect_delimiter(self, file_path: Path) -> str:
        """Sniff delimiter from first few non-empty lines."""
        try:
            with file_path.open("r", encoding="utf-8-sig", errors="ignore") as f:
                lines = [f.readline() for _ in range(5)]
                sample = "\n".join(line for line in lines if line.strip())

            if not sample:
                return ","

            # Count potential delimiters
            counts = {
                ",": sample.count(","),
                ";": sample.count(";"),
                "\t": sample.count("\t"),
                "|": sample.count("|"),
            }
            best = max(counts, key=counts.get)  # type: ignore[arg-type]
            return best if counts[best] > 0 else ","
        except Exception:
            return ","
