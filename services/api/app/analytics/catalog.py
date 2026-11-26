"""Dataset catalog and table registration service for DuckDB analytics."""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.analytics.exceptions import CatalogError, DatasetNotReadyError
from app.analytics.schemas import (
    CatalogDataset,
    CatalogResponse,
    CatalogTable,
    CatalogTableColumn,
)
from app.ingestion.storage import default_storage
from app.models.data_table import DataTable
from app.models.dataset import Dataset, DatasetStatus
from app.models.dataset_version import DatasetVersion


def sanitize_schema_name(name: str) -> str:
    """Converts a human dataset name into a valid, safe SQL schema identifier."""
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", name.strip().lower())
    clean = re.sub(r"_+", "_", clean).strip("_")
    if not clean or clean[0].isdigit():
        clean = f"ds_{clean}"
    return clean[:48]


class CatalogService:
    """Resolves project datasets into structured DuckDB schemas and Parquet table mappings."""

    @staticmethod
    def get_project_catalog(
        session: Session,
        project_id: uuid.UUID,
        dataset_ids: list[uuid.UUID] | None = None,
    ) -> CatalogResponse:
        """Fetches all ready datasets for a project and builds their catalog metadata."""
        query = (
            select(Dataset)
            .where(
                Dataset.project_id == project_id,
                Dataset.status == DatasetStatus.READY,
                Dataset.archived_at.is_(None),
            )
            .order_by(Dataset.created_at.asc())
        )

        if dataset_ids:
            query = query.where(Dataset.id.in_(dataset_ids))

        datasets = list(session.scalars(query).all())

        # Collect unique schema names
        schema_counts: dict[str, int] = {}
        dataset_schemas: dict[uuid.UUID, str] = {}
        for ds in datasets:
            base_schema = sanitize_schema_name(ds.name)
            if base_schema in schema_counts:
                schema_counts[base_schema] += 1
                unique_schema = f"{base_schema}_{str(ds.id)[:6]}"
            else:
                schema_counts[base_schema] = 1
                unique_schema = base_schema
            dataset_schemas[ds.id] = unique_schema

        catalog_datasets: list[CatalogDataset] = []

        for ds in datasets:
            if not ds.active_version_id:
                continue

            # Load active version with tables and columns
            ver_query = (
                select(DatasetVersion)
                .where(DatasetVersion.id == ds.active_version_id)
                .options(
                    selectinload(DatasetVersion.tables).selectinload(DataTable.columns),
                )
            )
            version = session.scalars(ver_query).one_or_none()
            if not version:
                continue

            schema_name = dataset_schemas[ds.id]
            tables: list[CatalogTable] = []

            for tbl in version.tables:
                columns: list[CatalogTableColumn] = []
                for col in sorted(tbl.columns, key=lambda c: c.ordinal_position):
                    columns.append(
                        CatalogTableColumn(
                            name=col.column_name,
                            display_name=col.column_name,
                            data_type=col.data_type,
                            canonical_type=col.semantic_type or col.data_type,
                            is_nullable=col.nullable,
                            is_sensitive=bool(col.pii_category),
                            sensitivity_category=col.pii_category,
                        )
                    )

                tables.append(
                    CatalogTable(
                        table_name=tbl.table_name,
                        schema_name=schema_name,
                        qualified_name=f"{schema_name}.{tbl.table_name}",
                        display_name=tbl.original_table_name or tbl.table_name,
                        row_count=tbl.row_count,
                        column_count=tbl.column_count,
                        columns=columns,
                    )
                )

            catalog_datasets.append(
                CatalogDataset(
                    dataset_id=ds.id,
                    dataset_name=ds.name,
                    schema_name=schema_name,
                    version_id=version.id,
                    version_number=version.version_number,
                    source_format=ds.source_type,
                    tables=tables,
                )
            )

        return CatalogResponse(datasets=catalog_datasets)

    @staticmethod
    def resolve_parquet_tables(
        session: Session,
        project_id: uuid.UUID,
        dataset_ids: list[uuid.UUID] | None = None,
    ) -> dict[str, Any]:
        """Resolves active tables to absolute Parquet file paths for DuckDB registration.

        Returns:
            dict with:
                - "schema_tables": {schema: {table: Path}}
                - "unqualified_tables": {table: Path} (if unique)
                - "catalog_dict": {schema: [tables]}
        """
        catalog_resp = CatalogService.get_project_catalog(
            session=session,
            project_id=project_id,
            dataset_ids=dataset_ids,
        )

        if dataset_ids and not catalog_resp.datasets:
            raise DatasetNotReadyError(
                "None of the selected datasets are in 'ready' status or available for query."
            )

        schema_tables: dict[str, dict[str, Path]] = {}
        table_occurrence: dict[str, list[tuple[str, Path]]] = {}
        catalog_dict: dict[str, list[str]] = {}

        for ds in catalog_resp.datasets:
            ver_query = (
                select(DatasetVersion)
                .where(DatasetVersion.id == ds.version_id)
                .options(selectinload(DatasetVersion.tables))
            )
            version = session.scalars(ver_query).one_or_none()
            if not version:
                continue

            schema_tables.setdefault(ds.schema_name, {})
            catalog_dict.setdefault(ds.schema_name, [])

            for tbl in version.tables:
                try:
                    parquet_path = default_storage.get_file_path(tbl.storage_key)
                except (ValueError, FileNotFoundError) as exc:
                    raise CatalogError(
                        f"Parquet data file for table '{tbl.table_name}' could not be resolved: {exc}"
                    ) from exc

                schema_tables[ds.schema_name][tbl.table_name] = parquet_path
                catalog_dict[ds.schema_name].append(tbl.table_name)
                table_occurrence.setdefault(tbl.table_name, []).append((ds.schema_name, parquet_path))

        # Build unambiguous unqualified table map
        unqualified_tables: dict[str, Path] = {}
        for tbl_name, occurrences in table_occurrence.items():
            if len(occurrences) == 1:
                unqualified_tables[tbl_name] = occurrences[0][1]

        return {
            "schema_tables": schema_tables,
            "unqualified_tables": unqualified_tables,
            "catalog_dict": catalog_dict,
            "catalog_response": catalog_resp,
        }
