"""Data Quality Agent node inspecting Phase 3 profiling metadata without reading raw rows."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.agents.schemas import DataQualityFinding, DataQualityOutput
from app.agents.services.db_context import agent_db_session
from app.agents.state import AnalyticsGraphState
from app.models.data_table import DataTable
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

logger = logging.getLogger(__name__)


def quality_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Evaluates Phase 3 DataTable & DataColumn profiling metadata for data quality findings."""
    started = datetime.now(UTC)
    dataset_ids = state.get("selected_dataset_ids") or []
    ds_uuids = [uuid.UUID(d) for d in dataset_ids]

    findings: list[DataQualityFinding] = []
    evidence: list[dict[str, Any]] = []

    with agent_db_session() as db:
        if ds_uuids:
            datasets = list(
                db.scalars(select(Dataset).where(Dataset.id.in_(ds_uuids))).all()
            )
            for ds in datasets:
                if not ds.active_version_id:
                    continue
                version = db.scalars(
                    select(DatasetVersion)
                    .where(DatasetVersion.id == ds.active_version_id)
                    .options(selectinload(DatasetVersion.tables).selectinload(DataTable.columns))
                ).one_or_none()
                if not version:
                    continue

                # Check quality warnings stored in Phase 3 profile_metadata
                prof_meta = version.profile_metadata if isinstance(version.profile_metadata, dict) else {}
                raw_warnings = prof_meta.get("warnings", [])
                for w in raw_warnings[:10]:
                    if isinstance(w, dict):
                        findings.append(
                            DataQualityFinding(
                                title=str(w.get("title") or w.get("code") or "Ingestion Quality Warning"),
                                description=str(w.get("message") or w.get("description") or "Detected during Phase 3 profiling."),
                                severity=str(w.get("severity", "medium")).lower()
                                if str(w.get("severity", "")).lower() in ("high", "medium", "low", "info")
                                else "medium",
                                affected_table=str(w.get("table", ds.name)),
                                affected_column=w.get("column"),
                                evidence=f"Phase 3 profiling metadata on version {version.version_number}",
                                recommended_action="Review affected column before aggregating or joining.",
                                confidence="high",
                            )
                        )

                for tbl in version.tables:
                    if tbl.row_count == 0:
                        findings.append(
                            DataQualityFinding(
                                title="Empty Table",
                                description=f"Table '{tbl.table_name}' contains 0 rows.",
                                severity="high",
                                affected_table=tbl.table_name,
                                affected_column=None,
                                evidence=f"Profiling row_count = 0 (version v{version.version_number})",
                                recommended_action="Verify source upload or exclude empty table from analysis.",
                                confidence="high",
                            )
                        )
                        continue

                    for col in tbl.columns:
                        null_pct = float(col.null_percentage or 0.0)
                        if null_pct >= 99.9:
                            findings.append(
                                DataQualityFinding(
                                    title="Completely Empty Column",
                                    description=f"Column '{col.column_name}' is 100% null ({col.null_count} of {tbl.row_count} rows).",
                                    severity="high",
                                    affected_table=tbl.table_name,
                                    affected_column=col.column_name,
                                    evidence=f"null_percentage = {null_pct:.1f}%",
                                    recommended_action="Drop or exclude this column from metrics and visualizations.",
                                    confidence="high",
                                )
                            )
                        elif null_pct >= 20.0:
                            findings.append(
                                DataQualityFinding(
                                    title="High Missing Value Rate",
                                    description=f"Column '{col.column_name}' has {null_pct:.1f}% missing values.",
                                    severity="medium",
                                    affected_table=tbl.table_name,
                                    affected_column=col.column_name,
                                    evidence=f"null_count = {col.null_count}, null_percentage = {null_pct:.1f}%",
                                    recommended_action="Handle NULLs explicitly with COALESCE or filter criteria.",
                                    confidence="high",
                                )
                            )

                        if col.unique_count is not None and tbl.row_count > 1 and col.unique_count == 1:
                            findings.append(
                                DataQualityFinding(
                                    title="Constant / Zero-Variance Column",
                                    description=f"Column '{col.column_name}' contains only 1 distinct non-null value across {tbl.row_count} rows.",
                                    severity="low",
                                    affected_table=tbl.table_name,
                                    affected_column=col.column_name,
                                    evidence=f"unique_count = 1 out of {tbl.row_count} rows",
                                    recommended_action="Not useful for segmentation or correlation analysis.",
                                    confidence="high",
                                )
                            )

                        if (
                            (col.column_name.lower() == "id" or col.column_name.lower().endswith("_id"))
                            and col.unique_count is not None
                            and tbl.row_count > 0
                            and col.unique_count < tbl.row_count
                            and col.column_name.lower() == f"{tbl.table_name.rstrip('s')}_id"
                        ):
                            findings.append(
                                DataQualityFinding(
                                    title="Potential Duplicate Key Identifier",
                                    description=(
                                        f"Identifier column '{col.column_name}' has {col.unique_count} unique values "
                                        f"across {tbl.row_count} rows."
                                    ),
                                    severity="medium",
                                    affected_table=tbl.table_name,
                                    affected_column=col.column_name,
                                    evidence=f"unique_count ({col.unique_count}) < row_count ({tbl.row_count})",
                                    recommended_action="Verify primary key uniqueness or aggregate carefully to avoid double-counting.",
                                    confidence="medium",
                                )
                            )

                        if col.pii_category:
                            findings.append(
                                DataQualityFinding(
                                    title="Sensitive / PII Metadata Detected",
                                    description=(
                                        f"Column '{col.column_name}' matches sensitive category '{col.pii_category}'. "
                                        "Avoid projecting raw values in public reports or prompts."
                                    ),
                                    severity="info",
                                    affected_table=tbl.table_name,
                                    affected_column=col.column_name,
                                    evidence=f"pii_category = {col.pii_category} (confidence: {col.pii_confidence or 0:.2f})",
                                    recommended_action="Aggregate or anonymize when reporting.",
                                    confidence="high",
                                )
                            )

                evidence.append(
                    {
                        "evidence_type": "profiling_metadata",
                        "evidence_reference": f"dataset_version:{version.id}",
                        "dataset_id": str(ds.id),
                        "dataset_version_id": str(version.id),
                        "description": f"Deterministic Phase 3 column profiling evaluated for '{ds.name}' (v{version.version_number}).",
                    }
                )

    high_count = sum(1 for f in findings if f.severity == "high")
    med_count = sum(1 for f in findings if f.severity == "medium")
    health = "critical" if high_count > 0 else ("warning" if med_count > 0 else "good")

    output = DataQualityOutput(
        overall_health=health,
        total_issues=len(findings),
        findings=findings,
        summary=(
            f"Evaluated {len(dataset_ids)} dataset(s) using Phase 3 profiling metadata: "
            f"{high_count} high, {med_count} medium, {len(findings) - high_count - med_count} low/info observation(s)."
        ),
    )

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "quality_output": output.model_dump(),
        "step_count": 1,
        "evidence_records": evidence,
        "agent_statuses": {"quality": "completed"},
        "step_logs": [
            {
                "agent_name": "Data Quality",
                "step_name": "Profiling & Quality Audit",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"datasets_audited": len(dataset_ids)},
                "output_summary": {
                    "overall_health": health,
                    "total_findings": len(findings),
                },
            }
        ],
    }
