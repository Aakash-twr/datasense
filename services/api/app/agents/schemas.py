"""Pydantic v2 schemas for multi-agent workflows, agent outputs, and REST APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.agent_run import AgentWorkflowType

# -----------------------------------------------------------------------------
# Agent Internal Structured Output Schemas (Pydantic v2)
# -----------------------------------------------------------------------------


class PlannedTask(BaseModel):
    """Single task allocated by the Supervisor / Planning node."""

    task_id: str
    agent_name: str
    objective: str
    depends_on: list[str] = Field(default_factory=list)
    sql_focus: str | None = None


class SupervisorClassification(BaseModel):
    """Structured routing output from the Supervisor Agent."""

    workflow_type: AgentWorkflowType = Field(
        default=AgentWorkflowType.DEEP_ANALYSIS,
        description="Classified analytical workflow category",
    )
    selected_agents: list[str] = Field(
        default_factory=list,
        description="Ordered specialized agents required for this workflow",
    )
    rationale: str = Field(
        description="Brief rationale explaining why these agents were selected",
    )
    planned_tasks: list[PlannedTask] = Field(
        default_factory=list,
        description="Concrete step plan assigned to specialized agents",
    )
    requires_sql: bool = Field(
        default=True,
        description="Whether SQL queries must be generated and approved for this request",
    )


class CandidateRelationship(BaseModel):
    """Relationship between two tables identified from metadata."""

    left_table: str
    left_column: str
    right_table: str
    right_column: str
    relationship_type: Literal["verified", "inferred"] = "inferred"
    confidence: Literal["high", "medium", "low"] = "medium"
    rationale: str


class DiscoveredTableSummary(BaseModel):
    """Relevant table discovered for the analytical request."""

    dataset_id: str
    dataset_name: str
    table_name: str
    qualified_name: str
    row_count: int
    measures: list[str] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    date_columns: list[str] = Field(default_factory=list)
    pii_columns: list[str] = Field(default_factory=list)


class DataDiscoveryOutput(BaseModel):
    """Structured output of the Data Discovery Agent."""

    sufficient_data: bool = True
    sufficiency_reason: str = "Selected datasets contain relevant measures and dimensions."
    relevant_tables: list[DiscoveredTableSummary] = Field(default_factory=list)
    relationships: list[CandidateRelationship] = Field(default_factory=list)
    recommended_metrics: list[str] = Field(default_factory=list)


class DataQualityFinding(BaseModel):
    """Evidence-backed data quality observation."""

    title: str
    description: str
    severity: Literal["high", "medium", "low", "info"] = "medium"
    affected_table: str
    affected_column: str | None = None
    evidence: str
    recommended_action: str
    confidence: Literal["high", "medium", "low"] = "high"


class DataQualityOutput(BaseModel):
    """Structured output of the Data Quality Agent."""

    overall_health: Literal["good", "warning", "critical"] = "good"
    total_issues: int = 0
    findings: list[DataQualityFinding] = Field(default_factory=list)
    summary: str = ""


class SQLDraftItem(BaseModel):
    """Single SQL draft prepared by the SQL Analyst Agent."""

    query_index: int
    title: str
    purpose: str
    sql: str
    tables_referenced: list[str] = Field(default_factory=list)
    datasets_involved: list[str] = Field(default_factory=list)
    validation_status: Literal["valid", "repaired", "invalid"] = "valid"
    validation_error: str | None = None
    explanation: str | None = None


class MetricStatistic(BaseModel):
    """Deterministic statistical calculation from DuckDB/Polars."""

    metric_name: str
    table_or_query: str
    column_name: str
    count: int = 0
    sum_value: float | None = None
    mean: float | None = None
    median: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    std_dev: float | None = None
    variance: float | None = None
    q25: float | None = None
    q75: float | None = None
    iqr: float | None = None
    growth_rate_pct: float | None = None
    period_comparison: str | None = None
    evidence_reference: str


class AnomalyIndicator(BaseModel):
    """Deterministic statistical outlier or deviation indicator."""

    metric_name: str
    method: Literal["iqr", "z_score", "rolling_deviation", "period_change"]
    label: str
    observed_value: float
    expected_range: str
    severity: Literal["high", "medium", "low"] = "medium"
    note: str
    evidence_reference: str


class StatisticalAnalysisOutput(BaseModel):
    """Structured output of the Statistical Analyst Agent."""

    metrics: list[MetricStatistic] = Field(default_factory=list)
    rankings: list[dict[str, Any]] = Field(default_factory=list)
    correlations: list[dict[str, Any]] = Field(default_factory=list)
    anomalies: list[AnomalyIndicator] = Field(default_factory=list)
    summary: str = ""


class VisualizationSpec(BaseModel):
    """Structured chart specification produced by Visualization Agent."""

    chart_id: str
    title: str
    chart_type: Literal["bar", "line", "pie", "area", "scatter", "histogram", "boxplot"]
    x_axis: str
    y_axis: str
    x_label: str | None = None
    y_label: str | None = None
    description: str | None = None
    artifact_id: str | None = None
    query_run_id: str | None = None
    columns: list[dict[str, str]] = Field(default_factory=list)
    data_preview: list[dict[str, Any]] = Field(default_factory=list)


class VisualizationOutput(BaseModel):
    """Structured output of the Visualization Agent."""

    charts: list[VisualizationSpec] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class InsightFinding(BaseModel):
    """Single observation or labeled hypothesis produced by Insight Agent."""

    title: str
    finding_type: Literal["evidence_backed", "hypothesis"] = "evidence_backed"
    summary: str
    business_impact: str | None = None
    evidence_references: list[str] = Field(default_factory=list)
    recommended_follow_up: str | None = None


class InsightOutput(BaseModel):
    """Structured output of the Insight Agent."""

    executive_takeaway: str
    findings: list[InsightFinding] = Field(default_factory=list)
    hypotheses: list[InsightFinding] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)


class ReportContent(BaseModel):
    """Complete 11-section structured analytical report."""

    title: str
    executive_summary: str
    datasets_analyzed: list[str] = Field(default_factory=list)
    analytical_objectives: list[str] = Field(default_factory=list)
    key_findings: list[str] = Field(default_factory=list)
    statistical_analysis: list[str] = Field(default_factory=list)
    data_quality_observations: list[str] = Field(default_factory=list)
    trends_and_comparisons: list[str] = Field(default_factory=list)
    recommended_visualizations: list[str] = Field(default_factory=list)
    business_recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    supporting_evidence: list[dict[str, str]] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# FastAPI Request & Response Schemas
# -----------------------------------------------------------------------------


class AgentRunCreateRequest(BaseModel):
    """Request payload to start a multi-agent workflow run."""

    conversation_id: str | None = None
    request: str = Field(min_length=2, max_length=4000)
    dataset_ids: list[str] = Field(default_factory=list)
    workflow_type: str | None = None
    share_aggregate_summaries_with_gemini: bool = False


class AgentRunApproveRequest(BaseModel):
    """Request payload to approve proposed SQL queries and resume workflow."""

    approval_hash: str
    approved_query_indices: list[int] | None = None
    comment: str | None = None


class AgentRunRejectRequest(BaseModel):
    """Request payload to reject proposed SQL execution."""

    reason: str | None = None


class AgentRunStepResponse(BaseModel):
    """Step timeline item returned to frontend."""

    id: str
    agent_name: str
    step_name: str
    status: str
    sequence_order: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    input_summary: dict[str, Any] | None = None
    output_summary: dict[str, Any] | None = None
    error_message: str | None = None


class AgentRunEvidenceResponse(BaseModel):
    """Evidence citation returned to frontend."""

    id: str
    query_run_id: str | None = None
    dataset_id: str | None = None
    dataset_version_id: str | None = None
    evidence_type: str
    evidence_reference: str
    description: str
    created_at: datetime


class AgentRunResponse(BaseModel):
    """Full status and summary of an agent workflow run."""

    id: str
    organization_id: str
    project_id: str
    user_id: str
    conversation_id: str | None = None
    workflow_type: str
    user_request: str
    selected_dataset_ids: list[str]
    dataset_version_snapshot: dict[str, str]
    share_aggregate_summaries: bool
    status: str
    current_step: str | None = None
    approval_status: str
    approval_hash: str | None = None
    approval_payload: dict[str, Any] | None = None
    approved_query_indices: list[int] = Field(default_factory=list)
    llm_calls_count: int = 0
    sql_queries_count: int = 0
    token_usage: dict[str, Any] | None = None
    result_summary: dict[str, Any] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    error_code: str | None = None
    error_summary: str | None = None
    created_at: datetime
    updated_at: datetime
    steps: list[AgentRunStepResponse] = Field(default_factory=list)
    evidence_items: list[AgentRunEvidenceResponse] = Field(default_factory=list)


class AgentRunListResponse(BaseModel):
    """Paginated list of agent workflow runs."""

    items: list[AgentRunResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AgentRunResultsResponse(BaseModel):
    """Complete structured results, artifacts preview, findings, charts, and report draft."""

    run_id: str
    status: str
    workflow_type: str
    discovery: dict[str, Any] | None = None
    data_quality: dict[str, Any] | None = None
    sql_drafts: list[dict[str, Any]] = Field(default_factory=list)
    executed_queries: list[dict[str, Any]] = Field(default_factory=list)
    statistical_analysis: dict[str, Any] | None = None
    visualizations: dict[str, Any] | None = None
    insights: dict[str, Any] | None = None
    report: dict[str, Any] | None = None
    report_markdown: str | None = None
    evidence: list[AgentRunEvidenceResponse] = Field(default_factory=list)


class AnalysisReportCreateRequest(BaseModel):
    """Request payload to save a generated report."""

    title: str | None = None


class AnalysisReportResponse(BaseModel):
    """Saved analytical report representation."""

    id: str
    organization_id: str
    project_id: str
    user_id: str
    agent_run_id: str | None = None
    title: str
    workflow_type: str
    report_json: dict[str, Any]
    report_markdown: str
    evidence_references: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AnalysisReportListResponse(BaseModel):
    """Paginated list of saved analytical reports."""

    items: list[AnalysisReportResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AgentWorkspaceDashboardStats(BaseModel):
    """Summary counts for the multi-agent workspace dashboard."""

    total_runs: int
    completed_analyses: int
    awaiting_approval: int
    saved_reports: int
    failed_or_cancelled: int
