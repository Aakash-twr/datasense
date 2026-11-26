"""Parser registry and exports."""

from __future__ import annotations

from app.ingestion.parsers.base import BaseParser, ParsedTable
from app.ingestion.parsers.csv_parser import CSVParser
from app.ingestion.parsers.excel_parser import ExcelParser
from app.ingestion.parsers.json_parser import JSONParser
from app.ingestion.parsers.parquet_parser import ParquetParser
from app.ingestion.validation import FileValidationError


def get_parser_for_type(source_type: str) -> BaseParser:
    """Return parser instance corresponding to source type."""
    if source_type == "csv":
        return CSVParser()
    if source_type == "excel":
        return ExcelParser()
    if source_type == "json":
        return JSONParser()
    if source_type == "parquet":
        return ParquetParser()
    raise FileValidationError("UNSUPPORTED_FORMAT", f"No parser available for type '{source_type}'.")


__all__ = [
    "BaseParser",
    "CSVParser",
    "ExcelParser",
    "JSONParser",
    "ParquetParser",
    "ParsedTable",
    "get_parser_for_type",
]
