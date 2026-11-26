"""SQL Analyst Agent node reusing Phase 5 SQLGenerationService."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.agents.schemas import SQLDraftItem
from app.agents.state import AnalyticsGraphState
from app.ai.services.sql_generation_service import SQLGenerationService
from app.core.config import settings
from app.models.agent_run import AgentWorkflowType

logger = logging.getLogger(__name__)


def _deterministic_sql_fallback(state: AnalyticsGraphState) -> list[SQLDraftItem]:
    """Builds safe DuckDB SQL drafts from authorized catalog metadata if LLM is offline."""
    catalog_summary = state.get("catalog_summary") or []
    wf_type = state.get("workflow_type", AgentWorkflowType.DEEP_ANALYSIS)
    drafts: list[SQLDraftItem] = []

    if not catalog_summary:
        return drafts

    for ds in catalog_summary[:2]:
        ds_name = ds["dataset_name"]
        for tbl in ds.get("tables", [])[:1]:
            qname = tbl.get("qualified_name") or tbl["table_name"]
            cols = tbl.get("columns", [])
            numeric_cols = [
                c["name"]
                for c in cols
                if str(c.get("canonical_type", "")).lower() in ("integer", "float", "currency", "numeric", "decimal")
                and not c["name"].lower().endswith("_id")
                and c["name"].lower() != "id"
            ]
            date_cols = [
                c["name"]
                for c in cols
                if "date" in str(c.get("canonical_type", "")).lower() or "date" in c["name"].lower()
            ]
            dim_cols = [
                c["name"]
                for c in cols
                if c["name"] not in numeric_cols
                and c["name"] not in date_cols
                and not c.get("is_sensitive")
                and not c["name"].lower().endswith("_id")
                and c["name"].lower() != "id"
            ]

            idx = len(drafts)
            if idx >= settings.agent_max_sql_queries:
                break

            if wf_type == AgentWorkflowType.TREND_ANALYSIS and date_cols and numeric_cols:
                d_col, m_col = date_cols[0], numeric_cols[0]
                sql = (
                    f"SELECT date_trunc('month', CAST({d_col} AS TIMESTAMP)) AS period, "
                    f"COUNT(*) AS record_count, SUM({m_col}) AS total_{m_col}, AVG({m_col}) AS avg_{m_col} "
                    f"FROM {qname} WHERE {d_col} IS NOT NULL GROUP BY 1 ORDER BY 1 ASC"
                )
                drafts.append(
                    SQLDraftItem(
                        query_index=idx,
                        title=f"Monthly Trend for {m_col}",
                        purpose=f"Analyze monthly aggregation and average of {m_col} over {d_col}.",
                        sql=sql,
                        tables_referenced=[qname],
                        datasets_involved=[ds_name],
                        explanation=f"Groups rows by month of {d_col} and calculates count, sum, and average of {m_col}.",
                    )
                )
            elif dim_cols and numeric_cols:
                dim, m_col = dim_cols[0], numeric_cols[0]
                sql = (
                    f"SELECT {dim}, COUNT(*) AS record_count, SUM({m_col}) AS total_{m_col}, "
                    f"AVG({m_col}) AS avg_{m_col} FROM {qname} GROUP BY {dim} "
                    f"ORDER BY total_{m_col} DESC LIMIT 20"
                )
                drafts.append(
                    SQLDraftItem(
                        query_index=idx,
                        title=f"Breakdown of {m_col} by {dim}",
                        purpose=f"Aggregate {m_col} across {dim} segments to identify top and bottom performers.",
                        sql=sql,
                        tables_referenced=[qname],
                        datasets_involved=[ds_name],
                        explanation=f"Summarizes volume, total, and average {m_col} grouped by {dim}.",
                    )
                )
            else:
                sql = f"SELECT COUNT(*) AS total_rows FROM {qname}"
                drafts.append(
                    SQLDraftItem(
                        query_index=idx,
                        title=f"Row Summary for {tbl['table_name']}",
                        purpose=f"Count total rows in {qname}.",
                        sql=sql,
                        tables_referenced=[qname],
                        datasets_involved=[ds_name],
                        explanation=f"Counts records in {qname}.",
                    )
                )

    return drafts


def sql_analyst_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """SQL Analyst Agent: reuses Phase 5 SQLGenerationService to generate validated DuckDB drafts."""
    started = datetime.now(UTC)
    user_request = state["user_request"]
    schema_context = state.get("schema_context", "")
    allowed_tables = state.get("allowed_tables") or []
    catalog_summary = state.get("catalog_summary") or []
    wf_type = state.get("workflow_type", AgentWorkflowType.DEEP_ANALYSIS)
    llm_used = 0
    warnings: list[str] = []

    if not allowed_tables:
        completed = datetime.now(UTC)
        return {
            "sql_drafts": [],
            "step_count": 1,
            "warnings": ["No authorized tables found for SQL generation."],
            "agent_statuses": {"sql_analyst": "skipped"},
            "step_logs": [
                {
                    "agent_name": "SQL Analyst",
                    "step_name": "SQL Query Formulation",
                    "status": "skipped",
                    "started_at": started.isoformat(),
                    "completed_at": completed.isoformat(),
                    "duration_ms": 0.0,
                    "output_summary": {"reason": "No authorized tables in scope"},
                }
            ],
        }

    sql_service = SQLGenerationService()
    drafts: list[SQLDraftItem] = []
    max_queries = max(1, min(settings.agent_max_sql_queries, 2 if wf_type in (
        AgentWorkflowType.DEEP_ANALYSIS,
        AgentWorkflowType.COMPARATIVE_ANALYSIS,
        AgentWorkflowType.TREND_ANALYSIS,
        AgentWorkflowType.ANOMALY_INVESTIGATION,
        AgentWorkflowType.REPORT_GENERATION,
    ) else 1))

    dataset_names = [ds["dataset_name"] for ds in catalog_summary]
    current_llm_calls = state.get("llm_calls_count", 0)

    # Primary query generation via Phase 5 SQLGenerationService
    if current_llm_calls < settings.agent_max_llm_calls:
        try:
            ai_resp, val_status = sql_service.generate_analytical_response(
                question=user_request,
                schema_context=schema_context,
                allowed_tables=allowed_tables,
                conversation_history=None,
            )
            llm_used += 1
            if ai_resp.generated_sql and ai_resp.generated_sql.strip():
                drafts.append(
                    SQLDraftItem(
                        query_index=0,
                        title="Primary Analytical Query",
                        purpose=ai_resp.message[:240] if ai_resp.message else user_request[:240],
                        sql=ai_resp.generated_sql.strip(),
                        datasets_involved=dataset_names,
                        validation_status=val_status if val_status in ("valid", "repaired", "invalid") else "valid",
                        explanation=ai_resp.sql_explanation,
                    )
                )
        except Exception as exc:
            logger.warning("SQL Analyst LLM generation fallback triggered: %s", exc)
            warnings.append(f"LLM SQL drafting fell back to schema-driven SQL ({exc}).")

    # Add complementary analytical query for multi-query workflows when budget allows
    if len(drafts) < max_queries:
        fallback_items = _deterministic_sql_fallback(state)
        existing_sqls = {d.sql.strip().lower() for d in drafts}
        for item in fallback_items:
            if len(drafts) >= max_queries:
                break
            if item.sql.strip().lower() not in existing_sqls:
                item.query_index = len(drafts)
                drafts.append(item)
                existing_sqls.add(item.sql.strip().lower())

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "sql_drafts": [d.model_dump() for d in drafts],
        "sql_queries_count": len(drafts),
        "step_count": 1,
        "llm_calls_count": llm_used,
        "warnings": warnings,
        "agent_statuses": {"sql_analyst": "completed"},
        "step_logs": [
            {
                "agent_name": "SQL Analyst",
                "step_name": "DuckDB SQL Formulation",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"workflow_type": wf_type, "max_queries": max_queries},
                "output_summary": {"drafts_generated": len(drafts)},
            }
        ],
    }
