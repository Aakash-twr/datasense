"""Statistical profiling engine for numerical, categorical, and temporal data."""

from __future__ import annotations

import math
from typing import Any

import polars as pl


def profile_column_statistics(
    series: pl.Series,
    canonical_type: str,
    total_rows: int,
) -> dict[str, Any]:
    """Calculate column-level statistics based on canonical data type."""
    null_count = series.null_count()
    null_percentage = round((null_count / total_rows * 100), 2) if total_rows > 0 else 0.0
    unique_count = series.n_unique()

    stats: dict[str, Any] = {
        "null_count": null_count,
        "null_percentage": null_percentage,
        "unique_count": unique_count,
        "is_constant": unique_count == 1 if total_rows > 0 else False,
    }

    non_null_series = series.drop_nulls()

    if canonical_type in ("integer", "float", "decimal") and len(non_null_series) > 0:
        try:
            min_val = non_null_series.min()
            max_val = non_null_series.max()
            mean_val = non_null_series.mean()
            median_val = non_null_series.median()
            std_val = non_null_series.std()

            # Guard against NaN/Infinity
            def _clean_num(val: Any) -> float | None:
                if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
                    return None
                return round(float(val), 4)

            stats.update(
                {
                    "min": _clean_num(min_val),
                    "max": _clean_num(max_val),
                    "mean": _clean_num(mean_val),
                    "median": _clean_num(median_val),
                    "std": _clean_num(std_val),
                }
            )
        except Exception:
            pass

    elif canonical_type == "string" and len(non_null_series) > 0:
        try:
            # Top 10 most frequent values
            vc = non_null_series.value_counts(sort=True).head(10)
            top_values: list[dict[str, Any]] = []
            val_col = vc.columns[0]
            count_col = vc.columns[1]
            for row in vc.iter_rows(named=True):
                val_str = str(row[val_col])
                c = int(row[count_col])
                pct = round(c / total_rows * 100, 2) if total_rows > 0 else 0.0
                top_values.append({"value": val_str[:100], "count": c, "percentage": pct})
            stats["top_values"] = top_values
        except Exception:
            stats["top_values"] = []

    elif canonical_type in ("date", "datetime") and len(non_null_series) > 0:
        try:
            min_dt = non_null_series.min()
            max_dt = non_null_series.max()
            stats["min_date"] = str(min_dt) if min_dt is not None else None
            stats["max_date"] = str(max_dt) if max_dt is not None else None
        except Exception:
            pass

    return stats


def profile_table_statistics(df: pl.DataFrame) -> dict[str, Any]:
    """Calculate dataset and table level summary statistics."""
    total_rows = df.height
    total_columns = df.width

    null_counts_per_col = {col: df[col].null_count() for col in df.columns}
    total_missing_cells = sum(null_counts_per_col.values())
    total_cells = total_rows * total_columns
    missing_percentage = (
        round(total_missing_cells / total_cells * 100, 2) if total_cells > 0 else 0.0
    )
    cols_with_missing = [col for col, count in null_counts_per_col.items() if count > 0]

    # Duplicate row calculation with safety ceiling for 8GB Mac M1
    duplicate_rows_count: int | str = 0
    if total_rows <= 100_000:
        try:
            duplicate_rows_count = int(df.is_duplicated().sum())
        except Exception:
            duplicate_rows_count = "skipped_due_to_error"
    else:
        duplicate_rows_count = "skipped_due_to_row_limit"

    return {
        "total_rows": total_rows,
        "total_columns": total_columns,
        "total_missing_cells": total_missing_cells,
        "missing_percentage": missing_percentage,
        "columns_with_missing_count": len(cols_with_missing),
        "columns_with_missing": cols_with_missing[:50],
        "duplicate_rows_count": duplicate_rows_count,
    }
