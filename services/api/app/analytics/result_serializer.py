"""DuckDB result serializer for safe, JSON-compliant response formatting."""

from __future__ import annotations

import datetime
import decimal
import math
import uuid
from typing import Any

from app.analytics.schemas import QueryColumn


def clean_val(val: Any) -> Any:
    """Recursively clean Python/DuckDB objects to strict JSON-compatible types."""
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, decimal.Decimal):
        # Convert Decimal to float if finite, else string
        try:
            f = float(val)
            return f if math.isfinite(f) else str(val)
        except (ValueError, OverflowError):
            return str(val)
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(val, bytes):
        return val.hex()
    if isinstance(val, (list, tuple)):
        return [clean_val(x) for x in val]
    if isinstance(val, dict):
        return {str(k): clean_val(v) for k, v in val.items()}
    return val


def serialize_query_results(
    description: list[tuple[str, str, Any, Any, Any, Any, Any]] | None,
    raw_rows: list[tuple[Any, ...]] | list[list[Any]],
    max_rows: int = 2000,
) -> tuple[list[QueryColumn], list[list[Any]], int, bool]:
    """Serializes DuckDB cursor description and fetched rows.

    Returns:
        columns: List of QueryColumn(name, type)
        rows: List of cleaned row arrays
        total_returned: Number of rows returned in this batch
        truncated: True if more rows existed than max_rows
    """
    columns: list[QueryColumn] = []
    if description:
        for col_desc in description:
            col_name = str(col_desc[0])
            col_type = str(col_desc[1]) if len(col_desc) > 1 and col_desc[1] else "VARCHAR"
            columns.append(QueryColumn(name=col_name, type=col_type))

    total_count = len(raw_rows)
    truncated = total_count > max_rows

    sliced_rows = raw_rows[:max_rows]
    cleaned_rows: list[list[Any]] = []
    for row in sliced_rows:
        cleaned_rows.append([clean_val(v) for v in row])

    return columns, cleaned_rows, len(cleaned_rows), truncated
