"""Deterministic data quality detection and warning generation."""

from __future__ import annotations

from typing import Any

import polars as pl


def detect_data_quality_issues(
    df: pl.DataFrame,
    column_stats: dict[str, dict[str, Any]],
    column_mappings: dict[str, str],  # physical_name -> original_name
) -> list[dict[str, Any]]:
    """Generate structured data quality warnings based on real computed metrics."""
    warnings: list[dict[str, Any]] = []
    total_rows = df.height

    for phys_col, stats in column_stats.items():
        orig_col = column_mappings.get(phys_col, phys_col)
        null_count = stats.get("null_count", 0)
        null_pct = stats.get("null_percentage", 0.0)
        unique_count = stats.get("unique_count", 0)

        # 1. 100% empty column
        if total_rows > 0 and null_count == total_rows:
            warnings.append(
                {
                    "severity": "critical",
                    "code": "EMPTY_COLUMN",
                    "column": orig_col,
                    "message": f"Column '{orig_col}' contains 100% missing values.",
                    "affected_rows": total_rows,
                }
            )
        # 2. High null percentage (> 40%)
        elif null_pct >= 40.0:
            warnings.append(
                {
                    "severity": "warning",
                    "code": "HIGH_NULL_PERCENTAGE",
                    "column": orig_col,
                    "message": f"Column '{orig_col}' has {null_pct}% missing values ({null_count:,} rows).",
                    "affected_rows": null_count,
                }
            )

        # 3. Constant column (single value across all rows)
        if total_rows > 1 and unique_count == 1 and null_count == 0:
            warnings.append(
                {
                    "severity": "info",
                    "code": "CONSTANT_COLUMN",
                    "column": orig_col,
                    "message": f"Column '{orig_col}' contains only a single distinct value across all rows.",
                    "affected_rows": total_rows,
                }
            )

    # 4. Table-level: Duplicate rows check
    if total_rows <= 100_000:
        try:
            dup_count = int(df.is_duplicated().sum())
            if dup_count > 0:
                warnings.append(
                    {
                        "severity": "warning",
                        "code": "DUPLICATE_ROWS",
                        "column": None,
                        "message": f"Dataset contains {dup_count:,} duplicate rows.",
                        "affected_rows": dup_count,
                    }
                )
        except Exception:
            pass

    return warnings
