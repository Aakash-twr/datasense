"""Tests for parsers, normalization, schema inference, statistics, quality, and PII detection."""

from __future__ import annotations

from pathlib import Path

import polars as pl

from app.ingestion.normalization.column_normalizer import (
    apply_column_normalization,
    normalize_columns,
    sanitize_column_name,
)
from app.ingestion.parsers.csv_parser import CSVParser
from app.ingestion.parsers.json_parser import JSONParser
from app.ingestion.parsers.parquet_parser import ParquetParser
from app.ingestion.profiling.data_quality import detect_data_quality_issues
from app.ingestion.profiling.pii_detection import detect_pii_for_column
from app.ingestion.profiling.schema_inference import infer_table_schema
from app.ingestion.profiling.statistics import (
    profile_column_statistics,
    profile_table_statistics,
)


def test_sanitize_column_name() -> None:
    """Column names should be sanitized, lowercase, with safe physical identifiers."""
    assert sanitize_column_name("Total Sales ($)", 1) == "total_sales"
    assert sanitize_column_name("2024 Revenue", 2) == "col_2024_revenue"
    assert sanitize_column_name("", 3) == "col_3"
    assert sanitize_column_name("   Customer   Name   ", 4) == "customer_name"


def test_normalize_duplicate_columns() -> None:
    """Duplicate column names should receive numeric disambiguation suffixes."""
    raw_cols = ["amount", "Amount", "AMOUNT", "date"]
    mappings = normalize_columns(raw_cols)

    physical_names = [m.physical_name for m in mappings]
    assert physical_names == ["amount", "amount_2", "amount_3", "date"]
    assert len(set(physical_names)) == 4


def test_csv_parser(tmp_path: Path) -> None:
    """CSV parser should read comma and semicolon delimited files."""
    csv_file = tmp_path / "orders.csv"
    csv_file.write_text(
        "order_id,customer,amount,order_date\n1,Alice,49.99,2024-01-15\n2,Bob,99.50,2024-01-16\n",
        encoding="utf-8",
    )
    parser = CSVParser()
    tables = parser.parse(csv_file)

    assert len(tables) == 1
    df = tables[0].df
    assert df.height == 2
    assert "order_id" in df.columns
    assert "customer" in df.columns


def test_json_parser_array_and_ndjson(tmp_path: Path) -> None:
    """JSON parser should read both JSON arrays and NDJSON lines."""
    parser = JSONParser()

    # Array
    array_file = tmp_path / "data.json"
    array_file.write_text('[{"id": 1, "name": "Item A"}, {"id": 2, "name": "Item B"}]', encoding="utf-8")
    tables = parser.parse(array_file)
    assert len(tables) == 1
    assert tables[0].df.height == 2

    # NDJSON
    ndjson_file = tmp_path / "lines.ndjson"
    ndjson_file.write_text('{"id": 1, "score": 95}\n{"id": 2, "score": 88}\n', encoding="utf-8")
    tables_nd = parser.parse(ndjson_file)
    assert len(tables_nd) == 1
    assert tables_nd[0].df.height == 2


def test_parquet_parser(tmp_path: Path) -> None:
    """Parquet parser should read Parquet files directly."""
    parquet_file = tmp_path / "sample.parquet"
    df_src = pl.DataFrame({"x": [10, 20, 30], "y": ["a", "b", "c"]})
    df_src.write_parquet(parquet_file)

    parser = ParquetParser()
    tables = parser.parse(parquet_file)
    assert len(tables) == 1
    assert tables[0].df.height == 3
    assert tables[0].df.columns == ["x", "y"]


def test_schema_inference_and_normalization() -> None:
    """Schema inference should correctly map Polars dtypes to canonical DataSense types."""
    df = pl.DataFrame({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", None],
        "score": [98.5, 87.2, 91.0],
        "active": [True, False, True],
    })
    norm_df, mappings = apply_column_normalization(df)
    col_map = {m.physical_name: m.original_name for m in mappings}
    schemas = infer_table_schema(norm_df, col_map)

    types_by_col = {s.physical_name: s.canonical_type for s in schemas}
    assert types_by_col["id"] == "integer"
    assert types_by_col["name"] == "string"
    assert types_by_col["score"] == "float"
    assert types_by_col["active"] == "boolean"

    nullable_by_col = {s.physical_name: s.nullable for s in schemas}
    assert nullable_by_col["name"] is True


def test_statistical_profiling() -> None:
    """Statistical profiling should compute accurate metrics for numerical and categorical data."""
    df = pl.DataFrame({
        "num": [10, 20, 30, 40, 50],
        "cat": ["A", "B", "A", "A", "C"],
    })
    num_stats = profile_column_statistics(df["num"], "integer", df.height)
    assert num_stats["min"] == 10
    assert num_stats["max"] == 50
    assert num_stats["mean"] == 30.0
    assert num_stats["median"] == 30.0
    assert num_stats["null_count"] == 0

    cat_stats = profile_column_statistics(df["cat"], "string", df.height)
    assert cat_stats["unique_count"] == 3
    assert cat_stats["top_values"][0]["value"] == "A"
    assert cat_stats["top_values"][0]["count"] == 3

    table_stats = profile_table_statistics(df)
    assert table_stats["total_rows"] == 5
    assert table_stats["total_columns"] == 2
    assert table_stats["total_missing_cells"] == 0


def test_data_quality_detection() -> None:
    """Data quality detection should identify empty columns and high null percentages."""
    df = pl.DataFrame({
        "normal": [1, 2, 3, 4, 5],
        "mostly_null": [None, None, None, 4, None],  # 80% null
        "all_null": [None, None, None, None, None],  # 100% null
        "constant": ["X", "X", "X", "X", "X"],
    })
    col_stats = {
        col: profile_column_statistics(df[col], "string", df.height)
        for col in df.columns
    }
    col_mappings = {col: col for col in df.columns}
    warnings = detect_data_quality_issues(df, col_stats, col_mappings)

    codes = [w["code"] for w in warnings]
    assert "EMPTY_COLUMN" in codes
    assert "HIGH_NULL_PERCENTAGE" in codes
    assert "CONSTANT_COLUMN" in codes


def test_pii_detection() -> None:
    """PII detection should identify email and phone columns from names and samples."""
    email_series = pl.Series("email_address", ["test@example.com", "user@company.org"])
    cat, conf = detect_pii_for_column(email_series, "customer_email", "string")
    assert cat == "email"
    assert conf is not None and conf >= 0.9

    phone_series = pl.Series("mobile", ["+1-555-123-4567", "555-987-6543"])
    cat, conf = detect_pii_for_column(phone_series, "phone_number", "string")
    assert cat == "phone"
    assert conf is not None and conf >= 0.8
