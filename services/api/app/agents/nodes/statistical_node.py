"""Statistical Analyst Agent node performing deterministic Polars/DuckDB computations."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.agents.services.result_artifact_service import ResultArtifactService
from app.agents.services.statistical_service import StatisticalService
from app.agents.state import AnalyticsGraphState

logger = logging.getLogger(__name__)


def statistical_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Computes deterministic statistical summaries, growth rates, rankings, and outlier indicators."""
    started = datetime.now(UTC)
    artifact_ids = state.get("result_artifact_ids") or []
    artifact_svc = ResultArtifactService()

    artifacts: list[dict[str, Any]] = []
    for art_id in artifact_ids:
        try:
            art = artifact_svc.get_artifact(
                art_id,
                organization_id=state["organization_id"],
                project_id=state["project_id"],
                user_id=state["user_id"],
            )
            artifacts.append(art)
        except Exception as exc:
            logger.warning("Could not load artifact %s for statistical analysis: %s", art_id, exc)

    stats_output = StatisticalService.analyze_artifacts(artifacts)

    evidence = [
        {
            "evidence_type": "statistical_computation",
            "evidence_reference": f"polars_stats:{state['run_id']}",
            "description": stats_output.summary,
        }
    ] if stats_output.metrics or stats_output.anomalies else []

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "statistical_output": stats_output.model_dump(),
        "step_count": 1,
        "evidence_records": evidence,
        "agent_statuses": {"statistical": "completed" if artifacts else "skipped"},
        "step_logs": [
            {
                "agent_name": "Statistical Analyst",
                "step_name": "Deterministic Statistical Computation",
                "status": "completed" if artifacts else "skipped",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"artifacts_analyzed": len(artifacts)},
                "output_summary": {
                    "metrics_computed": len(stats_output.metrics),
                    "anomalies_detected": len(stats_output.anomalies),
                    "correlations_computed": len(stats_output.correlations),
                },
            }
        ],
    }
