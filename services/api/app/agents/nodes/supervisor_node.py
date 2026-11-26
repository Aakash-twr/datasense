"""Supervisor & analytical planning node coordinating specialized agents."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.prompts import SUPERVISOR_PROMPT
from app.agents.schemas import PlannedTask, SupervisorClassification
from app.agents.state import AnalyticsGraphState
from app.ai.llm_factory import LLMFactory
from app.core.config import settings
from app.models.agent_run import AgentWorkflowType

logger = logging.getLogger(__name__)

# Deterministic agent rosters per workflow mode
MODE_AGENT_MAP: dict[str, list[str]] = {
    AgentWorkflowType.SIMPLE_QUESTION: ["sql_analyst"],
    AgentWorkflowType.DATA_DISCOVERY: ["discovery"],
    AgentWorkflowType.DATA_QUALITY_AUDIT: ["discovery", "quality", "insight", "report"],
    AgentWorkflowType.DESCRIPTIVE_ANALYSIS: ["discovery", "sql_analyst", "statistical", "visualization", "insight"],
    AgentWorkflowType.TREND_ANALYSIS: ["discovery", "sql_analyst", "statistical", "visualization", "insight"],
    AgentWorkflowType.COMPARATIVE_ANALYSIS: ["discovery", "sql_analyst", "statistical", "visualization", "insight"],
    AgentWorkflowType.ANOMALY_INVESTIGATION: ["discovery", "quality", "sql_analyst", "statistical", "visualization", "insight"],
    AgentWorkflowType.VISUALIZATION: ["discovery", "sql_analyst", "visualization"],
    AgentWorkflowType.DEEP_ANALYSIS: ["discovery", "quality", "sql_analyst", "statistical", "visualization", "insight", "report"],
    AgentWorkflowType.REPORT_GENERATION: ["discovery", "quality", "sql_analyst", "statistical", "visualization", "insight", "report"],
}


def _heuristic_classify(user_request: str, requested_mode: str | None) -> SupervisorClassification:
    """Deterministic fallback classification when LLM is offline or mode is explicitly set."""
    q = user_request.lower()

    if requested_mode and requested_mode in MODE_AGENT_MAP:
        wf_type = AgentWorkflowType(requested_mode)
    elif any(k in q for k in ("quality", "missing", "null", "duplicate", "pii", "audit", "clean")):
        wf_type = AgentWorkflowType.DATA_QUALITY_AUDIT
    elif any(k in q for k in ("anomal", "unusual", "outlier", "spike", "drop", "why did", "decrease")):
        wf_type = AgentWorkflowType.ANOMALY_INVESTIGATION
    elif any(k in q for k in ("trend", "monthly", "weekly", "daily", "over time", "growth", "mom", "yoy")):
        wf_type = AgentWorkflowType.TREND_ANALYSIS
    elif any(k in q for k in ("compare", "comparison", "versus", "vs", "across regions", "across categories")):
        wf_type = AgentWorkflowType.COMPARATIVE_ANALYSIS
    elif any(k in q for k in ("report", "executive summary", "full overview", "complete", "comprehensive")):
        wf_type = AgentWorkflowType.DEEP_ANALYSIS
    elif any(k in q for k in ("chart", "plot", "graph", "visualiz")):
        wf_type = AgentWorkflowType.VISUALIZATION
    elif any(k in q for k in ("schema", "tables", "columns", "what data", "discover")):
        wf_type = AgentWorkflowType.DATA_DISCOVERY
    elif any(k in q for k in ("how many", "count", "total number of")) and len(q) < 80:
        wf_type = AgentWorkflowType.SIMPLE_QUESTION
    else:
        wf_type = AgentWorkflowType(settings.agent_default_mode) if settings.agent_default_mode in MODE_AGENT_MAP else AgentWorkflowType.DEEP_ANALYSIS

    agents = list(MODE_AGENT_MAP[wf_type])
    requires_sql = "sql_analyst" in agents
    tasks = [
        PlannedTask(
            task_id=f"task_{i + 1}",
            agent_name=agent,
            objective=f"Execute {agent.replace('_', ' ')} for: {user_request[:120]}",
        )
        for i, agent in enumerate(agents)
    ]

    return SupervisorClassification(
        workflow_type=wf_type,
        selected_agents=agents,
        rationale=f"Classified request as '{wf_type}' requiring {len(agents)} specialized agent(s).",
        planned_tasks=tasks,
        requires_sql=requires_sql,
    )


def supervisor_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Supervisor Agent: classifies analytical intent, builds bounded plan, and selects agents."""
    started = datetime.now(UTC)
    user_request = state["user_request"]
    requested_mode = state.get("requested_mode")
    schema_context = state.get("schema_context", "")

    llm_calls = 0
    classification: SupervisorClassification | None = None

    # Respect explicit user mode directly when requested, otherwise classify with Gemini or heuristic
    if requested_mode and requested_mode in MODE_AGENT_MAP:
        classification = _heuristic_classify(user_request, requested_mode)
    elif state.get("llm_calls_count", 0) < settings.agent_max_llm_calls:
        try:
            model = LLMFactory.get_model(temperature=0.0)
            structured = model.with_structured_output(SupervisorClassification)
            messages = [
                SystemMessage(content=SUPERVISOR_PROMPT),
                HumanMessage(
                    content=(
                        f"User analytical request: {user_request}\n\n"
                        f"Authorized Schema Overview:\n{schema_context[:2500]}"
                    )
                ),
            ]
            classification = structured.invoke(messages)
            llm_calls = 1
        except Exception as exc:
            logger.info("Supervisor using deterministic routing fallback (%s)", exc)

    if classification is None:
        classification = _heuristic_classify(user_request, requested_mode)

    # Enforce strict agent roster validity & max bounds
    wf_key = str(classification.workflow_type)
    if wf_key not in MODE_AGENT_MAP:
        wf_key = AgentWorkflowType.DEEP_ANALYSIS

    valid_agents = [a for a in classification.selected_agents if a in MODE_AGENT_MAP[AgentWorkflowType.DEEP_ANALYSIS]]
    if not valid_agents:
        valid_agents = list(MODE_AGENT_MAP[wf_key])

    requires_sql = "sql_analyst" in valid_agents
    planned_tasks = [t.model_dump() for t in classification.planned_tasks] or [
        PlannedTask(task_id=f"task_{i + 1}", agent_name=a, objective=f"Run {a}").model_dump()
        for i, a in enumerate(valid_agents)
    ]

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    # Initialize pending statuses for selected agents
    status_updates = {"supervisor": "completed"}
    for agent_name in valid_agents:
        status_updates[agent_name] = "pending"

    return {
        "workflow_type": wf_key,
        "selected_agents": valid_agents,
        "planned_tasks": planned_tasks,
        "plan_rationale": classification.rationale,
        "requires_sql": requires_sql,
        "step_count": 1,
        "llm_calls_count": llm_calls,
        "agent_statuses": status_updates,
        "step_logs": [
            {
                "agent_name": "Supervisor",
                "step_name": "Classification & Planning",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"requested_mode": requested_mode or "auto"},
                "output_summary": {
                    "workflow_type": wf_key,
                    "selected_agents": valid_agents,
                    "requires_sql": requires_sql,
                    "rationale": classification.rationale,
                },
            }
        ],
    }
