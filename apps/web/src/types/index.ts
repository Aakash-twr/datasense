/** Shared TypeScript types used across the application. */

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string
  service: string
  version: string
  environment: string
  timestamp: string
  python_version: string
  database?: string
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

// ---------------------------------------------------------------------------
// Auth & User
// ---------------------------------------------------------------------------

export interface User {
  id: string
  name: string
  email: string
  avatar_url?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CurrentMembership {
  organization_id: string
  organization_name: string
  organization_slug: string
  role: 'owner' | 'admin' | 'analyst' | 'viewer'
}

export interface AuthMeResponse {
  user: User
  current_organization: CurrentMembership | null
  organizations: CurrentMembership[]
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface OrganizationWithRole {
  id: string
  name: string
  slug: string
  owner_id: string
  created_at: string
  updated_at: string
  role: 'owner' | 'admin' | 'analyst' | 'viewer'
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  id: string
  organization_id: string
  name: string
  description?: string | null
  created_by?: string | null
  settings: Record<string, unknown>
  archived_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectListResponse {
  items: Project[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ApiError {
  detail: string
  status?: number
}

// ---------------------------------------------------------------------------
// Datasets & Ingestion
// ---------------------------------------------------------------------------

export type DatasetStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'archived'
export type DatasetSourceType = 'csv' | 'excel' | 'json' | 'parquet'

export interface DatasetVersionSummary {
  id: string
  version_number: number
  checksum: string
  file_size_bytes: number
  total_row_count: number
  total_column_count: number
  status: 'processing' | 'ready' | 'failed'
  created_at: string
  is_active: boolean
}

export interface Dataset {
  id: string
  project_id: string
  name: string
  description?: string | null
  source_type: DatasetSourceType
  original_filename: string
  status: DatasetStatus
  active_version_id?: string | null
  archived_at?: string | null
  created_at: string
  updated_at: string
  active_version?: DatasetVersionSummary | null
}

export interface DatasetListResponse {
  items: Dataset[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface IngestionJob {
  id: string
  dataset_id: string
  dataset_version_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  current_stage?: string | null
  progress_percentage: number
  status_message?: string | null
  error_code?: string | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface DatasetUploadResponse {
  dataset_id: string
  version_id: string
  job_id: string
  status: string
  message: string
}

export interface DatasetStatusResponse {
  dataset_id: string
  status: DatasetStatus
  active_version_id?: string | null
  job?: IngestionJob | null
}

export interface DataColumn {
  id: string
  column_name: string
  physical_name: string
  data_type: string
  ordinal_position: number
  nullable: boolean
  unique_count?: number | null
  null_count?: number | null
  null_percentage?: number | null
  semantic_type?: string | null
  pii_category?: string | null
  pii_confidence?: number | null
  description?: string | null
  profile_stats: Record<string, unknown>
}

export interface DataTable {
  id: string
  table_name: string
  original_table_name: string
  row_count: number
  column_count: number
  description?: string | null
  columns: DataColumn[]
}

export interface DatasetSchemaResponse {
  dataset_id: string
  version_id: string
  version_number: number
  tables: DataTable[]
}

export interface QualityWarningItem {
  severity: 'critical' | 'warning' | 'info'
  code: string
  column?: string | null
  message: string
  affected_rows?: number | null
}

export interface DatasetProfileResponse {
  dataset_id: string
  version_id: string
  table_id?: string | null
  table_name?: string | null
  table_stats: Record<string, unknown>
  column_stats: Record<string, Record<string, unknown>>
  quality_warnings: QualityWarningItem[]
}

export interface DatasetPreviewResponse {
  dataset_id: string
  version_id: string
  table_id: string
  table_name: string
  columns: string[]
  column_types: Record<string, string>
  rows: Record<string, unknown>[]
  total_rows: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Phase 4: Analytical Engine & SQL Workspace Types
// ---------------------------------------------------------------------------

export interface CatalogTableColumn {
  name: string
  display_name: string
  data_type: string
  canonical_type: string
  is_nullable: boolean
  is_sensitive: boolean
  sensitivity_category?: string | null
}

export interface CatalogTable {
  table_name: string
  schema_name: string
  qualified_name: string
  display_name: string
  row_count: number
  column_count: number
  columns: CatalogTableColumn[]
}

export interface CatalogDataset {
  dataset_id: string
  dataset_name: string
  schema_name: string
  version_id: string
  version_number: number
  source_format: string
  tables: CatalogTable[]
}

export interface CatalogResponse {
  datasets: CatalogDataset[]
}

export interface QueryValidationRequest {
  sql: string
  dataset_ids: string[]
}

export interface QueryValidationResponse {
  is_valid: boolean
  error?: string | null
  tables_referenced: string[]
  suggested_fixes?: string[]
}

export interface QueryExecutionRequest {
  sql: string
  dataset_ids: string[]
  limit?: number
}

export interface QueryColumn {
  name: string
  type: string
}

export interface QueryExecutionResponse {
  query_id: string
  status: string
  columns: QueryColumn[]
  rows: (string | number | boolean | null)[][]
  row_count: number
  truncated: boolean
  execution_time_ms: number
  error_message?: string | null
}

export interface QueryRunResponse {
  id: string
  organization_id: string
  project_id: string
  user_id: string
  sql_query: string
  selected_dataset_ids: string[]
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  execution_time_ms?: number | null
  returned_row_count?: number | null
  error_summary?: string | null
  created_at: string
}

export interface QueryHistoryListResponse {
  items: QueryRunResponse[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface SavedQueryCreate {
  name: string
  description?: string | null
  sql_query: string
  selected_dataset_ids: string[]
}

export interface SavedQueryUpdate {
  name?: string
  description?: string | null
  sql_query?: string
  selected_dataset_ids?: string[]
}

export interface SavedQueryResponse {
  id: string
  organization_id: string
  project_id: string
  user_id: string
  name: string
  description?: string | null
  sql_query: string
  selected_dataset_ids: string[]
  created_at: string
  updated_at: string
}

export interface SavedQueryListResponse {
  items: SavedQueryResponse[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ---------------------------------------------------------------------------
// Phase 5: AI Analytics Copilot Types
// ---------------------------------------------------------------------------

export type AIResponseType =
  | 'conversational'
  | 'sql_query'
  | 'clarification'
  | 'explanation'
  | 'unsupported'

export interface AIVisualizationRecommendation {
  chart_type: 'bar' | 'line' | 'pie'
  x_axis: string
  y_axis: string
  title?: string | null
}

export interface AIMessageStructuredMetadata {
  response_type: AIResponseType
  assumptions?: string[]
  requires_clarification?: boolean
  clarification_question?: string | null
  visualization_recommendation?: AIVisualizationRecommendation | null
  suggested_follow_up_questions?: string[]
}

export interface AIMessageItem {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  structured_metadata?: AIMessageStructuredMetadata | null
  generated_sql?: string | null
  sql_explanation?: string | null
  sql_validation_status?: 'valid' | 'repaired' | 'invalid' | null
  created_at: string
}

export interface AIConversationDetails {
  id: string
  organization_id: string
  project_id: string
  user_id: string
  title: string
  selected_dataset_ids: string[]
  created_at: string
  updated_at: string
  messages: AIMessageItem[]
}

export interface AIConversationListItem {
  id: string
  title: string
  selected_dataset_ids: string[]
  created_at: string
  updated_at: string
  message_count: number
}

export interface AIConversationListResponse {
  items: AIConversationListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AIStatusResponse {
  enabled: boolean
  configured: boolean
  model: string
  available: boolean
  privacy_acknowledged: boolean
  message: string
}

export interface AIInsightItem {
  title: string
  description: string
  category: string
  suggested_question: string
  suggested_sql?: string | null
}

export interface AIInsightResponse {
  dataset_id: string
  dataset_name: string
  insights: AIInsightItem[]
}

export interface AISQLExplanationResponse {
  explanation: string
  accessed_tables: string[]
  applied_filters: string[]
  aggregations_and_calculations: string[]
  suggested_improvements: string[]
  improved_sql?: string | null
}

// ---------------------------------------------------------------------------
// Phase 6: Multi-Agent Architecture & Advanced Analytics Types
// ---------------------------------------------------------------------------

export type AgentWorkflowStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'cancelled'

export type AgentWorkflowType =
  | 'simple_question'
  | 'data_discovery'
  | 'data_quality_audit'
  | 'descriptive_analysis'
  | 'trend_analysis'
  | 'comparative_analysis'
  | 'anomaly_investigation'
  | 'visualization'
  | 'deep_analysis'
  | 'report_generation'

export interface AgentRunStepItem {
  id: string
  agent_name: string
  step_name: string
  status: string
  sequence_order: number
  started_at?: string | null
  completed_at?: string | null
  duration_ms?: number | null
  input_summary?: Record<string, unknown> | null
  output_summary?: Record<string, unknown> | null
  error_message?: string | null
}

export interface AgentRunEvidenceItem {
  id: string
  query_run_id?: string | null
  dataset_id?: string | null
  dataset_version_id?: string | null
  evidence_type: string
  evidence_reference: string
  description: string
  created_at: string
}

export interface ApprovalQueryProposal {
  query_index: number
  title: string
  purpose: string
  sql: string
  tables_referenced: string[]
  datasets_involved: string[]
  validation_status: string
}

export interface AgentRunItem {
  id: string
  organization_id: string
  project_id: string
  user_id: string
  conversation_id?: string | null
  workflow_type: string
  user_request: string
  selected_dataset_ids: string[]
  dataset_version_snapshot: Record<string, string>
  share_aggregate_summaries: boolean
  status: AgentWorkflowStatus
  current_step?: string | null
  approval_status: string
  approval_hash?: string | null
  approval_payload?: {
    run_id?: string
    approval_hash?: string
    estimated_queries?: number
    queries?: ApprovalQueryProposal[]
  } | null
  approved_query_indices: number[]
  llm_calls_count: number
  sql_queries_count: number
  token_usage?: Record<string, unknown> | null
  result_summary?: Record<string, unknown> | null
  started_at?: string | null
  completed_at?: string | null
  duration_ms?: number | null
  error_code?: string | null
  error_summary?: string | null
  created_at: string
  updated_at: string
  steps: AgentRunStepItem[]
  evidence_items: AgentRunEvidenceItem[]
}

export interface AgentRunListResponse {
  items: AgentRunItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AgentWorkspaceDashboardStats {
  total_runs: number
  completed_analyses: number
  awaiting_approval: number
  saved_reports: number
  failed_or_cancelled: number
}

export interface AgentVisualizationSpec {
  chart_id: string
  title: string
  chart_type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'histogram' | 'boxplot'
  x_axis: string
  y_axis: string
  x_label?: string | null
  y_label?: string | null
  description?: string | null
  artifact_id?: string | null
  query_run_id?: string | null
  columns: { name: string; type: string }[]
  data_preview: Record<string, unknown>[]
}

export interface AgentRunResultsResponse {
  run_id: string
  status: string
  workflow_type: string
  discovery?: {
    sufficient_data: boolean
    sufficiency_reason: string
    relevant_tables: {
      dataset_id: string
      dataset_name: string
      table_name: string
      qualified_name: string
      row_count: number
      measures: string[]
      dimensions: string[]
      date_columns: string[]
      pii_columns: string[]
    }[]
    relationships: {
      left_table: string
      left_column: string
      right_table: string
      right_column: string
      relationship_type: 'verified' | 'inferred'
      confidence: string
      rationale: string
    }[]
    recommended_metrics: string[]
  } | null
  data_quality?: {
    overall_health: 'good' | 'warning' | 'critical'
    total_issues: number
    summary: string
    findings: {
      title: string
      description: string
      severity: 'high' | 'medium' | 'low' | 'info'
      affected_table: string
      affected_column?: string | null
      evidence: string
      recommended_action: string
      confidence: string
    }[]
  } | null
  sql_drafts: {
    query_index: number
    title: string
    purpose: string
    sql: string
    tables_referenced: string[]
    datasets_involved: string[]
    validation_status: string
    validation_error?: string | null
    explanation?: string | null
  }[]
  executed_queries: {
    query_index: number
    title: string
    query_run_id?: string
    artifact_id?: string
    sql: string
    row_count?: number
    execution_time_ms?: number
    status: string
    error_message?: string
  }[]
  statistical_analysis?: {
    summary: string
    metrics: {
      metric_name: string
      table_or_query: string
      column_name: string
      count: number
      sum_value?: number | null
      mean?: number | null
      median?: number | null
      min_value?: number | null
      max_value?: number | null
      std_dev?: number | null
      variance?: number | null
      q25?: number | null
      q75?: number | null
      iqr?: number | null
      growth_rate_pct?: number | null
      period_comparison?: string | null
      evidence_reference: string
    }[]
    rankings: {
      dimension: string
      metric: string
      evidence_reference: string
      top_items: { label: string; value: number; share_pct?: number | null }[]
    }[]
    correlations: {
      column_a: string
      column_b: string
      pearson_r: number
      sample_size: number
      evidence_reference: string
      note: string
    }[]
    anomalies: {
      metric_name: string
      method: string
      label: string
      observed_value: number
      expected_range: string
      severity: string
      note: string
      evidence_reference: string
    }[]
  } | null
  visualizations?: {
    charts: AgentVisualizationSpec[]
    notes: string[]
  } | null
  insights?: {
    executive_takeaway: string
    findings: {
      title: string
      finding_type: string
      summary: string
      business_impact?: string | null
      evidence_references: string[]
      recommended_follow_up?: string | null
    }[]
    hypotheses: {
      title: string
      finding_type: string
      summary: string
      evidence_references: string[]
    }[]
    follow_up_questions: string[]
  } | null
  report?: {
    title: string
    executive_summary: string
    datasets_analyzed: string[]
    analytical_objectives: string[]
    key_findings: string[]
    statistical_analysis: string[]
    data_quality_observations: string[]
    trends_and_comparisons: string[]
    recommended_visualizations: string[]
    business_recommendations: string[]
    limitations: string[]
    supporting_evidence: { evidence_type: string; evidence_reference: string; description: string }[]
  } | null
  report_markdown?: string | null
  evidence: AgentRunEvidenceItem[]
}

export interface AnalysisReportItem {
  id: string
  organization_id: string
  project_id: string
  user_id: string
  agent_run_id?: string | null
  title: string
  workflow_type: string
  report_json: NonNullable<AgentRunResultsResponse['report']>
  report_markdown: string
  evidence_references: { id?: string; evidence_type: string; evidence_reference: string; description: string }[]
  created_at: string
  updated_at: string
}

export interface AnalysisReportListResponse {
  items: AnalysisReportItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AdminObservabilityResponse {
  timestamp: string
  environment: string
  version: string
  shutting_down: boolean
  dependencies: {
    database: string
    duckdb: string
    storage: string
    ai_configured: boolean
    ai_model: string
  }
  database_pool: {
    dialect: string
    pool_size?: number
    checked_out?: number
    overflow?: number
  }
  metrics: {
    total_http_requests: number
    http_5xx_errors: number
    avg_http_latency_ms: number
    rate_limit_rejections: number
    query_executions: number
    query_failures: number
    ingestion_failures: number
    gemini_errors: number
    recent_errors: {
      timestamp: string
      request_id: string
      route: string
      code: string
      detail: string
    }[]
  }
  agent_runs_by_status: Record<string, number>
  ingestion_jobs_by_status: Record<string, number>
}

