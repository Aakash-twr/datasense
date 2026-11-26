"""Canonical schema inference from Polars DataFrames."""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl


@dataclass
class InferredColumnSchema:
    """Inferred schema for a single column."""

    physical_name: str
    original_name: str
    canonical_type: str
    polars_type: str
    ordinal_position: int
    nullable: bool


def map_polars_type_to_canonical(dtype: pl.DataType) -> str:
    """Map Polars data type to canonical DataSense types."""
    if dtype in (
        pl.Int8,
        pl.Int16,
        pl.Int32,
        pl.Int64,
        pl.UInt8,
        pl.UInt16,
        pl.UInt32,
        pl.UInt64,
    ):
        return "integer"
    if dtype in (pl.Float32, pl.Float64):
        return "float"
    if isinstance(dtype, pl.Decimal):
        return "decimal"
    if dtype == pl.Boolean:
        return "boolean"
    if dtype == pl.Date:
        return "date"
    if isinstance(dtype, pl.Datetime) or dtype == pl.Duration:
        return "datetime"
    if dtype == pl.Binary:
        return "binary"
    if dtype in (pl.String, pl.Categorical):
        return "string"
    if isinstance(dtype, (pl.Struct, pl.List, pl.Array)):
        return "json"
    return "unknown"


def infer_table_schema(
    df: pl.DataFrame,
    column_mappings: dict[str, str],  # physical_name -> original_name
) -> list[InferredColumnSchema]:
    """Infer canonical schema for each column in the normalized DataFrame."""
    schemas: list[InferredColumnSchema] = []

    for pos, col_name in enumerate(df.columns, start=1):
        dtype = df.schema[col_name]
        canonical_type = map_polars_type_to_canonical(dtype)
        null_count = df[col_name].null_count()
        nullable = null_count > 0 or df.height == 0
        original_name = column_mappings.get(col_name, col_name)

        schemas.append(
            InferredColumnSchema(
                physical_name=col_name,
                original_name=original_name,
                canonical_type=canonical_type,
                polars_type=str(dtype),
                ordinal_position=pos,
                nullable=nullable,
            )
        )

    return schemas
