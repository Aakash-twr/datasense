"""SQLGlot AST validation and cryptographic approval-hash binding node."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from app.agents.services.db_context import agent_db_session
from app.agents.state import AnalyticsGraphState
from app.analytics.query_executor import QueryExecutor


def compute_approval_hash(
    project_id: str,
    version_snapshot: dict[str, str],
    sql_statements: list[str],
) -> str:
    """Computes a deterministic SHA-256 hash binding approval to exact SQL & dataset versions."""
    canonical_payload = json.dumps(
        {
            "project_id": str(project_id),
            "dataset_version_snapshot": dict(sorted(version_snapshot.items())),
            "sql_statements": [s.strip() for s in sql_statements],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def validation_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Revalidates all proposed SQL drafts using Phase 4 SQLGlot validator and binds approval hash."""
    started = datetime.now(UTC)
    project_id = uuid.UUID(state["project_id"])
    raw_ds_ids = state.get("selected_dataset_ids") or []
    ds_uuids = [uuid.UUID(d) for d in raw_ds_ids] if raw_ds_ids else None
    drafts = [dict(d) for d in (state.get("sql_drafts") or [])]

    validated_drafts: list[dict[str, Any]] = []
    validation_errors: list[str] = []

    with agent_db_session() as db:
        for idx, draft in enumerate(drafts):
            sql = str(draft.get("sql", "")).strip()
            if not sql:
                continue
            val_resp = QueryExecutor.validate_query(
                session=db,
                project_id=project_id,
                sql=sql,
                dataset_ids=ds_uuids,
            )
            draft["query_index"] = idx
            draft["tables_referenced"] = val_resp.tables_referenced
            if val_resp.is_valid:
                if draft.get("validation_status") not in ("valid", "repaired"):
                    draft["validation_status"] = "valid"
                draft["validation_error"] = None
                validated_drafts.append(draft)
            else:
                err_msg = val_resp.error or "SQL validation failed."
                draft["validation_status"] = "invalid"
                draft["validation_error"] = err_msg
                validation_errors.append(f"Query #{idx + 1}: {err_msg}")
                validated_drafts.append(draft)

    valid_sqls = [d["sql"] for d in validated_drafts if d.get("validation_status") in ("valid", "repaired")]
    approval_required = len(valid_sqls) > 0
    approval_hash = (
        compute_approval_hash(
            state["project_id"],
            state.get("dataset_version_snapshot") or {},
            [d["sql"] for d in validated_drafts],
        )
        if approval_required
        else None
    )

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0

    return {
        "sql_drafts": validated_drafts,
        "validation_passed": len(valid_sqls) > 0,
        "validation_errors": validation_errors,
        "approval_required": approval_required,
        "approval_status": "pending" if approval_required else "not_required",
        "approval_hash": approval_hash,
        "step_count": 1,
        "agent_statuses": {"sql_validation": "completed"},
        "step_logs": [
            {
                "agent_name": "SQL Validator",
                "step_name": "SQLGlot AST Safety Validation",
                "status": "completed",
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"total_drafts": len(drafts)},
                "output_summary": {
                    "valid_queries": len(valid_sqls),
                    "invalid_queries": len(validation_errors),
                    "approval_required": approval_required,
                },
            }
        ],
    }
