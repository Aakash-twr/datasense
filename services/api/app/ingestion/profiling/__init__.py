"""Profiling package exports."""

from app.ingestion.profiling.data_quality import detect_data_quality_issues
from app.ingestion.profiling.pii_detection import detect_pii_for_column, detect_table_pii
from app.ingestion.profiling.schema_inference import (
    InferredColumnSchema,
    infer_table_schema,
    map_polars_type_to_canonical,
)
from app.ingestion.profiling.statistics import (
    profile_column_statistics,
    profile_table_statistics,
)

__all__ = [
    "InferredColumnSchema",
    "detect_data_quality_issues",
    "detect_pii_for_column",
    "detect_table_pii",
    "infer_table_schema",
    "map_polars_type_to_canonical",
    "profile_column_statistics",
    "profile_table_statistics",
]
