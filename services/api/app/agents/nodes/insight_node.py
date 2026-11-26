"""Insight Agent node synthesizing evidence-backed observations and labeled hypotheses."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.prompts import INSIGHT_PROMPT
from app.agents.schemas import InsightFinding, InsightOutput
from app.agents.services.result_artifact_service import ResultArtifactService
from app.agents.state import AnalyticsGraphState
from app.ai.llm_factory import LLMFactory
from app.core.config import settings

logger = logging.getLogger(__name__)


def _deterministic_insights(state: AnalyticsGraphState) -> InsightOutput:
    """Builds evidence-backed insights strictly from computed statistics, quality findings, and discovery."""
    findings: list[InsightFinding] = []
    hypotheses: list[InsightFinding] = []

    stats = state.get("statistical_output") or {}
    quality = state.get("quality_output") or {}
    discovery = state.get("discovery_output") or {}
    executed = state.get("executed_queries") or []

    # 1. Statistical findings
    for metric in (stats.get("metrics") or [])[:4]:
        summary_parts = [f"Total count: {metric.get('count', 0)}"]
        if metric.get("sum_value") is not None:
            summary_parts.append(f"sum={metric['sum_value']:,.2f}")
        if metric.get("mean") is not None:
            summary_parts.append(f"mean={metric['mean']:,.2f}")
        if metric.get("median") is not None:
            summary_parts.append(f"median={metric['median']:,.2f}")
        if metric.get("period_comparison"):
            summary_parts.append(metric["period_comparison"])

        findings.append(
            InsightFinding(
                title=f"Metric Summary: {metric.get('metric_name')}",
                finding_type="evidence_backed",
                summary=", ".join(summary_parts) + ".",
                evidence_references=[str(metric.get("evidence_reference", ""))],
            )
        )

    for rank in (stats.get("rankings") or [])[:2]:
        top_items = rank.get("top_items") or []
        if top_items:
            leader = top_items[0]
            share_txt = f" ({leader['share_pct']}% share)" if leader.get("share_pct") is not None else ""
            findings.append(
                InsightFinding(
                    title=f"Top Performer in {rank.get('dimension')}",
                    finding_type="evidence_backed",
                    summary=f"'{leader['label']}' leads {rank.get('metric')} at {leader['value']:,.2f}{share_txt}.",
                    evidence_references=[str(rank.get("evidence_reference", ""))],
                )
            )

    for anomaly in (stats.get("anomalies") or [])[:3]:
        findings.append(
            InsightFinding(
                title=f"Statistical Outlier on {anomaly.get('metric_name')}",
                finding_type="evidence_backed",
                summary=str(anomaly.get("note", "")),
                evidence_references=[str(anomaly.get("evidence_reference", ""))],
                recommended_follow_up=f"Inspect records corresponding to '{anomaly.get('label')}' to confirm root cause.",
            )
        )
        hypotheses.append(
            InsightFinding(
                title=f"Possible Driver for '{anomaly.get('label')}' Deviation",
                finding_type="hypothesis",
                summary=(
                    f"Hypothesis (unverified): The deviation on {anomaly.get('metric_name')} at '{anomaly.get('label')}' "
                    "may reflect seasonal demand, promotional events, or upstream data capture changes; further segmentation is required."
                ),
                evidence_references=[str(anomaly.get("evidence_reference", ""))],
            )
        )

    # 2. Data quality findings
    for qf in (quality.get("findings") or [])[:3]:
        if qf.get("severity") in ("high", "medium"):
            findings.append(
                InsightFinding(
                    title=f"Data Quality Alert: {qf.get('title')}",
                    finding_type="evidence_backed",
                    summary=f"{qf.get('description')} (Evidence: {qf.get('evidence')})",
                    evidence_references=[f"table:{qf.get('affected_table')}"],
                    recommended_follow_up=qf.get("recommended_action"),
                )
            )

    if not findings and discovery.get("relevant_tables"):
        tbl_count = len(discovery["relevant_tables"])
        findings.append(
            InsightFinding(
                title="Schema Discovery Overview",
                finding_type="evidence_backed",
                summary=f"Analyzed {tbl_count} authorized table(s). {discovery.get('sufficiency_reason', '')}",
                evidence_references=[
                    f"dataset_version:{v}" for v in (state.get("dataset_version_snapshot") or {}).values()
                ][:3],
            )
        )

    takeaway = (
        f"Completed analysis across {len(executed)} approved query execution(s) with "
        f"{len(findings)} evidence-backed finding(s) and {len(hypotheses)} labeled hypothesis/hypotheses."
        if executed
        else quality.get("summary") or discovery.get("sufficiency_reason") or "Metadata analysis completed."
    )

    return InsightOutput(
        executive_takeaway=takeaway,
        findings=findings,
        hypotheses=hypotheses,
        follow_up_questions=[
            "Break down the primary metric over time by category or region.",
            "Investigate records contributing to the top or outlier segments.",
        ],
    )


def insight_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Insight Agent: synthesizes findings while strictly protecting raw rows unless aggregate consent is granted."""
    started = datetime.now(UTC)
    share_aggregates = bool(state.get("share_aggregate_summaries", False))
    llm_used = 0

    # Prepare strict, privacy-preserving summary payload for Gemini
    prompt_context: dict[str, Any] = {
        "user_request": state["user_request"],
        "workflow_type": state.get("workflow_type"),
        "discovery": state.get("discovery_output"),
        "data_quality": state.get("quality_output"),
        "executed_query_metadata": [
            {
                "query_run_id": q.get("query_run_id"),
                "title": q.get("title"),
                "row_count": q.get("row_count"),
                "columns": q.get("columns"),
            }
            for q in (state.get("executed_queries") or [])
            if q.get("status") == "success"
        ],
    }

    if share_aggregates:
        artifact_svc = ResultArtifactService()
        aggregate_samples: list[dict[str, Any]] = []
        for art_id in (state.get("result_artifact_ids") or [])[:3]:
            try:
                art = artifact_svc.get_artifact(
                    art_id,
                    organization_id=state["organization_id"],
                    project_id=state["project_id"],
                    user_id=state["user_id"],
                )
                aggregate_samples.append(artifact_svc.build_sanitized_aggregate_summary(art, max_rows=8))
            except Exception:
                continue
        prompt_context["statistical_summary"] = state.get("statistical_output")
        prompt_context["consented_aggregate_summaries"] = aggregate_samples
    else:
        stats = state.get("statistical_output") or {}
        prompt_context["statistical_metadata_only"] = {
            "metrics_computed": [m.get("metric_name") for m in (stats.get("metrics") or [])],
            "anomalies_count": len(stats.get("anomalies") or []),
            "correlations_count": len(stats.get("correlations") or []),
        }
        prompt_context["aggregate_sharing_consent"] = (
            "OFF: Aggregate result numbers are withheld by privacy setting. "
            "Provide qualitative insights and follow-up suggestions without inventing numerical figures."
        )

    insight_output: InsightOutput | None = None
    if state.get("llm_calls_count", 0) < settings.agent_max_llm_calls:
        try:
            model = LLMFactory.get_model(temperature=0.1)
            structured = model.with_structured_output(InsightOutput)
            messages = [
                SystemMessage(content=INSIGHT_PROMPT),
                HumanMessage(
                    content=(
                        "Synthesize evidence-backed insights from this verified workflow state:\n\n"
                        + json.dumps(prompt_context, default=str)[:8000]
                    )
                ),
            ]
            insight_output = structured.invoke(messages)
            llm_used = 1
        except Exception as exc:
            logger.info("Insight Agent using deterministic evidence synthesis fallback (%s)", exc)

    if insight_output is None:
        insight_output = _deterministic_insights(state)

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "insight_output": insight_output.model_dump(),
        "step_count": 1,
        "llm_calls_count": llm_used,
        "agent_statuses": {"insight": "completed"},
        "step_logs": [
            {
                "agent_name": "Insight Agent",
                "step_name": "Evidence-Backed Insight Synthesis",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"aggregate_sharing_consented": share_aggregates},
                "output_summary": {
                    "findings_count": len(insight_output.findings),
                    "hypotheses_count": len(insight_output.hypotheses),
                },
            }
        ],
    }
