"""Visualization Agent node generating structured chart specifications from approved results."""

from __future__ import annotations

import contextlib
import logging
from datetime import UTC, datetime
from typing import Any

from app.agents.schemas import VisualizationOutput, VisualizationSpec
from app.agents.services.result_artifact_service import ResultArtifactService
from app.agents.state import AnalyticsGraphState
from app.models.agent_run import AgentWorkflowType

logger = logging.getLogger(__name__)

NUMERIC_TYPE_HINTS = ("INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL", "BIGINT", "SMALLINT")
DATE_HINTS = ("DATE", "TIME", "TIMESTAMP")


def visualization_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Creates structured Recharts specifications strictly from real executed query artifacts."""
    started = datetime.now(UTC)
    executed_queries = state.get("executed_queries") or []
    wf_type = state.get("workflow_type", AgentWorkflowType.DEEP_ANALYSIS)
    artifact_svc = ResultArtifactService()

    charts: list[VisualizationSpec] = []
    notes: list[str] = []

    for idx, q in enumerate(executed_queries):
        if q.get("status") != "success":
            continue
        art_id = q.get("artifact_id")
        if not art_id:
            continue

        try:
            artifact = artifact_svc.get_artifact(
                art_id,
                organization_id=state["organization_id"],
                project_id=state["project_id"],
                user_id=state["user_id"],
            )
        except Exception as exc:
            notes.append(f"Skipped chart for Query #{idx + 1}: artifact unavailable ({exc}).")
            continue

        columns = artifact.get("columns", [])
        rows = artifact.get("rows", [])
        if not columns or not rows:
            notes.append(f"Query '{q.get('title', idx + 1)}' returned no rows to visualize.")
            continue

        col_names = [str(c.get("name", "")) for c in columns]
        numeric_cols: list[str] = []
        date_cols: list[str] = []
        dim_cols: list[str] = []

        for c in columns:
            cname = str(c.get("name", ""))
            ctype = str(c.get("type", "")).upper()
            if any(h in ctype for h in DATE_HINTS) or "period" in cname.lower() or "month" in cname.lower() or "date" in cname.lower():
                date_cols.append(cname)
            elif any(h in ctype for h in NUMERIC_TYPE_HINTS):
                numeric_cols.append(cname)
            else:
                dim_cols.append(cname)

        if not numeric_cols:
            notes.append(f"Query '{q.get('title', idx + 1)}' contains no numeric measures suitable for charting.")
            continue

        # Convert bounded preview rows to dict records for Recharts
        data_preview: list[dict[str, Any]] = []
        for row in rows[:50]:
            item: dict[str, Any] = {}
            for c_idx, cname in enumerate(col_names):
                val = row[c_idx] if c_idx < len(row) else None
                if cname in numeric_cols and val is not None and not isinstance(val, bool):
                    with contextlib.suppress(ValueError, TypeError):
                        val = float(val)
                item[cname] = val
            data_preview.append(item)

        y_col = numeric_cols[0]
        if date_cols:
            x_col = date_cols[0]
            chart_type = "area" if wf_type == AgentWorkflowType.TREND_ANALYSIS else "line"
        elif len(numeric_cols) >= 2 and not dim_cols:
            x_col = numeric_cols[0]
            y_col = numeric_cols[1]
            chart_type = "scatter"
        elif dim_cols:
            x_col = dim_cols[0]
            chart_type = "pie" if (len(rows) <= 6 and "share" in q.get("title", "").lower()) else "bar"
        else:
            x_col = col_names[0]
            chart_type = "histogram" if len(rows) > 5 else "bar"

        charts.append(
            VisualizationSpec(
                chart_id=f"chart_{idx + 1}",
                title=q.get("title") or f"{y_col} by {x_col}",
                chart_type=chart_type,  # type: ignore[arg-type]
                x_axis=x_col,
                y_axis=y_col,
                x_label=x_col.replace("_", " ").title(),
                y_label=y_col.replace("_", " ").title(),
                description=f"Generated from approved Query #{q.get('query_index', idx) + 1} ({len(rows)} rows).",
                artifact_id=art_id,
                query_run_id=q.get("query_run_id"),
                columns=columns,
                data_preview=data_preview,
            )
        )

    if not charts and not notes:
        notes.append("No approved query execution data was available to generate visualizations.")

    output = VisualizationOutput(charts=charts, notes=notes)
    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "visualization_output": output.model_dump(),
        "step_count": 1,
        "agent_statuses": {"visualization": "completed" if charts else "skipped"},
        "step_logs": [
            {
                "agent_name": "Visualization Agent",
                "step_name": "Chart Specification Generation",
                "status": "completed" if charts else "skipped",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "output_summary": {"charts_generated": len(charts), "notes": notes},
            }
        ],
    }
