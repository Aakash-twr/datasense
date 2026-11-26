"""Graph builder wrapper and inspection helpers."""

from __future__ import annotations

from langgraph.checkpoint.base import BaseCheckpointSaver

from app.agents.graph import build_analytics_graph


def compile_workflow_graph(checkpointer: BaseCheckpointSaver | None = None):
    """Returns a compiled DataSense multi-agent LangGraph executable."""
    return build_analytics_graph(checkpointer=checkpointer)
