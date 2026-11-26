"""Column name sanitization, deduplication, and physical name generation."""

from __future__ import annotations

import re
from dataclasses import dataclass

import polars as pl


@dataclass
class ColumnMapping:
    """Mapping between original display column name and sanitized physical name."""

    original_name: str
    physical_name: str
    ordinal_position: int


def sanitize_column_name(name: str, index: int) -> str:
    """Generate a clean, SQL-friendly physical column name."""
    if not name or not name.strip():
        return f"col_{index}"

    cleaned = name.strip().lower()
    # Replace any sequence of non-alphanumeric chars with underscore
    cleaned = re.sub(r"[^\w]+", "_", cleaned)
    cleaned = cleaned.strip("_")

    if not cleaned:
        return f"col_{index}"

    # If starts with a digit, prefix with col_
    if cleaned[0].isdigit():
        cleaned = f"col_{cleaned}"

    # Truncate length
    return cleaned[:100]


def normalize_columns(columns: list[str]) -> list[ColumnMapping]:
    """Generate unique physical names for all columns, handling duplicates and empties."""
    mappings: list[ColumnMapping] = []
    seen_physical_names: dict[str, int] = {}

    for idx, raw_col in enumerate(columns, start=1):
        original_name = str(raw_col) if raw_col is not None else f"Column_{idx}"
        base_physical = sanitize_column_name(original_name, idx)

        if base_physical not in seen_physical_names:
            seen_physical_names[base_physical] = 1
            final_physical = base_physical
        else:
            seen_physical_names[base_physical] += 1
            final_physical = f"{base_physical}_{seen_physical_names[base_physical]}"

        mappings.append(
            ColumnMapping(
                original_name=original_name,
                physical_name=final_physical,
                ordinal_position=idx,
            )
        )

    return mappings


def apply_column_normalization(df: pl.DataFrame) -> tuple[pl.DataFrame, list[ColumnMapping]]:
    """Rename DataFrame columns to physical names and return mapping."""
    mappings = normalize_columns(df.columns)
    rename_map = {m.original_name: m.physical_name for m in mappings}
    # Note: if df had duplicate column names initially, polars may have disambiguated them
    if len(rename_map) == len(df.columns):
        df_renamed = df.rename(rename_map)
    else:
        # Assign directly by position
        df_renamed = df.clone()
        df_renamed.columns = [m.physical_name for m in mappings]

    return df_renamed, mappings
