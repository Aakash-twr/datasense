"""FastAPI router for Phase 6 multi-agent workflows, human approvals, and analytical reports."""

from __future__ import annotations

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

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
    AgentRunListResponse,
    AgentRunRejectRequest,
    AgentRunResponse,
    AgentRunResultsResponse,
    AgentRunStepResponse,
    AgentWorkspaceDashboardStats,
    AnalysisReportCreateRequest,
    AnalysisReportListResponse,
    AnalysisReportResponse,
)
from app.agents.services.workflow_service import WorkflowService
from app.api.deps import (
    OrganizationContext,
    get_authorized_project,
    get_current_organization,
    get_current_user,
    get_db,
    require_role,
)
from app.core.observability import is_shutting_down
from app.core.rate_limit import rate_limit_dep
from app.models.membership import MembershipRole
from app.models.project import Project
from app.models.user import User

router = APIRouter(tags=["Multi-Agent Analytics"])


def _parse_uuid(value: str, label: str = "ID") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label} format",
        ) from None


# -----------------------------------------------------------------------------
# Project Agent Workflows
# -----------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/ai/agent-runs",
    response_model=AgentRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit_dep("agent_run", "rate_limit_agent_per_minute"))],
)
def start_agent_run(
    payload: AgentRunCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
    project: Annotated[Project, Depends(get_authorized_project)],
) -> AgentRunResponse:
    """Starts an asynchronous LangGraph multi-agent workflow for a project."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    service = WorkflowService()
    try:
        run = service.create_run(db, user=current_user, project=project, payload=payload)
    except AgentWorkflowDisabledError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message) from None
    except AgentConcurrencyLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.message) from None
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    background_tasks.add_task(service.execute_run_background, run.id)
    return WorkflowService.to_run_response(run)


@router.get(
    "/projects/{project_id}/ai/agent-runs/stats",
    response_model=AgentWorkspaceDashboardStats,
)
def get_project_agent_stats(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentWorkspaceDashboardStats:
    """Returns real summary counts for the multi-agent workspace dashboard."""
    return WorkflowService.get_dashboard_stats(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
    )


@router.get(
    "/projects/{project_id}/ai/agent-runs",
    response_model=AgentRunListResponse,
)
def list_project_agent_runs(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    workflow_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AgentRunListResponse:
    """Lists multi-agent workflow runs inside a project."""
    items, total = WorkflowService.list_runs(
        db,
        project_id=project.id,
        organization_id=project.organization_id,
        status_filter=status_filter,
        workflow_type=workflow_type,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return AgentRunListResponse(
        items=[WorkflowService.to_run_response(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/projects/{project_id}/ai/agent-runs/{run_id}",
    response_model=AgentRunResponse,
)
def get_agent_run(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunResponse:
    """Fetches the current status, steps, and summary of a specific agent workflow run."""
    run_uuid = _parse_uuid(run_id, "run_id")
    try:
        run = WorkflowService.get_authorized_run(
            db, project_id=project.id, run_id=run_uuid, user_id=current_user.id
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_run_response(run)


@router.delete(
    "/projects/{project_id}/ai/agent-runs/{run_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_agent_run(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes an agent workflow run and cleans up its checkpoints."""
    run_uuid = _parse_uuid(run_id, "run_id")
    try:
        WorkflowService.delete_run(
            db, project_id=project.id, run_id=run_uuid, user_id=current_user.id
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None


@router.get(
    "/projects/{project_id}/ai/agent-runs/{run_id}/steps",
    response_model=list[AgentRunStepResponse],
)
def get_agent_run_steps(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AgentRunStepResponse]:
    """Returns ordered step timeline entries for a workflow run."""
    run_uuid = _parse_uuid(run_id, "run_id")
    try:
        run = WorkflowService.get_authorized_run(
            db, project_id=project.id, run_id=run_uuid, user_id=current_user.id
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_run_response(run).steps


@router.post(
    "/projects/{project_id}/ai/agent-runs/{run_id}/approve",
    response_model=AgentRunResponse,
    dependencies=[Depends(rate_limit_dep("agent_approve", "rate_limit_agent_per_minute"))],
)
def approve_agent_run(
    run_id: str,
    payload: AgentRunApproveRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunResponse:
    """Approves proposed SQL queries and resumes the checkpointed LangGraph workflow."""
    if is_shutting_down():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Server is shutting down")
    run_uuid = _parse_uuid(run_id, "run_id")
    service = WorkflowService()
    try:
        run = service.prepare_approval_resume(
            db,
            project_id=project.id,
            run_id=run_uuid,
            user_id=current_user.id,
            payload=payload,
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    except AgentApprovalError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from None

    background_tasks.add_task(
        service.resume_after_approval_background,
        run.id,
        approval_hash=payload.approval_hash,
        approved_query_indices=list(run.approved_query_indices),
        comment=payload.comment,
    )
    return WorkflowService.to_run_response(run)


@router.post(
    "/projects/{project_id}/ai/agent-runs/{run_id}/reject",
    response_model=AgentRunResponse,
)
def reject_agent_run(
    run_id: str,
    payload: AgentRunRejectRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunResponse:
    """Rejects proposed SQL execution and stops the workflow safely."""
    run_uuid = _parse_uuid(run_id, "run_id")
    service = WorkflowService()
    try:
        run = service.reject_run(
            db,
            project_id=project.id,
            run_id=run_uuid,
            user_id=current_user.id,
            reason=payload.reason,
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    except AgentApprovalError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from None
    return WorkflowService.to_run_response(run)


@router.post(
    "/projects/{project_id}/ai/agent-runs/{run_id}/cancel",
    response_model=AgentRunResponse,
)
def cancel_agent_run(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunResponse:
    """Cancels an active or awaiting-approval workflow run."""
    run_uuid = _parse_uuid(run_id, "run_id")
    service = WorkflowService()
    try:
        run = service.cancel_run(
            db,
            project_id=project.id,
            run_id=run_uuid,
            user_id=current_user.id,
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_run_response(run)


@router.get(
    "/projects/{project_id}/ai/agent-runs/{run_id}/results",
    response_model=AgentRunResultsResponse,
)
def get_agent_run_results(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunResultsResponse:
    """Returns consolidated findings, statistics, visualizations, evidence, and report draft."""
    run_uuid = _parse_uuid(run_id, "run_id")
    try:
        run = WorkflowService.get_authorized_run(
            db, project_id=project.id, run_id=run_uuid, user_id=current_user.id
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_results_response(run)


# -----------------------------------------------------------------------------
# Project Analytical Reports
# -----------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/ai/agent-runs/{run_id}/reports",
    response_model=AnalysisReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_report_from_run(
    run_id: str,
    payload: AnalysisReportCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalysisReportResponse:
    """Saves a generated analytical report from a completed agent workflow run."""
    run_uuid = _parse_uuid(run_id, "run_id")
    try:
        report = WorkflowService.save_report_from_run(
            db,
            project=project,
            user=current_user,
            run_id=run_uuid,
            custom_title=payload.title,
        )
    except AgentRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_report_response(report)


@router.get(
    "/projects/{project_id}/ai/reports",
    response_model=AnalysisReportListResponse,
)
def list_project_reports(
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AnalysisReportListResponse:
    """Lists saved analytical reports inside a project."""
    items, total = WorkflowService.list_reports(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return AnalysisReportListResponse(
        items=[WorkflowService.to_report_response(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/projects/{project_id}/ai/reports/{report_id}",
    response_model=AnalysisReportResponse,
)
def get_project_report(
    report_id: str,
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalysisReportResponse:
    """Fetches a saved analytical report inside a project."""
    rep_uuid = _parse_uuid(report_id, "report_id")
    try:
        report = WorkflowService.get_report(
            db,
            organization_id=project.organization_id,
            project_id=project.id,
            report_id=rep_uuid,
        )
    except AgentReportNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_report_response(report)


@router.delete(
    "/projects/{project_id}/ai/reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project_report(
    report_id: str,
    _role_check: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    project: Annotated[Project, Depends(get_authorized_project)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes a saved analytical report inside a project."""
    rep_uuid = _parse_uuid(report_id, "report_id")
    try:
        WorkflowService.delete_report(
            db,
            organization_id=project.organization_id,
            project_id=project.id,
            report_id=rep_uuid,
        )
    except AgentReportNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None


# -----------------------------------------------------------------------------
# Organization-Level Views (/agent-runs & /reports pages)
# -----------------------------------------------------------------------------


@router.get("/ai/agent-runs", response_model=AgentRunListResponse)
def list_org_agent_runs(
    org_ctx: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    workflow_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AgentRunListResponse:
    """Lists agent workflow runs across the active organization workspace."""
    items, total = WorkflowService.list_runs(
        db,
        organization_id=org_ctx.organization.id,
        status_filter=status_filter,
        workflow_type=workflow_type,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return AgentRunListResponse(
        items=[WorkflowService.to_run_response(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/ai/reports", response_model=AnalysisReportListResponse)
def list_org_reports(
    org_ctx: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> AnalysisReportListResponse:
    """Lists saved analytical reports across the active organization workspace."""
    items, total = WorkflowService.list_reports(
        db,
        organization_id=org_ctx.organization.id,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, math.ceil(total / page_size))
    return AnalysisReportListResponse(
        items=[WorkflowService.to_report_response(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/ai/reports/{report_id}", response_model=AnalysisReportResponse)
def get_org_report(
    report_id: str,
    org_ctx: Annotated[OrganizationContext, Depends(get_current_organization)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalysisReportResponse:
    """Fetches a saved analytical report inside the active organization."""
    rep_uuid = _parse_uuid(report_id, "report_id")
    try:
        report = WorkflowService.get_report(
            db,
            organization_id=org_ctx.organization.id,
            report_id=rep_uuid,
        )
    except AgentReportNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
    return WorkflowService.to_report_response(report)


@router.delete("/ai/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_org_report(
    report_id: str,
    org_ctx: Annotated[
        OrganizationContext,
        Depends(require_role([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.ANALYST])),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Deletes a saved analytical report inside the active organization."""
    rep_uuid = _parse_uuid(report_id, "report_id")
    try:
        WorkflowService.delete_report(
            db,
            organization_id=org_ctx.organization.id,
            report_id=rep_uuid,
        )
    except AgentReportNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None
