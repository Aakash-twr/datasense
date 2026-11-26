"""Report Generation Agent node compiling the structured 11-section report & Markdown."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.agents.schemas import ReportContent
from app.agents.state import AnalyticsGraphState


def _render_markdown(report: ReportContent) -> str:
    """Renders structured ReportContent cleanly to downloadable Markdown."""
    sections: list[str] = [f"# {report.title}\n"]

    sections.append(f"## 1. Executive Summary\n{report.executive_summary}\n")

    if report.datasets_analyzed:
        sections.append("## 2. Datasets Analyzed\n" + "\n".join(f"- {d}" for d in report.datasets_analyzed) + "\n")

    if report.analytical_objectives:
        sections.append("## 3. Analytical Objectives\n" + "\n".join(f"- {o}" for o in report.analytical_objectives) + "\n")

    if report.key_findings:
        sections.append("## 4. Key Findings\n" + "\n".join(f"- {f}" for f in report.key_findings) + "\n")

    if report.statistical_analysis:
        sections.append("## 5. Statistical Analysis\n" + "\n".join(f"- {s}" for s in report.statistical_analysis) + "\n")

    if report.data_quality_observations:
        sections.append("## 6. Data Quality Observations\n" + "\n".join(f"- {q}" for q in report.data_quality_observations) + "\n")

    if report.trends_and_comparisons:
        sections.append("## 7. Trends and Comparisons\n" + "\n".join(f"- {t}" for t in report.trends_and_comparisons) + "\n")

    if report.recommended_visualizations:
        sections.append("## 8. Recommended Visualizations\n" + "\n".join(f"- {v}" for v in report.recommended_visualizations) + "\n")

    if report.business_recommendations:
        sections.append("## 9. Business Recommendations\n" + "\n".join(f"- {r}" for r in report.business_recommendations) + "\n")

    if report.limitations:
        sections.append("## 10. Limitations\n" + "\n".join(f"- {lim}" for lim in report.limitations) + "\n")

    if report.supporting_evidence:
        ev_lines = [
            f"- **{ev.get('evidence_type', 'evidence')}** (`{ev.get('evidence_reference', '')}`): {ev.get('description', '')}"
            for ev in report.supporting_evidence
        ]
        sections.append("## 11. Supporting Queries and Evidence\n" + "\n".join(ev_lines) + "\n")

    return "\n".join(sections).strip() + "\n"


def report_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Compiles completed findings from all agents into an evidence-referenced analytical report."""
    started = datetime.now(UTC)

    catalog = state.get("catalog_summary") or []
    discovery = state.get("discovery_output") or {}
    quality = state.get("quality_output") or {}
    stats = state.get("statistical_output") or {}
    viz = state.get("visualization_output") or {}
    insight = state.get("insight_output") or {}
    evidence_records = state.get("evidence_records") or []
    executed = state.get("executed_queries") or []

    datasets_analyzed = [
        f"{ds['dataset_name']} (v{ds.get('version_number', 1)}, {len(ds.get('tables', []))} table(s))"
        for ds in catalog
    ]

    objectives = [
        state["user_request"],
        state.get("plan_rationale") or f"Workflow mode: {state.get('workflow_type', 'deep_analysis')}",
    ]

    key_findings = [
        f"**{f.get('title')}**: {f.get('summary')} _(Evidence: {', '.join(f.get('evidence_references') or ['catalog'])})_"
        for f in (insight.get("findings") or [])
    ]
    for h in (insight.get("hypotheses") or []):
        key_findings.append(f"**[Hypothesis] {h.get('title')}**: {h.get('summary')}")

    stat_lines: list[str] = []
    for m in (stats.get("metrics") or []):
        parts = [f"n={m.get('count', 0)}"]
        if m.get("sum_value") is not None:
            parts.append(f"sum={m['sum_value']:,.2f}")
        if m.get("mean") is not None:
            parts.append(f"mean={m['mean']:,.2f}")
        if m.get("median") is not None:
            parts.append(f"median={m['median']:,.2f}")
        if m.get("std_dev") is not None:
            parts.append(f"std={m['std_dev']:,.2f}")
        stat_lines.append(f"**{m.get('metric_name')}**: {', '.join(parts)} (`{m.get('evidence_reference')}`)")

    quality_lines = [
        f"[{str(f.get('severity', 'info')).upper()}] **{f.get('title')}** ({f.get('affected_table')}"
        + (f".{f.get('affected_column')}" if f.get("affected_column") else "")
        + f"): {f.get('description')} — _Evidence: {f.get('evidence')}_"
        for f in (quality.get("findings") or [])
    ]

    trend_lines: list[str] = []
    for m in (stats.get("metrics") or []):
        if m.get("period_comparison"):
            trend_lines.append(f"**{m.get('metric_name')}**: {m['period_comparison']} (`{m.get('evidence_reference')}`)")
    for r in (stats.get("rankings") or []):
        tops = ", ".join(f"{it['label']} ({it['value']:,.2f})" for it in (r.get("top_items") or [])[:3])
        if tops:
            trend_lines.append(f"Top **{r.get('dimension')}** by **{r.get('metric')}**: {tops} (`{r.get('evidence_reference')}`)")
    for a in (stats.get("anomalies") or []):
        trend_lines.append(f"Anomaly ({a.get('method')}): {a.get('note')} (`{a.get('evidence_reference')}`)")

    viz_lines = [
        f"**{c.get('title')}** ({str(c.get('chart_type', '')).upper()} chart: X=`{c.get('x_axis')}`, Y=`{c.get('y_axis')}`, source=`query_run:{c.get('query_run_id')}`)"
        for c in (viz.get("charts") or [])
    ]

    recommendations = []
    for f in (insight.get("findings") or []):
        if f.get("recommended_follow_up"):
            recommendations.append(f["recommended_follow_up"])
    for qf in (quality.get("findings") or [])[:3]:
        if qf.get("recommended_action"):
            recommendations.append(f"[{qf.get('affected_table')}] {qf['recommended_action']}")

    limitations = list(state.get("warnings") or [])
    if not executed and state.get("requires_sql"):
        limitations.append("SQL queries were not executed (approval rejected or skipped); numerical query metrics are omitted.")
    if not state.get("share_aggregate_summaries"):
        limitations.append("Raw rows and unconsented aggregates were isolated from Gemini prompts by default privacy rules.")
    if not discovery.get("sufficient_data", True):
        limitations.append(str(discovery.get("sufficiency_reason", "Limited data available in project scope.")))

    ev_dicts = [
        {
            "evidence_type": str(ev.get("evidence_type", "evidence")),
            "evidence_reference": str(ev.get("evidence_reference", "")),
            "description": str(ev.get("description", "")),
        }
        for ev in evidence_records
    ]

    title_snippet = state["user_request"].strip()[:72]
    report = ReportContent(
        title=f"Analysis Report: {title_snippet}",
        executive_summary=insight.get("executive_takeaway") or quality.get("summary") or "Completed multi-agent analytical workflow.",
        datasets_analyzed=datasets_analyzed,
        analytical_objectives=objectives,
        key_findings=key_findings,
        statistical_analysis=stat_lines,
        data_quality_observations=quality_lines,
        trends_and_comparisons=trend_lines,
        recommended_visualizations=viz_lines,
        business_recommendations=list(dict.fromkeys(recommendations))[:8],
        limitations=list(dict.fromkeys(limitations)),
        supporting_evidence=ev_dicts,
    )

    markdown = _render_markdown(report)
    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "report_output": report.model_dump(),
        "report_markdown": markdown,
        "final_status": "completed",
        "step_count": 1,
        "agent_statuses": {"report": "completed"},
        "step_logs": [
            {
                "agent_name": "Report Agent",
                "step_name": "Structured Report Generation",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "output_summary": {
                    "title": report.title,
                    "sections_populated": sum(
                        1
                        for lst in (
                            report.datasets_analyzed,
                            report.key_findings,
                            report.statistical_analysis,
                            report.data_quality_observations,
                            report.trends_and_comparisons,
                            report.recommended_visualizations,
                            report.business_recommendations,
                        )
                        if lst
                    ),
                },
            }
        ],
    }
