"""Parquet parser using Polars."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from app.core.config import settings
from app.ingestion.parsers.base import BaseParser, ParsedTable
from app.ingestion.validation import FileValidationError


class ParquetParser(BaseParser):
    """Parser for Parquet files."""

    def parse(self, file_path: Path) -> list[ParsedTable]:
        if not file_path.exists():
            raise FileValidationError("FILE_NOT_FOUND", "Parquet file not found.")

        try:
            df = pl.read_parquet(file_path)
        except Exception as err:
            raise FileValidationError(
                "PARQUET_PARSE_ERROR",
                f"Failed to parse Parquet file: {err}",
            ) from err

        if df.width == 0:
            raise FileValidationError("EMPTY_PARQUET", "Parquet file contains no columns.")

        if df.height == 0:
            raise FileValidationError("EMPTY_PARQUET", "Parquet file contains no data rows.")

        if df.width > settings.max_dataset_columns:
            raise FileValidationError(
                "COLUMN_LIMIT_EXCEEDED",
                f"Parquet file has {df.width} columns, exceeding limit of {settings.max_dataset_columns}.",
            )

        if df.height > settings.max_dataset_rows:
            raise FileValidationError(
                "ROW_LIMIT_EXCEEDED",
                f"Parquet file has {df.height} rows, exceeding limit of {settings.max_dataset_rows}.",
            )

        table_name = file_path.stem.lower() or "table"
        return [
            ParsedTable(
                table_name=table_name,
                original_table_name=file_path.stem or "table",
                df=df,
            )
        ]
