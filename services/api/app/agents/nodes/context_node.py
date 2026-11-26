"""Authorized context loading and input validation node."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from app.agents.services.db_context import agent_db_session
from app.agents.state import AnalyticsGraphState
from app.ai.services.context_service import ContextService
from app.analytics.catalog import CatalogService

logger = logging.getLogger(__name__)


def context_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Validates project/dataset scope and loads authorized schema metadata (never raw rows)."""
    started = datetime.now(UTC)
    project_id = uuid.UUID(state["project_id"])
    raw_ds_ids = state.get("selected_dataset_ids") or []
    ds_uuids = [uuid.UUID(d) for d in raw_ds_ids] if raw_ds_ids else None

    with agent_db_session() as db:
        catalog = CatalogService.get_project_catalog(
            session=db,
            project_id=project_id,
            dataset_ids=ds_uuids,
        )

    ctx_service = ContextService()
    resolved_ids = [str(ds.dataset_id) for ds in catalog.datasets]
    schema_context = ctx_service.build_schema_context(catalog, resolved_ids)
    allowed_tables = ctx_service.get_allowed_tables(catalog, resolved_ids)

    version_snapshot = {
        str(ds.dataset_id): str(ds.version_id)
        for ds in catalog.datasets
    }

    catalog_summary: list[dict[str, Any]] = []
    for ds in catalog.datasets:
        ds_entry: dict[str, Any] = {
            "dataset_id": str(ds.dataset_id),
            "dataset_name": ds.dataset_name,
            "schema_name": ds.schema_name,
            "version_id": str(ds.version_id),
            "version_number": ds.version_number,
            "tables": [],
        }
        for tbl in ds.tables:
            ds_entry["tables"].append(
                {
                    "table_name": tbl.table_name,
                    "qualified_name": tbl.qualified_name,
                    "row_count": tbl.row_count,
                    "column_count": tbl.column_count,
                    "columns": [
                        {
                            "name": c.name,
                            "data_type": c.data_type,
                            "canonical_type": c.canonical_type,
                            "is_nullable": c.is_nullable,
                            "is_sensitive": c.is_sensitive,
                            "sensitivity_category": c.sensitivity_category,
                        }
                        for c in tbl.columns
                    ],
                }
            )
        catalog_summary.append(ds_entry)

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    warnings: list[str] = []
    if not catalog.datasets:
        warnings.append("No ready datasets were found in this project scope.")

    return {
        "selected_dataset_ids": resolved_ids,
        "dataset_version_snapshot": version_snapshot,
        "allowed_tables": allowed_tables,
        "schema_context": schema_context,
        "catalog_summary": catalog_summary,
        "step_count": 1,
        "warnings": warnings,
        "agent_statuses": {"context_loader": "completed"},
        "step_logs": [
            {
                "agent_name": "Context Loader",
                "step_name": "Authorized Context Loading",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"requested_datasets": len(raw_ds_ids)},
                "output_summary": {
                    "datasets_resolved": len(resolved_ids),
                    "tables_authorized": len(allowed_tables),
                },
            }
        ],
    }
