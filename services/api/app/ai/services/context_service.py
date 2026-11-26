"""Dataset schema context service for AI copilot."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from app.analytics.schemas import CatalogResponse

logger = logging.getLogger(__name__)


class ContextService:
    """Extracts safe, bounded schema context from the project catalog for Gemini."""

    def __init__(self, max_tables: int | None = None, max_columns: int | None = None):
        self.max_tables = max_tables or settings.ai_max_schema_tables
        self.max_columns = max_columns or settings.ai_max_schema_columns

    def build_schema_context(
        self,
        catalog: CatalogResponse,
        selected_dataset_ids: list[str] | None = None,
    ) -> str:
        """Constructs a clean, safe text representation of the database schema for the LLM.

        PRIVACY GUARANTEE:
        - NEVER includes raw row values, customer records, or raw file contents.
        - Only sends table names, qualified names, column names, canonical types, and safe stats.
        """
        filtered_datasets = catalog.datasets
        if selected_dataset_ids:
            filtered_datasets = [
                d for d in catalog.datasets if str(d.dataset_id) in selected_dataset_ids
            ]

        if not filtered_datasets:
            return "No datasets selected or available in this project."

        lines: list[str] = [
            "### AUTHORIZED DATABASE SCHEMA (DUCKDB DIALECT)",
            "The following datasets, tables, and columns are available for analytical querying:",
            "",
        ]

        total_tables = 0
        total_columns = 0

        for ds in filtered_datasets:
            if total_tables >= self.max_tables or total_columns >= self.max_columns:
                lines.append("... (Additional tables omitted to keep schema context within safe token bounds)")
                break

            lines.append(f"Dataset: {ds.dataset_name}")
            if ds.schema_name:
                lines.append(f"Schema / Namespace: {ds.schema_name}")

            for tbl in ds.tables:
                if total_tables >= self.max_tables:
                    break

                total_tables += 1
                lines.append(f"\nTable: {tbl.table_name}")
                if tbl.qualified_name and tbl.qualified_name != tbl.table_name:
                    lines.append(f"Qualified Name: {tbl.qualified_name}")
                lines.append(f"Total Rows: {tbl.row_count:,}")
                lines.append("Columns:")

                for col in tbl.columns:
                    if total_columns >= self.max_columns:
                        lines.append("  - ... (Remaining columns truncated for length)")
                        break

                    total_columns += 1
                    nullable_str = "nullable" if col.is_nullable else "not null"
                    pii_str = f" [Sensitive: {col.sensitivity_category}]" if col.sensitivity_category else ""
                    lines.append(f"  - {col.name}: {col.canonical_type} ({nullable_str}){pii_str}")

            lines.append("")

        return "\n".join(lines).strip()

    def get_allowed_tables(
        self,
        catalog: CatalogResponse,
        selected_dataset_ids: list[str] | None = None,
    ) -> list[str]:
        """Returns all valid table and qualified table names in scope for validation."""
        filtered_datasets = catalog.datasets
        if selected_dataset_ids:
            filtered_datasets = [
                d for d in catalog.datasets if str(d.dataset_id) in selected_dataset_ids
            ]

        table_names: set[str] = set()
        for ds in filtered_datasets:
            for tbl in ds.tables:
                table_names.add(tbl.table_name.lower())
                if tbl.qualified_name:
                    table_names.add(tbl.qualified_name.lower())
        return sorted(table_names)
