"""Typed shared LangGraph state definition with bounded metadata and reducers."""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


def _merge_dicts(left: dict[str, Any] | None, right: dict[str, Any] | None) -> dict[str, Any]:
    """Reducer merging dictionaries safely across parallel branches."""
    merged = dict(left or {})
    if right:
        merged.update(right)
    return merged


class AnalyticsGraphState(TypedDict, total=False):
    """Shared state passed through the LangGraph StateGraph.

    SECURITY INVARIANT:
    - Never store raw dataset files, raw CSV/Parquet rows, API keys, or DB URLs here.
    - Store only compact metadata, version snapshots, hashes, artifact IDs, and bounded summaries.
    """

    # Identity & Scope
    run_id: str
    thread_id: str
    conversation_id: str | None
    organization_id: str
    project_id: str
    user_id: str
    user_request: str
    requested_mode: str | None
    share_aggregate_summaries: bool

    # Authorized Metadata Context (no raw rows)
    selected_dataset_ids: list[str]
    dataset_version_snapshot: dict[str, str]
    allowed_tables: list[str]
    schema_context: str
    catalog_summary: list[dict[str, Any]]

    # Supervisor & Planning
    workflow_type: str
    planned_tasks: list[dict[str, Any]]
    selected_agents: list[str]
    plan_rationale: str
    requires_sql: bool

    # Execution & Limit Tracking
    step_count: Annotated[int, operator.add]
    llm_calls_count: Annotated[int, operator.add]
    sql_queries_count: int
    token_usage: Annotated[dict[str, Any], _merge_dicts]
    agent_statuses: Annotated[dict[str, str], _merge_dicts]
    step_logs: Annotated[list[dict[str, Any]], operator.add]
    warnings: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]

    # Specialized Agent Outputs (compact JSON-serializable dicts)
    discovery_output: dict[str, Any] | None
    quality_output: dict[str, Any] | None
    sql_drafts: list[dict[str, Any]]
    validation_passed: bool
    validation_errors: list[str]

    # Human-in-the-Loop Approval Gate
    approval_required: bool
    approval_status: str  # pending | approved | rejected | not_required
    approval_hash: str | None
    approved_query_indices: list[int]
    approval_comment: str | None

    # Approved Execution & Evidence References
    executed_queries: list[dict[str, Any]]
    result_artifact_ids: list[str]
    evidence_records: Annotated[list[dict[str, Any]], operator.add]

    # Downstream Analytical Outputs
    statistical_output: dict[str, Any] | None
    visualization_output: dict[str, Any] | None
    insight_output: dict[str, Any] | None
    report_output: dict[str, Any] | None
    report_markdown: str | None
    final_status: str
