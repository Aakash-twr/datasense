"""High-level orchestration service managing LangGraph workflows, approvals, checkpoints, and reports."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from langgraph.types import Command
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.agents.builder import compile_workflow_graph
from app.agents.exceptions import (
    AgentApprovalError,
    AgentConcurrencyLimitError,
    AgentReportNotFoundError,
    AgentRunNotFoundError,
    AgentWorkflowDisabledError,
)
from app.agents.schemas import (
    AgentRunApproveRequest,
    AgentRunCreateRequest,
    AgentRunEvidenceResponse,
    AgentRunResponse,
    AgentRunResultsResponse,
    AgentRunStepResponse,
    AgentWorkspaceDashboardStats,
    AnalysisReportResponse,
)
from app.agents.services.checkpoint_service import CheckpointService
from app.agents.services.db_context import agent_db_session
from app.agents.services.evidence_service import EvidenceService
from app.core.config import settings
from app.models.agent_run import (
    AgentApprovalStatus,
    AgentRun,
    AgentWorkflowStatus,
    AgentWorkflowType,
)
from app.models.agent_run_step import AgentRunStep, AgentStepStatus
from app.models.ai_conversation import AIConversation
from app.models.analysis_report import AnalysisReport
from app.models.dataset import Dataset, DatasetStatus
from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)


class WorkflowService:
    """Coordinates authorized LangGraph workflow runs, durable checkpoints, and reports."""

    def __init__(self, checkpoint_service: CheckpointService | None = None):
        self.checkpoint_service = checkpoint_service or CheckpointService()

    # -------------------------------------------------------------------------
    # Authorization & Snapshot Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _resolve_datasets_and_snapshot(
        db: Session,
        project_id: uuid.UUID,
        dataset_ids: list[str],
    ) -> tuple[list[str], dict[str, str]]:
        """Verifies dataset ownership in project and returns IDs + active version snapshot."""
        stmt = select(Dataset).where(
            Dataset.project_id == project_id,
            Dataset.status == DatasetStatus.READY,
            Dataset.archived_at.is_(None),
        )
        if dataset_ids:
            ds_uuids = [uuid.UUID(d) for d in dataset_ids]
            stmt = stmt.where(Dataset.id.in_(ds_uuids))

        datasets = list(db.scalars(stmt).all())
        if dataset_ids and len(datasets) != len(set(dataset_ids)):
            raise AgentRunNotFoundError("One or more selected datasets were not found or are not ready.")

        resolved_ids = [str(ds.id) for ds in datasets]
        snapshot = {str(ds.id): str(ds.active_version_id) for ds in datasets if ds.active_version_id}
        return resolved_ids, snapshot

    @staticmethod
    def _validate_conversation(
        db: Session,
        organization_id: uuid.UUID,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        conversation_id: str | None,
    ) -> uuid.UUID | None:
        if not conversation_id:
            return None
        conv_uuid = uuid.UUID(conversation_id)
        conv = db.scalar(
            select(AIConversation).where(
                AIConversation.id == conv_uuid,
                AIConversation.organization_id == organization_id,
                AIConversation.project_id == project_id,
                AIConversation.user_id == user_id,
            )
        )
        if not conv:
            raise AgentRunNotFoundError("Referenced AI conversation not found or unauthorized.")
        return conv_uuid

    # -------------------------------------------------------------------------
    # Run Lifecycle: Create & Execute
    # -------------------------------------------------------------------------

    def create_run(
        self,
        db: Session,
        *,
        user: User,
        project: Project,
        payload: AgentRunCreateRequest,
    ) -> AgentRun:
        """Creates an AgentRun record after strict authorization and concurrency checks."""
        if not settings.agent_workflows_enabled:
            raise AgentWorkflowDisabledError()

        active_count = db.scalar(
            select(func.count())
            .select_from(AgentRun)
            .where(
                AgentRun.organization_id == project.organization_id,
                AgentRun.status.in_([AgentWorkflowStatus.PLANNING, AgentWorkflowStatus.RUNNING]),
            )
        ) or 0
        if active_count >= settings.agent_max_concurrent_runs:
            raise AgentConcurrencyLimitError(
                f"Maximum concurrent agent workflows ({settings.agent_max_concurrent_runs}) reached."
            )

        conv_uuid = self._validate_conversation(
            db, project.organization_id, project.id, user.id, payload.conversation_id
        )
        resolved_ids, snapshot = self._resolve_datasets_and_snapshot(
            db, project.id, payload.dataset_ids
        )

        wf_type = payload.workflow_type or settings.agent_default_mode
        if wf_type not in set(AgentWorkflowType):
            wf_type = AgentWorkflowType.DEEP_ANALYSIS

        run = AgentRun(
            organization_id=project.organization_id,
            project_id=project.id,
            user_id=user.id,
            conversation_id=conv_uuid,
            thread_id=CheckpointService.generate_thread_id(),
            workflow_type=wf_type,
            user_request=payload.request.strip(),
            selected_dataset_ids=resolved_ids,
            dataset_version_snapshot=snapshot,
            share_aggregate_summaries=bool(payload.share_aggregate_summaries_with_gemini),
            status=AgentWorkflowStatus.PLANNING,
            current_step="Initializing LangGraph Workflow",
            approval_status=AgentApprovalStatus.NOT_REQUIRED,
            started_at=datetime.now(UTC),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    def execute_run_sync(self, run_id: uuid.UUID) -> None:
        """Executes the initial LangGraph workflow until completion or human_approval interrupt."""
        with agent_db_session() as db:
            run = db.scalar(select(AgentRun).where(AgentRun.id == run_id))
            if not run or run.status == AgentWorkflowStatus.CANCELLED:
                return

            run.status = AgentWorkflowStatus.RUNNING
            run.current_step = "Supervisor & Planning"
            db.commit()

            initial_state = {
                "run_id": str(run.id),
                "thread_id": run.thread_id,
                "conversation_id": str(run.conversation_id) if run.conversation_id else None,
                "organization_id": str(run.organization_id),
                "project_id": str(run.project_id),
                "user_id": str(run.user_id),
                "user_request": run.user_request,
                "requested_mode": run.workflow_type,
                "share_aggregate_summaries": run.share_aggregate_summaries,
                "selected_dataset_ids": list(run.selected_dataset_ids),
                "dataset_version_snapshot": dict(run.dataset_version_snapshot),
                "step_count": 0,
                "llm_calls_count": 0,
                "sql_queries_count": 0,
                "warnings": [],
                "errors": [],
                "evidence_records": [],
                "step_logs": [],
                "agent_statuses": {},
            }

            config = {
                "configurable": {"thread_id": run.thread_id},
                "recursion_limit": max(25, settings.agent_max_steps * 2),
            }

            try:
                with self.checkpoint_service.get_checkpointer() as checkpointer:
                    graph = compile_workflow_graph(checkpointer=checkpointer)
                    result_state = graph.invoke(initial_state, config=config)
                    snapshot_state = graph.get_state(config)
                    self._sync_run_from_graph(db, run, result_state, snapshot_state)
            except Exception as exc:
                logger.exception("AgentRun %s failed during execution: %s", run_id, exc)
                run.status = AgentWorkflowStatus.FAILED
                run.error_code = "WORKFLOW_EXECUTION_ERROR"
                run.error_summary = str(exc)[:1000]
                run.completed_at = datetime.now(UTC)
                if run.started_at:
                    started = run.started_at.replace(tzinfo=UTC) if run.started_at.tzinfo is None else run.started_at
                    run.duration_ms = round((run.completed_at - started).total_seconds() * 1000.0, 2)
                db.commit()

    async def execute_run_background(self, run_id: uuid.UUID) -> None:
        """Runs LangGraph workflow inside an async worker thread with strict timeout bounds."""
        try:
            await asyncio.wait_for(
                asyncio.to_thread(self.execute_run_sync, run_id),
                timeout=float(settings.agent_workflow_timeout_seconds),
            )
        except TimeoutError:
            with agent_db_session() as db:
                run = db.scalar(select(AgentRun).where(AgentRun.id == run_id))
                if run and run.status in (AgentWorkflowStatus.PLANNING, AgentWorkflowStatus.RUNNING):
                    run.status = AgentWorkflowStatus.FAILED
                    run.error_code = "WORKFLOW_TIMEOUT"
                    run.error_summary = (
                        f"Workflow exceeded timeout limit of {settings.agent_workflow_timeout_seconds} seconds."
                    )
                    run.completed_at = datetime.now(UTC)
                    db.commit()

    # -------------------------------------------------------------------------
    # Human Approval, Resume, Reject & Cancel
    # -------------------------------------------------------------------------

    def prepare_approval_resume(
        self,
        db: Session,
        *,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: AgentRunApproveRequest,
    ) -> AgentRun:
        """Validates authorization, cryptographic approval hash, and dataset snapshot before resuming."""
        run = self.get_authorized_run(db, project_id=project_id, run_id=run_id, user_id=user_id)

        if run.status != AgentWorkflowStatus.AWAITING_APPROVAL or run.approval_status != AgentApprovalStatus.PENDING:
            raise AgentApprovalError("Workflow is not currently awaiting approval.")

        if not run.approval_hash or payload.approval_hash != run.approval_hash:
            raise AgentApprovalError("Invalid approval hash: proposed queries or datasets do not match.")

        # Re-verify dataset versions have not changed since proposal
        if run.selected_dataset_ids:
            _, current_snapshot = self._resolve_datasets_and_snapshot(
                db, project_id, list(run.selected_dataset_ids)
            )
            if current_snapshot != (run.dataset_version_snapshot or {}):
                run.status = AgentWorkflowStatus.REJECTED
                run.approval_status = AgentApprovalStatus.REJECTED
                run.error_code = "DATASET_VERSION_CHANGED"
                run.error_summary = "Dataset versions changed after approval request. Please re-run analysis."
                run.completed_at = datetime.now(UTC)
                db.commit()
                raise AgentApprovalError(run.error_summary)

        # Single-use lock: transition immediately out of AWAITING_APPROVAL before resuming
        valid_indices = [
            q["query_index"]
            for q in (run.approval_payload or {}).get("queries", [])
        ]
        chosen_indices = (
            [i for i in payload.approved_query_indices if i in valid_indices]
            if payload.approved_query_indices is not None
            else valid_indices
        )
        if not chosen_indices:
            raise AgentApprovalError("At least one valid SQL query must be selected for approval.")

        run.status = AgentWorkflowStatus.RUNNING
        run.approval_status = AgentApprovalStatus.APPROVED
        run.approved_query_indices = chosen_indices
        run.current_step = "Executing Approved Queries"
        db.commit()
        db.refresh(run)
        return run

    def resume_after_approval_sync(
        self,
        run_id: uuid.UUID,
        *,
        approval_hash: str,
        approved_query_indices: list[int],
        comment: str | None = None,
    ) -> None:
        """Resumes the interrupted LangGraph checkpoint with Command(resume=...)."""
        with agent_db_session() as db:
            run = db.scalar(select(AgentRun).where(AgentRun.id == run_id))
            if not run or run.status == AgentWorkflowStatus.CANCELLED:
                return

            config = {
                "configurable": {"thread_id": run.thread_id},
                "recursion_limit": max(25, settings.agent_max_steps * 2),
            }
            resume_cmd = Command(
                resume={
                    "decision": "approved",
                    "approval_hash": approval_hash,
                    "approved_query_indices": approved_query_indices,
                    "comment": comment,
                }
            )
            try:
                with self.checkpoint_service.get_checkpointer() as checkpointer:
                    graph = compile_workflow_graph(checkpointer=checkpointer)
                    result_state = graph.invoke(resume_cmd, config=config)
                    snapshot_state = graph.get_state(config)
                    self._sync_run_from_graph(db, run, result_state, snapshot_state)
            except Exception as exc:
                logger.exception("AgentRun %s failed on resume: %s", run_id, exc)
                run.status = AgentWorkflowStatus.FAILED
                run.error_code = "WORKFLOW_RESUME_ERROR"
                run.error_summary = str(exc)[:1000]
                run.completed_at = datetime.now(UTC)
                db.commit()

    async def resume_after_approval_background(
        self,
        run_id: uuid.UUID,
        *,
        approval_hash: str,
        approved_query_indices: list[int],
        comment: str | None = None,
    ) -> None:
        try:
            await asyncio.wait_for(
                asyncio.to_thread(
                    self.resume_after_approval_sync,
                    run_id,
                    approval_hash=approval_hash,
                    approved_query_indices=approved_query_indices,
                    comment=comment,
                ),
                timeout=float(settings.agent_workflow_timeout_seconds),
            )
        except TimeoutError:
            with agent_db_session() as db:
                run = db.scalar(select(AgentRun).where(AgentRun.id == run_id))
                if run and run.status == AgentWorkflowStatus.RUNNING:
                    run.status = AgentWorkflowStatus.FAILED
                    run.error_code = "WORKFLOW_TIMEOUT"
                    run.error_summary = "Resumed workflow exceeded execution timeout."
                    run.completed_at = datetime.now(UTC)
                    db.commit()

    def reject_run(
        self,
        db: Session,
        *,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        user_id: uuid.UUID,
        reason: str | None = None,
    ) -> AgentRun:
        """Rejects proposed SQL execution and cleanly concludes the interrupted checkpoint."""
        run = self.get_authorized_run(db, project_id=project_id, run_id=run_id, user_id=user_id)
        if run.status != AgentWorkflowStatus.AWAITING_APPROVAL:
            raise AgentApprovalError("Only workflows awaiting approval can be rejected.")

        config = {"configurable": {"thread_id": run.thread_id}}
        try:
            with self.checkpoint_service.get_checkpointer() as checkpointer:
                graph = compile_workflow_graph(checkpointer=checkpointer)
                result_state = graph.invoke(
                    Command(resume={"decision": "rejected", "comment": reason}),
                    config=config,
                )
                snapshot_state = graph.get_state(config)
                self._sync_run_from_graph(db, run, result_state, snapshot_state)
        except Exception as exc:
            logger.warning("Checkpoint reject resume fallback for run %s: %s", run_id, exc)

        run.status = AgentWorkflowStatus.REJECTED
        run.approval_status = AgentApprovalStatus.REJECTED
        run.current_step = "Rejected by User"
        run.error_summary = reason or "SQL execution plan rejected by user."
        run.completed_at = datetime.now(UTC)
        if run.started_at:
            started = run.started_at.replace(tzinfo=UTC) if run.started_at.tzinfo is None else run.started_at
            run.duration_ms = round((run.completed_at - started).total_seconds() * 1000.0, 2)
        db.commit()
        db.refresh(run)
        return run

    def cancel_run(
        self,
        db: Session,
        *,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> AgentRun:
        """Cancels an active or awaiting-approval workflow."""
        run = self.get_authorized_run(db, project_id=project_id, run_id=run_id, user_id=user_id)
        if run.status in (AgentWorkflowStatus.COMPLETED, AgentWorkflowStatus.CANCELLED):
            return run

        run.status = AgentWorkflowStatus.CANCELLED
        run.current_step = "Cancelled"
        run.completed_at = datetime.now(UTC)
        if run.started_at:
            started = run.started_at.replace(tzinfo=UTC) if run.started_at.tzinfo is None else run.started_at
            run.duration_ms = round((run.completed_at - started).total_seconds() * 1000.0, 2)
        db.commit()
        db.refresh(run)
        return run

    # -------------------------------------------------------------------------
    # State Sync Helper
    # -------------------------------------------------------------------------

    @staticmethod
    def _sync_run_from_graph(
        db: Session,
        run: AgentRun,
        result_state: dict[str, Any],
        snapshot_state: Any,
    ) -> None:
        """Synchronizes LangGraph execution state into PostgreSQL tables without raw rows."""
        # Refresh existing step rows cleanly
        existing_steps = list(
            db.scalars(select(AgentRunStep).where(AgentRunStep.agent_run_id == run.id)).all()
        )
        for st in existing_steps:
            db.delete(st)
        db.flush()

        step_logs = result_state.get("step_logs") or []
        for idx, log_item in enumerate(step_logs):
            s_at = _parse_iso_dt(log_item.get("started_at"))
            c_at = _parse_iso_dt(log_item.get("completed_at"))
            db.add(
                AgentRunStep(
                    agent_run_id=run.id,
                    agent_name=str(log_item.get("agent_name", "Agent")),
                    step_name=str(log_item.get("step_name", "Step")),
                    status=str(log_item.get("status", AgentStepStatus.COMPLETED)),
                    sequence_order=idx,
                    started_at=s_at,
                    completed_at=c_at,
                    duration_ms=log_item.get("duration_ms"),
                    input_summary=log_item.get("input_summary"),
                    output_summary=log_item.get("output_summary"),
                    error_message=log_item.get("error_message"),
                )
            )

        # Persist evidence citations
        evidence_records = result_state.get("evidence_records") or []
        if evidence_records:
            EvidenceService.record_evidence_batch(db, run.id, evidence_records)

        # Check if LangGraph is paused at an interrupt
        interrupts = []
        if snapshot_state and getattr(snapshot_state, "tasks", None):
            for t in snapshot_state.tasks:
                if getattr(t, "interrupts", None):
                    interrupts.extend(t.interrupts)

        run.workflow_type = str(result_state.get("workflow_type") or run.workflow_type)
        run.llm_calls_count = int(result_state.get("llm_calls_count", 0))
        run.sql_queries_count = int(result_state.get("sql_queries_count", len(result_state.get("sql_drafts") or [])))
        run.approval_hash = result_state.get("approval_hash") or run.approval_hash

        # Compact, row-free analytical summary stored on AgentRun
        run.result_summary = {
            "plan_rationale": result_state.get("plan_rationale"),
            "selected_agents": result_state.get("selected_agents") or [],
            "planned_tasks": result_state.get("planned_tasks") or [],
            "agent_statuses": result_state.get("agent_statuses") or {},
            "discovery": result_state.get("discovery_output"),
            "data_quality": result_state.get("quality_output"),
            "sql_drafts": result_state.get("sql_drafts") or [],
            "executed_queries": result_state.get("executed_queries") or [],
            "result_artifact_ids": result_state.get("result_artifact_ids") or [],
            "statistical_analysis": result_state.get("statistical_output"),
            "visualizations": result_state.get("visualization_output"),
            "insights": result_state.get("insight_output"),
            "report": result_state.get("report_output"),
            "report_markdown": result_state.get("report_markdown"),
            "warnings": result_state.get("warnings") or [],
            "errors": result_state.get("errors") or [],
        }

        if interrupts:
            intr_val = interrupts[0].value if hasattr(interrupts[0], "value") else interrupts[0]
            run.status = AgentWorkflowStatus.AWAITING_APPROVAL
            run.approval_status = AgentApprovalStatus.PENDING
            run.approval_payload = intr_val if isinstance(intr_val, dict) else {"payload": intr_val}
            run.current_step = "Awaiting User Approval"
            # Add visible pending approval timeline item
            db.add(
                AgentRunStep(
                    agent_run_id=run.id,
                    agent_name="Approval Gate",
                    step_name="Awaiting Human SQL Approval",
                    status=AgentStepStatus.AWAITING_APPROVAL,
                    sequence_order=len(step_logs),
                    started_at=datetime.now(UTC),
                    input_summary={"estimated_queries": len((run.approval_payload or {}).get("queries", []))},
                )
            )
        else:
            final_st = result_state.get("final_status", "completed")
            if final_st == "rejected" or result_state.get("approval_status") == "rejected":
                run.status = AgentWorkflowStatus.REJECTED
                run.approval_status = AgentApprovalStatus.REJECTED
                run.current_step = "Rejected"
            elif final_st == "failed":
                run.status = AgentWorkflowStatus.FAILED
                run.current_step = "Failed"
                errs = result_state.get("errors") or []
                run.error_summary = "; ".join(errs[:3]) if errs else "Critical workflow step failed."
            else:
                run.status = AgentWorkflowStatus.COMPLETED
                run.current_step = "Completed"

            run.completed_at = datetime.now(UTC)
            if run.started_at:
                started = run.started_at.replace(tzinfo=UTC) if run.started_at.tzinfo is None else run.started_at
                run.duration_ms = round((run.completed_at - started).total_seconds() * 1000.0, 2)

        db.commit()
        db.refresh(run)

    # -------------------------------------------------------------------------
    # Queries, Results & Report Persistence
    # -------------------------------------------------------------------------

    @staticmethod
    def get_authorized_run(
        db: Session,
        *,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
    ) -> AgentRun:
        stmt = (
            select(AgentRun)
            .where(AgentRun.id == run_id, AgentRun.project_id == project_id)
            .options(selectinload(AgentRun.steps), selectinload(AgentRun.evidence_items))
        )
        run = db.scalars(stmt).one_or_none()
        if not run:
            raise AgentRunNotFoundError("Agent run not found.")
        if user_id and run.user_id != user_id:
            raise AgentRunNotFoundError("Agent run not found.")
        return run

    @staticmethod
    def list_runs(
        db: Session,
        *,
        project_id: uuid.UUID | None = None,
        organization_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        workflow_type: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AgentRun], int]:
        stmt = select(AgentRun).options(
            selectinload(AgentRun.steps), selectinload(AgentRun.evidence_items)
        )
        count_stmt = select(func.count()).select_from(AgentRun)

        if project_id:
            stmt = stmt.where(AgentRun.project_id == project_id)
            count_stmt = count_stmt.where(AgentRun.project_id == project_id)
        if organization_id:
            stmt = stmt.where(AgentRun.organization_id == organization_id)
            count_stmt = count_stmt.where(AgentRun.organization_id == organization_id)
        if status_filter:
            stmt = stmt.where(AgentRun.status == status_filter)
            count_stmt = count_stmt.where(AgentRun.status == status_filter)
        if workflow_type:
            stmt = stmt.where(AgentRun.workflow_type == workflow_type)
            count_stmt = count_stmt.where(AgentRun.workflow_type == workflow_type)

        total = db.scalar(count_stmt) or 0
        offset = (page - 1) * page_size
        items = list(
            db.scalars(
                stmt.order_by(AgentRun.created_at.desc()).offset(offset).limit(page_size)
            ).all()
        )
        return items, total

    @staticmethod
    def delete_run(
        db: Session,
        *,
        project_id: uuid.UUID,
        run_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        run = WorkflowService.get_authorized_run(db, project_id=project_id, run_id=run_id, user_id=user_id)
        thread_id = run.thread_id
        db.delete(run)
        db.commit()
        CheckpointService().delete_thread_checkpoints(thread_id)

    @staticmethod
    def get_dashboard_stats(
        db: Session,
        *,
        organization_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
    ) -> AgentWorkspaceDashboardStats:
        base_filter = [AgentRun.organization_id == organization_id]
        rep_filter = [AnalysisReport.organization_id == organization_id]
        if project_id:
            base_filter.append(AgentRun.project_id == project_id)
            rep_filter.append(AnalysisReport.project_id == project_id)

        total_runs = db.scalar(select(func.count()).select_from(AgentRun).where(*base_filter)) or 0
        completed = db.scalar(
            select(func.count()).select_from(AgentRun).where(*base_filter, AgentRun.status == AgentWorkflowStatus.COMPLETED)
        ) or 0
        awaiting = db.scalar(
            select(func.count()).select_from(AgentRun).where(*base_filter, AgentRun.status == AgentWorkflowStatus.AWAITING_APPROVAL)
        ) or 0
        failed_or_cancelled = db.scalar(
            select(func.count()).select_from(AgentRun).where(
                *base_filter,
                AgentRun.status.in_([AgentWorkflowStatus.FAILED, AgentWorkflowStatus.CANCELLED, AgentWorkflowStatus.REJECTED]),
            )
        ) or 0
        saved_reports = db.scalar(select(func.count()).select_from(AnalysisReport).where(*rep_filter)) or 0

        return AgentWorkspaceDashboardStats(
            total_runs=total_runs,
            completed_analyses=completed,
            awaiting_approval=awaiting,
            saved_reports=saved_reports,
            failed_or_cancelled=failed_or_cancelled,
        )

    @staticmethod
    def save_report_from_run(
        db: Session,
        *,
        project: Project,
        user: User,
        run_id: uuid.UUID,
        custom_title: str | None = None,
    ) -> AnalysisReport:
        run = WorkflowService.get_authorized_run(db, project_id=project.id, run_id=run_id)
        summary = run.result_summary or {}
        report_json = summary.get("report")
        report_md = summary.get("report_markdown") or ""

        if not report_json:
            # Generate a structured fallback report from whatever findings exist in summary
            insights = summary.get("insights") or {}
            report_json = {
                "title": custom_title or f"Analysis Report: {run.user_request[:72]}",
                "executive_summary": insights.get("executive_takeaway") or run.user_request,
                "datasets_analyzed": list(run.selected_dataset_ids),
                "analytical_objectives": [run.user_request],
                "key_findings": [f.get("summary", "") for f in insights.get("findings", [])],
                "statistical_analysis": [],
                "data_quality_observations": [],
                "trends_and_comparisons": [],
                "recommended_visualizations": [],
                "business_recommendations": [],
                "limitations": summary.get("warnings") or [],
                "supporting_evidence": [],
            }
            if not report_md:
                report_md = f"# {report_json['title']}\n\n## Executive Summary\n{report_json['executive_summary']}\n"

        title = custom_title.strip() if custom_title and custom_title.strip() else str(report_json.get("title") or f"Report: {run.user_request[:60]}")
        evidence_refs = [
            {
                "id": str(ev.id),
                "evidence_type": ev.evidence_type,
                "evidence_reference": ev.evidence_reference,
                "description": ev.description,
            }
            for ev in run.evidence_items
        ]

        report = AnalysisReport(
            organization_id=project.organization_id,
            project_id=project.id,
            user_id=user.id,
            agent_run_id=run.id,
            title=title[:255],
            workflow_type=run.workflow_type,
            report_json=report_json,
            report_markdown=report_md,
            evidence_references=evidence_refs,
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report

    @staticmethod
    def list_reports(
        db: Session,
        *,
        organization_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AnalysisReport], int]:
        stmt = select(AnalysisReport).where(AnalysisReport.organization_id == organization_id)
        count_stmt = select(func.count()).select_from(AnalysisReport).where(AnalysisReport.organization_id == organization_id)
        if project_id:
            stmt = stmt.where(AnalysisReport.project_id == project_id)
            count_stmt = count_stmt.where(AnalysisReport.project_id == project_id)

        total = db.scalar(count_stmt) or 0
        offset = (page - 1) * page_size
        items = list(
            db.scalars(
                stmt.order_by(AnalysisReport.created_at.desc()).offset(offset).limit(page_size)
            ).all()
        )
        return items, total

    @staticmethod
    def get_report(
        db: Session,
        *,
        organization_id: uuid.UUID,
        report_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
    ) -> AnalysisReport:
        stmt = select(AnalysisReport).where(
            AnalysisReport.id == report_id,
            AnalysisReport.organization_id == organization_id,
        )
        if project_id:
            stmt = stmt.where(AnalysisReport.project_id == project_id)
        report = db.scalars(stmt).one_or_none()
        if not report:
            raise AgentReportNotFoundError("Analysis report not found.")
        return report

    @staticmethod
    def delete_report(
        db: Session,
        *,
        organization_id: uuid.UUID,
        report_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
    ) -> None:
        report = WorkflowService.get_report(
            db, organization_id=organization_id, report_id=report_id, project_id=project_id
        )
        db.delete(report)
        db.commit()

    @staticmethod
    def recover_interrupted_agent_runs(db: Session) -> int:
        """Marks runs left in transient PLANNING/RUNNING status on server restart as FAILED."""
        stale = list(
            db.scalars(
                select(AgentRun).where(
                    AgentRun.status.in_([AgentWorkflowStatus.PLANNING, AgentWorkflowStatus.RUNNING])
                )
            ).all()
        )
        for run in stale:
            run.status = AgentWorkflowStatus.FAILED
            run.error_code = "SERVER_RESTART_INTERRUPTED"
            run.error_summary = "Workflow interrupted by backend restart while executing. Please re-run."
            run.completed_at = datetime.now(UTC)
        if stale:
            db.commit()
        return len(stale)

    # -------------------------------------------------------------------------
    # Serializers
    # -------------------------------------------------------------------------

    @staticmethod
    def to_run_response(run: AgentRun) -> AgentRunResponse:
        return AgentRunResponse(
            id=str(run.id),
            organization_id=str(run.organization_id),
            project_id=str(run.project_id),
            user_id=str(run.user_id),
            conversation_id=str(run.conversation_id) if run.conversation_id else None,
            workflow_type=run.workflow_type,
            user_request=run.user_request,
            selected_dataset_ids=list(run.selected_dataset_ids or []),
            dataset_version_snapshot=dict(run.dataset_version_snapshot or {}),
            share_aggregate_summaries=run.share_aggregate_summaries,
            status=run.status,
            current_step=run.current_step,
            approval_status=run.approval_status,
            approval_hash=run.approval_hash,
            approval_payload=run.approval_payload,
            approved_query_indices=list(run.approved_query_indices or []),
            llm_calls_count=run.llm_calls_count,
            sql_queries_count=run.sql_queries_count,
            token_usage=run.token_usage,
            result_summary=run.result_summary,
            started_at=run.started_at,
            completed_at=run.completed_at,
            duration_ms=run.duration_ms,
            error_code=run.error_code,
            error_summary=run.error_summary,
            created_at=run.created_at,
            updated_at=run.updated_at,
            steps=[
                AgentRunStepResponse(
                    id=str(s.id),
                    agent_name=s.agent_name,
                    step_name=s.step_name,
                    status=s.status,
                    sequence_order=s.sequence_order,
                    started_at=s.started_at,
                    completed_at=s.completed_at,
                    duration_ms=s.duration_ms,
                    input_summary=s.input_summary,
                    output_summary=s.output_summary,
                    error_message=s.error_message,
                )
                for s in (run.steps or [])
            ],
            evidence_items=[
                AgentRunEvidenceResponse(
                    id=str(ev.id),
                    query_run_id=str(ev.query_run_id) if ev.query_run_id else None,
                    dataset_id=str(ev.dataset_id) if ev.dataset_id else None,
                    dataset_version_id=str(ev.dataset_version_id) if ev.dataset_version_id else None,
                    evidence_type=ev.evidence_type,
                    evidence_reference=ev.evidence_reference,
                    description=ev.description,
                    created_at=ev.created_at,
                )
                for ev in (run.evidence_items or [])
            ],
        )

    @staticmethod
    def to_results_response(run: AgentRun) -> AgentRunResultsResponse:
        s = run.result_summary or {}
        return AgentRunResultsResponse(
            run_id=str(run.id),
            status=run.status,
            workflow_type=run.workflow_type,
            discovery=s.get("discovery"),
            data_quality=s.get("data_quality"),
            sql_drafts=s.get("sql_drafts") or [],
            executed_queries=s.get("executed_queries") or [],
            statistical_analysis=s.get("statistical_analysis"),
            visualizations=s.get("visualizations"),
            insights=s.get("insights"),
            report=s.get("report"),
            report_markdown=s.get("report_markdown"),
            evidence=[
                AgentRunEvidenceResponse(
                    id=str(ev.id),
                    query_run_id=str(ev.query_run_id) if ev.query_run_id else None,
                    dataset_id=str(ev.dataset_id) if ev.dataset_id else None,
                    dataset_version_id=str(ev.dataset_version_id) if ev.dataset_version_id else None,
                    evidence_type=ev.evidence_type,
                    evidence_reference=ev.evidence_reference,
                    description=ev.description,
                    created_at=ev.created_at,
                )
                for ev in (run.evidence_items or [])
            ],
        )

    @staticmethod
    def to_report_response(report: AnalysisReport) -> AnalysisReportResponse:
        return AnalysisReportResponse(
            id=str(report.id),
            organization_id=str(report.organization_id),
            project_id=str(report.project_id),
            user_id=str(report.user_id),
            agent_run_id=str(report.agent_run_id) if report.agent_run_id else None,
            title=report.title,
            workflow_type=report.workflow_type,
            report_json=report.report_json or {},
            report_markdown=report.report_markdown or "",
            evidence_references=report.evidence_references or [],
            created_at=report.created_at,
            updated_at=report.updated_at,
        )


def _parse_iso_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None
