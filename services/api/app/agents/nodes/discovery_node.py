"""Data Discovery Agent node identifying tables, measures, dimensions, and relationships."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.agents.schemas import (
    CandidateRelationship,
    DataDiscoveryOutput,
    DiscoveredTableSummary,
)
from app.agents.state import AnalyticsGraphState

logger = logging.getLogger(__name__)

NUMERIC_SEMANTIC_TYPES = {"integer", "float", "currency", "percentage", "numeric", "decimal"}
DATE_SEMANTIC_TYPES = {"date", "datetime", "timestamp"}


def discovery_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Inspects authorized catalog metadata to identify tables, measures, dimensions, and joins."""
    started = datetime.now(UTC)
    catalog_summary = state.get("catalog_summary") or []

    relevant_tables: list[DiscoveredTableSummary] = []
    recommended_metrics: list[str] = []
    all_table_cols: list[tuple[str, str, str]] = []  # (qualified_name, col_name, canonical_type)

    for ds in catalog_summary:
        ds_id = ds["dataset_id"]
        ds_name = ds["dataset_name"]
        for tbl in ds.get("tables", []):
            q_name = tbl.get("qualified_name") or tbl["table_name"]
            measures: list[str] = []
            dimensions: list[str] = []
            date_cols: list[str] = []
            pii_cols: list[str] = []

            for col in tbl.get("columns", []):
                cname = col["name"]
                ctype = str(col.get("canonical_type") or col.get("data_type") or "").lower()
                all_table_cols.append((q_name, cname, ctype))

                if col.get("is_sensitive"):
                    pii_cols.append(f"{cname} ({col.get('sensitivity_category') or 'sensitive'})")

                if any(dt in ctype for dt in DATE_SEMANTIC_TYPES) or "date" in cname.lower() or cname.lower().endswith("_at"):
                    date_cols.append(cname)
                elif any(nt in ctype for nt in NUMERIC_SEMANTIC_TYPES) and not cname.lower().endswith("_id") and cname.lower() != "id":
                    measures.append(cname)
                    recommended_metrics.append(f"SUM({cname}), AVG({cname}) on {q_name}")
                else:
                    dimensions.append(cname)

            relevant_tables.append(
                DiscoveredTableSummary(
                    dataset_id=ds_id,
                    dataset_name=ds_name,
                    table_name=tbl["table_name"],
                    qualified_name=q_name,
                    row_count=int(tbl.get("row_count", 0)),
                    measures=measures,
                    dimensions=dimensions,
                    date_columns=date_cols,
                    pii_columns=pii_cols,
                )
            )

    # Identify candidate relationships ONLY via matching explicit key identifiers (*_id / id)
    relationships: list[CandidateRelationship] = []
    seen_pairs: set[tuple[str, str, str, str]] = set()
    for i, (t1, c1, _) in enumerate(all_table_cols):
        if not (c1.lower().endswith("_id") or c1.lower() == "id"):
            continue
        for j, (t2, c2, _) in enumerate(all_table_cols):
            if i >= j or t1 == t2:
                continue
            if c1.lower() == c2.lower() and c1.lower() != "id":
                key = (t1, c1, t2, c2)
                if key not in seen_pairs:
                    seen_pairs.add(key)
                    relationships.append(
                        CandidateRelationship(
                            left_table=t1,
                            left_column=c1,
                            right_table=t2,
                            right_column=c2,
                            relationship_type="inferred",
                            confidence="medium",
                            rationale=f"Both tables share identifier column '{c1}' (inferred join key; verify before joining).",
                        )
                    )

    sufficient = len(relevant_tables) > 0
    reason = (
        f"Discovered {len(relevant_tables)} authorized table(s) across {len(catalog_summary)} dataset(s)."
        if sufficient
        else "No ready datasets available in project scope."
    )

    output = DataDiscoveryOutput(
        sufficient_data=sufficient,
        sufficiency_reason=reason,
        relevant_tables=relevant_tables,
        relationships=relationships[:10],
        recommended_metrics=recommended_metrics[:12],
    )

    evidence = [
        {
            "evidence_type": "catalog_discovery",
            "evidence_reference": f"dataset_version:{ds['version_id']}",
            "dataset_id": ds["dataset_id"],
            "dataset_version_id": ds["version_id"],
            "description": f"Authorized catalog metadata inspected for '{ds['dataset_name']}' (v{ds.get('version_number', 1)}).",
        }
        for ds in catalog_summary
    ]

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "discovery_output": output.model_dump(),
        "step_count": 1,
        "evidence_records": evidence,
        "agent_statuses": {"discovery": "completed"},
        "step_logs": [
            {
                "agent_name": "Data Discovery",
                "step_name": "Schema & Relationship Discovery",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"datasets_in_scope": len(catalog_summary)},
                "output_summary": {
                    "tables_discovered": len(relevant_tables),
                    "candidate_relationships": len(relationships),
                    "sufficient_data": sufficient,
                },
            }
        ],
    }
