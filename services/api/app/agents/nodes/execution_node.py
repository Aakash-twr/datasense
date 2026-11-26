"""Approved SQL execution node delegating strictly to Phase 4 QueryService."""

from __future__ import annotations

import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.agents.nodes.validation_node import compute_approval_hash
from app.agents.services.db_context import agent_db_session
from app.agents.services.result_artifact_service import ResultArtifactService
from app.agents.state import AnalyticsGraphState
from app.analytics.schemas import QueryExecutionRequest
from app.analytics.services.query_service import QueryService
from app.core.config import settings
from app.models.dataset import Dataset, DatasetStatus
from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)


def _run_async_coro(coro: Any) -> Any:
    """Safely executes an async coroutine from a synchronous LangGraph worker thread."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as executor:
        return executor.submit(asyncio.run, coro).result()


def execution_node(state: AnalyticsGraphState) -> dict[str, Any]:
    """Re-verifies approval hash, dataset versions, and executes approved SQL via Phase 4 QueryService."""
    started = datetime.now(UTC)

    if state.get("approval_status") != "approved":
        completed = datetime.now(UTC)
        return {
            "executed_queries": [],
            "result_artifact_ids": [],
            "step_count": 1,
            "agent_statuses": {"sql_execution": "skipped"},
            "step_logs": [
                {
                    "agent_name": "Execution Engine",
                    "step_name": "Approved SQL Execution",
                    "status": "skipped",
                    "started_at": started.isoformat(),
                    "completed_at": completed.isoformat(),
                    "duration_ms": 0.0,
                    "output_summary": {"reason": "SQL execution was not approved"},
                }
            ],
        }

    project_id = uuid.UUID(state["project_id"])
    user_id = uuid.UUID(state["user_id"])
    drafts = state.get("sql_drafts") or []
    approved_set = set(state.get("approved_query_indices") or [])
    snapshot = state.get("dataset_version_snapshot") or {}

    # Re-verify cryptographic approval hash before executing anything
    expected_hash = compute_approval_hash(
        state["project_id"],
        snapshot,
        [str(d.get("sql", "")) for d in drafts],
    )
    if state.get("approval_hash") != expected_hash:
        completed = datetime.now(UTC)
        return {
            "executed_queries": [],
            "result_artifact_ids": [],
            "errors": ["Approval hash invalidation: query text or dataset snapshot changed."],
            "step_count": 1,
            "agent_statuses": {"sql_execution": "failed"},
            "step_logs": [
                {
                    "agent_name": "Execution Engine",
                    "step_name": "Approved SQL Execution",
                    "status": "failed",
                    "started_at": started.isoformat(),
                    "completed_at": completed.isoformat(),
                    "duration_ms": 0.0,
                    "error_message": "Approval hash verification failed.",
                }
            ],
        }

    queries_to_run = [
        d for d in drafts
        if d.get("query_index") in approved_set and d.get("validation_status") in ("valid", "repaired")
    ][: settings.agent_max_sql_queries]

    ds_uuids = [uuid.UUID(d) for d in (state.get("selected_dataset_ids") or [])]

    executed_summaries: list[dict[str, Any]] = []
    artifact_ids: list[str] = []
    evidence: list[dict[str, Any]] = []
    errors: list[str] = []

    artifact_svc = ResultArtifactService()

    with agent_db_session() as db:
        project = db.scalar(select(Project).where(Project.id == project_id))
        user = db.scalar(select(User).where(User.id == user_id))
        if not project or not user:
            completed = datetime.now(UTC)
            return {
                "executed_queries": [],
                "result_artifact_ids": [],
                "errors": ["Authorized project or user context missing at execution time."],
                "step_count": 1,
                "agent_statuses": {"sql_execution": "failed"},
            }

        # Verify active dataset versions have not changed since approval snapshot
        if ds_uuids:
            current_datasets = list(
                db.scalars(
                    select(Dataset).where(
                        Dataset.id.in_(ds_uuids),
                        Dataset.project_id == project_id,
                        Dataset.status == DatasetStatus.READY,
                        Dataset.archived_at.is_(None),
                    )
                ).all()
            )
            current_snapshot = {str(ds.id): str(ds.active_version_id) for ds in current_datasets}
            if current_snapshot != snapshot:
                completed = datetime.now(UTC)
                return {
                    "executed_queries": [],
                    "result_artifact_ids": [],
                    "errors": ["Dataset versions changed after approval. Please re-run workflow for fresh approval."],
                    "step_count": 1,
                    "agent_statuses": {"sql_execution": "failed"},
                    "step_logs": [
                        {
                            "agent_name": "Execution Engine",
                            "step_name": "Version Snapshot Verification",
                            "status": "failed",
                            "started_at": started.isoformat(),
                            "completed_at": completed.isoformat(),
                            "duration_ms": 0.0,
                            "error_message": "Dataset version snapshot mismatch.",
                        }
                    ],
                }

        for draft in queries_to_run:
            sql_text = str(draft["sql"]).strip()
            req = QueryExecutionRequest(
                sql=sql_text,
                dataset_ids=ds_uuids,
                limit=min(500, settings.duckdb_max_result_rows),
            )
            try:
                resp = _run_async_coro(
                    QueryService.execute_and_record(
                        session=db,
                        project=project,
                        user=user,
                        request=req,
                    )
                )
                cols_dicts = [{"name": c.name, "type": c.type} for c in resp.columns]
                art_id = artifact_svc.save_artifact(
                    organization_id=state["organization_id"],
                    project_id=state["project_id"],
                    user_id=state["user_id"],
                    run_id=state["run_id"],
                    query_run_id=str(resp.query_id),
                    sql=sql_text,
                    columns=cols_dicts,
                    rows=resp.rows,
                )
                artifact_ids.append(art_id)
                executed_summaries.append(
                    {
                        "query_index": draft["query_index"],
                        "title": draft.get("title", f"Query #{draft['query_index'] + 1}"),
                        "query_run_id": str(resp.query_id),
                        "artifact_id": art_id,
                        "sql": sql_text,
                        "columns": cols_dicts,
                        "row_count": resp.row_count,
                        "truncated": resp.truncated,
                        "execution_time_ms": resp.execution_time_ms,
                        "status": "success",
                    }
                )
                evidence.append(
                    {
                        "evidence_type": "query_execution",
                        "evidence_reference": f"query_run:{resp.query_id}",
                        "query_run_id": str(resp.query_id),
                        "description": f"Approved SQL '{draft.get('title', 'Query')}' executed in {resp.execution_time_ms:.1f}ms returning {resp.row_count} rows.",
                    }
                )
            except Exception as exc:
                logger.warning("Approved query #%s execution failed: %s", draft["query_index"], exc)
                errors.append(f"Query #{draft['query_index'] + 1} failed: {exc}")
                executed_summaries.append(
                    {
                        "query_index": draft["query_index"],
                        "title": draft.get("title", f"Query #{draft['query_index'] + 1}"),
                        "sql": sql_text,
                        "status": "failed",
                        "error_message": str(exc),
                    }
                )

    completed = datetime.now(UTC)
    duration_ms = (completed - started).total_seconds() * 1000.0
    step_status = "completed" if any(q.get("status") == "success" for q in executed_summaries) or not queries_to_run else "failed"

    return {
        "executed_queries": executed_summaries,
        "result_artifact_ids": artifact_ids,
        "evidence_records": evidence,
        "errors": errors,
        "step_count": 1,
        "agent_statuses": {"sql_execution": step_status},
        "step_logs": [
            {
                "agent_name": "Execution Engine",
                "step_name": "Approved DuckDB Query Execution",
                "status": step_status,
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
                "duration_ms": round(duration_ms, 2),
                "input_summary": {"approved_queries": len(queries_to_run)},
                "output_summary": {
                    "executed_count": len(executed_summaries),
                    "artifacts_created": len(artifact_ids),
                },
            }
        ],
    }
