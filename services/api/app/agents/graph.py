"""LangGraph StateGraph topology, conditional routing, and parallel Send orchestration."""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from app.agents.nodes.approval_node import approval_node
from app.agents.nodes.context_node import context_node
from app.agents.nodes.discovery_node import discovery_node
from app.agents.nodes.execution_node import execution_node
from app.agents.nodes.insight_node import insight_node
from app.agents.nodes.quality_node import quality_node
from app.agents.nodes.report_node import report_node
from app.agents.nodes.sql_analyst_node import sql_analyst_node
from app.agents.nodes.statistical_node import statistical_node
from app.agents.nodes.supervisor_node import supervisor_node
from app.agents.nodes.validation_node import validation_node
from app.agents.nodes.visualization_node import visualization_node
from app.agents.state import AnalyticsGraphState
from app.core.config import settings


def prep_barrier_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Synchronization barrier converging parallel discovery & quality branches."""
    return {"step_count": 1}


def finalize_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Finalizes workflow status cleanly based on approval and error states."""
    approval_status = state.get("approval_status")
    errors = state.get("errors") or []

    if approval_status == "rejected":
        final_status = "rejected"
    elif errors and not state.get("executed_queries") and state.get("requires_sql"):
        final_status = "failed"
    else:
        final_status = "completed"

    return {
        "final_status": final_status,
        "step_count": 1,
    }


def _route_after_supervisor(state: AnalyticsGraphState) -> list[Send] | str:
    """Conditional + parallel Send router dispatching independent metadata agents."""
    if state.get("step_count", 0) >= settings.agent_max_steps:
        return "finalize"

    selected = state.get("selected_agents") or []
    max_parallel = max(1, settings.agent_max_parallel_tasks)
    sends: list[Send] = []

    if "discovery" in selected:
        sends.append(Send("discovery", state))
    if "quality" in selected and len(sends) < max_parallel:
        sends.append(Send("quality", state))

    if sends:
        return sends
    if "sql_analyst" in selected:
        return "sql_analyst"
    if "insight" in selected:
        return "insight"
    if "report" in selected:
        return "report"
    return "finalize"


def _route_after_prep_barrier(state: AnalyticsGraphState) -> str:
    """Routes from parallel metadata prep barrier to sequential quality (if capped), SQL, or insight."""
    if state.get("step_count", 0) >= settings.agent_max_steps:
        return "finalize"

    selected = state.get("selected_agents") or []
    statuses = state.get("agent_statuses") or {}

    # If parallelism was capped to 1, ensure quality still runs if requested
    if "quality" in selected and statuses.get("quality") not in ("completed", "skipped", "failed"):
        return "quality"

    if "sql_analyst" in selected:
        return "sql_analyst"
    if "insight" in selected:
        return "insight"
    if "report" in selected:
        return "report"
    return "finalize"


def _route_after_validation(state: AnalyticsGraphState) -> str:
    """Routes to human approval gate when valid SQL drafts require user review."""
    if state.get("step_count", 0) >= settings.agent_max_steps:
        return "finalize"
    if state.get("approval_required"):
        return "human_approval"
    selected = state.get("selected_agents") or []
    if "insight" in selected:
        return "insight"
    if "report" in selected:
        return "report"
    return "finalize"


def _route_after_approval(state: AnalyticsGraphState) -> str:
    """Routes strictly to execution ONLY if user approved; otherwise skips to finalize."""
    if state.get("approval_status") == "approved":
        return "execution"
    return "finalize"


def _next_post_execution_node(state: AnalyticsGraphState, completed_stage: str) -> str:
    """Routes dynamically through post-execution analytical stages based on selected agents."""
    if state.get("step_count", 0) >= settings.agent_max_steps:
        return "finalize"

    selected = state.get("selected_agents") or []
    pipeline = ["statistical", "visualization", "insight", "report"]
    try:
        start_idx = pipeline.index(completed_stage) + 1
    except ValueError:
        start_idx = 0

    for candidate in pipeline[start_idx:]:
        if candidate in selected:
            return candidate
    return "finalize"


def build_analytics_graph(checkpointer: BaseCheckpointSaver | None = None):
    """Builds and compiles the Phase 6 LangGraph StateGraph."""
    builder = StateGraph(AnalyticsGraphState)

    # Register nodes
    builder.add_node("context_loader", context_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("discovery", discovery_node)
    builder.add_node("quality", quality_node)
    builder.add_node("prep_barrier", prep_barrier_node)
    builder.add_node("sql_analyst", sql_analyst_node)
    builder.add_node("sql_validation", validation_node)
    builder.add_node("human_approval", approval_node)
    builder.add_node("execution", execution_node)
    builder.add_node("statistical", statistical_node)
    builder.add_node("visualization", visualization_node)
    builder.add_node("insight", insight_node)
    builder.add_node("report", report_node)
    builder.add_node("finalize", finalize_node)

    # Entry flow
    builder.add_edge(START, "context_loader")
    builder.add_edge("context_loader", "supervisor")

    # Parallel Send & conditional dispatch after supervisor
    builder.add_conditional_edges(
        "supervisor",
        _route_after_supervisor,
        ["discovery", "quality", "sql_analyst", "insight", "report", "finalize"],
    )

    builder.add_edge("discovery", "prep_barrier")
    builder.add_edge("quality", "prep_barrier")

    builder.add_conditional_edges(
        "prep_barrier",
        _route_after_prep_barrier,
        {
            "quality": "quality",
            "sql_analyst": "sql_analyst",
            "insight": "insight",
            "report": "report",
            "finalize": "finalize",
        },
    )

    # SQL generation -> Validation -> Approval Gate
    builder.add_edge("sql_analyst", "sql_validation")
    builder.add_conditional_edges(
        "sql_validation",
        _route_after_validation,
        {
            "human_approval": "human_approval",
            "insight": "insight",
            "report": "report",
            "finalize": "finalize",
        },
    )

    # Human Approval Gate -> Execution OR Reject Finalize
    builder.add_conditional_edges(
        "human_approval",
        _route_after_approval,
        {
            "execution": "execution",
            "finalize": "finalize",
        },
    )

    # Post-execution conditional chain
    builder.add_conditional_edges(
        "execution",
        lambda s: _next_post_execution_node(s, "execution"),
        {
            "statistical": "statistical",
            "visualization": "visualization",
            "insight": "insight",
            "report": "report",
            "finalize": "finalize",
        },
    )
    builder.add_conditional_edges(
        "statistical",
        lambda s: _next_post_execution_node(s, "statistical"),
        {
            "visualization": "visualization",
            "insight": "insight",
            "report": "report",
            "finalize": "finalize",
        },
    )
    builder.add_conditional_edges(
        "visualization",
        lambda s: _next_post_execution_node(s, "visualization"),
        {
            "insight": "insight",
            "report": "report",
            "finalize": "finalize",
        },
    )
    builder.add_conditional_edges(
        "insight",
        lambda s: _next_post_execution_node(s, "insight"),
        {
            "report": "report",
            "finalize": "finalize",
        },
    )
    builder.add_edge("report", "finalize")
    builder.add_edge("finalize", END)

    return builder.compile(checkpointer=checkpointer)
