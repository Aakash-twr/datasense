"""Excel workbook parser using fastexcel for multi-sheet extraction."""

from __future__ import annotations

from pathlib import Path

import fastexcel

from app.core.config import settings
from app.ingestion.normalization.table_normalizer import deduplicate_table_names
from app.ingestion.parsers.base import BaseParser, ParsedTable
from app.ingestion.validation import FileValidationError


class ExcelParser(BaseParser):
    """Excel (.xlsx) parser extracting all non-empty sheets into logical tables."""

    def parse(self, file_path: Path) -> list[ParsedTable]:
        if not file_path.exists():
            raise FileValidationError("FILE_NOT_FOUND", "Excel file not found.")

        try:
            excel = fastexcel.read_excel(file_path)
            sheet_names = excel.sheet_names
        except Exception as err:
            raise FileValidationError(
                "EXCEL_PARSE_ERROR",
                f"Failed to read Excel workbook: {err}",
            ) from err

        if not sheet_names:
            raise FileValidationError("EMPTY_WORKBOOK", "The Excel workbook has no sheets.")

        normalized_names = deduplicate_table_names(sheet_names)
        tables: list[ParsedTable] = []

        total_rows = 0
        for orig_name, clean_name in normalized_names:
            try:
                sheet = excel.load_sheet_by_name(orig_name)
                df = sheet.to_polars()
            except Exception:
                continue

            # Skip empty worksheets
            if df.width == 0 or df.height == 0:
                continue

            if df.width > settings.max_dataset_columns:
                raise FileValidationError(
                    "COLUMN_LIMIT_EXCEEDED",
                    f"Sheet '{orig_name}' has {df.width} columns, exceeding limit of {settings.max_dataset_columns}.",
                )

            total_rows += df.height
            if total_rows > settings.max_dataset_rows:
                raise FileValidationError(
                    "ROW_LIMIT_EXCEEDED",
                    f"Excel workbook total rows ({total_rows}) exceeds limit of {settings.max_dataset_rows}.",
                )

            tables.append(
                ParsedTable(
                    table_name=clean_name,
                    original_table_name=orig_name,
                    df=df,
                )
            )

        if not tables:
            raise FileValidationError(
                "EMPTY_WORKBOOK",
                "The Excel workbook contains no sheets with tabular data.",
            )

        return tables
