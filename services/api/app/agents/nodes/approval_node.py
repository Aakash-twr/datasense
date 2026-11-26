"""Human-in-the-Loop approval gate node using LangGraph interrupt()."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from langgraph.types import interrupt

from app.agents.state import AnalyticsGraphState


def approval_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Pauses workflow execution until user explicitly approves or rejects proposed SQL queries."""
    started = datetime.now(UTC)
    drafts = state.get("sql_drafts") or []
    valid_drafts = [d for d in drafts if d.get("validation_status") in ("valid", "repaired")]

    if not valid_drafts:
        completed = datetime.now(UTC)
        return {
            "approval_status": "not_required",
            "approved_query_indices": [],
            "step_count": 1,
            "agent_statuses": {"human_approval": "skipped"},
            "step_logs": [
                {
                    "agent_name": "Approval Gate",
                    "step_name": "Human Approval Check",
                    "status": "skipped",
                    "started_at": started.isoformat(),
                    "completed_at": completed.isoformat(),
                    "duration_ms": 0.0,
                    "output_summary": {"reason": "No executable valid SQL queries"},
                }
            ],
        }

    expected_hash = state.get("approval_hash")
    interrupt_payload = {
        "run_id": state.get("run_id"),
        "approval_hash": expected_hash,
        "dataset_version_snapshot": state.get("dataset_version_snapshot") or {},
        "estimated_queries": len(valid_drafts),
        "queries": [
            {
                "query_index": d["query_index"],
                "title": d.get("title", f"Query #{d['query_index'] + 1}"),
                "purpose": d.get("purpose", ""),
                "sql": d["sql"],
                "tables_referenced": d.get("tables_referenced", []),
                "datasets_involved": d.get("datasets_involved", []),
                "validation_status": d.get("validation_status"),
            }
            for d in valid_drafts
        ],
    }

    # Execution pauses right here and persists checkpoint until Command(resume=...) is invoked
    resume_data = interrupt(interrupt_payload)
    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    decision = "rejected"
    approved_indices: list[int] = []
    comment: str | None = None
    provided_hash: str | None = None

    if isinstance(resume_data, dict):
        decision = str(resume_data.get("decision", "rejected")).lower()
        provided_hash = resume_data.get("approval_hash")
        comment = resume_data.get("comment")
        raw_indices = resume_data.get("approved_query_indices")
        if raw_indices is None:
            approved_indices = [d["query_index"] for d in valid_drafts]
        else:
            valid_idx_set = {d["query_index"] for d in valid_drafts}
            approved_indices = [int(i) for i in raw_indices if int(i) in valid_idx_set]

    # Single-use cryptographic hash verification
    if decision == "approved" and expected_hash and provided_hash != expected_hash:
        return {
            "approval_status": "rejected",
            "approved_query_indices": [],
            "approval_comment": "Approval hash mismatch: SQL or dataset versions changed.",
            "errors": ["Approval invalidated due to hash mismatch."],
            "step_count": 1,
            "agent_statuses": {"human_approval": "failed"},
            "step_logs": [
                {
                    "agent_name": "Approval Gate",
                    "step_name": "Human Approval Verification",
                    "status": "failed",
                    "started_at": started.isoformat(),
                    "completed_at": completed.isoformat(),
                    "duration_ms": round(duration_ms, 2),
                    "error_message": "Approval hash mismatch detected.",
                }
            ],
        }

    is_approved = decision == "approved" and len(approved_indices) > 0
    return {
        "approval_status": "approved" if is_approved else "rejected",
        "approved_query_indices": approved_indices if is_approved else [],
        "approval_comment": comment,
        "step_count": 1,
        "agent_statuses": {"human_approval": "completed"},
        "step_logs": [
            {
                "agent_name": "Approval Gate",
                "step_name": "Human SQL Execution Approval",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "output_summary": {
                    "decision": "approved" if is_approved else "rejected",
                    "approved_queries": len(approved_indices) if is_approved else 0,
                },
            }
        ],
    }
