import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MultiAgentWorkspacePage } from '@/pages/agents/MultiAgentWorkspacePage'
import { apiService } from '@/services/api'
import type {
  AgentRunItem,
  AgentRunResultsResponse,
  AgentWorkspaceDashboardStats,
  CatalogResponse,
} from '@/types'

vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
    },
    analytics: {
      getCatalog: vi.fn(),
    },
    agents: {
      startRun: vi.fn(),
      getStats: vi.fn(),
      listRuns: vi.fn(),
      listOrgRuns: vi.fn(),
      getRun: vi.fn(),
      deleteRun: vi.fn(),
      getSteps: vi.fn(),
      approveRun: vi.fn(),
      rejectRun: vi.fn(),
      cancelRun: vi.fn(),
      getResults: vi.fn(),
    },
    reports: {
      saveFromRun: vi.fn(),
      listProjectReports: vi.fn(),
      listOrgReports: vi.fn(),
      getOrgReport: vi.fn(),
      deleteOrgReport: vi.fn(),
    },
  },
}))

describe('Stage 5 — Multi-Agent Analytics & Workflow Approval UI', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Enterprise Finance',
      slug: 'enterprise-finance',
      description: 'Finance workspace',
      organization_id: 'org-1',
      settings: {},
      created_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]

  const mockCatalog: CatalogResponse = {
    datasets: [
      {
        dataset_id: 'ds-1',
        dataset_name: 'Revenue Ledger',
        schema_name: 'revenue_ledger',
        version_id: 'ver-1',
        version_number: 1,
        source_format: 'parquet',
        tables: [
          {
            table_name: 'invoices',
            schema_name: 'revenue_ledger',
            qualified_name: 'revenue_ledger.invoices',
            display_name: 'invoices',
            row_count: 5000,
            column_count: 4,
            columns: [],
          },
        ],
      },
    ],
  }

  const mockStats: AgentWorkspaceDashboardStats = {
    total_runs: 5,
    completed_analyses: 3,
    awaiting_approval: 1,
    saved_reports: 2,
    failed_or_cancelled: 1,
  }

  const mockAwaitingRun: AgentRunItem = {
    id: 'run-await-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    conversation_id: null,
    workflow_type: 'deep_analysis',
    user_request: 'Audit invoice revenue by region and flag outliers',
    selected_dataset_ids: ['ds-1'],
    dataset_version_snapshot: { 'ds-1': 'ver-1' },
    share_aggregate_summaries: false,
    status: 'awaiting_approval',
    current_step: 'Human SQL Approval',
    approval_status: 'pending',
    approval_hash: 'hash_9876543210fedcba',
    approval_payload: {
      run_id: 'run-await-1',
      approval_hash: 'hash_9876543210fedcba',
      estimated_queries: 1,
      queries: [
        {
          query_index: 0,
          title: 'Regional Invoice Totals',
          purpose: 'Aggregates total invoiced USD per region',
          sql: 'SELECT region, SUM(total_usd) AS rev FROM revenue_ledger.invoices GROUP BY region',
          tables_referenced: ['revenue_ledger.invoices'],
          datasets_involved: ['Revenue Ledger'],
          validation_status: 'valid',
        },
      ],
    },
    approved_query_indices: [],
    llm_calls_count: 3,
    sql_queries_count: 1,
    created_at: '2026-01-02T10:00:00Z',
    updated_at: '2026-01-02T10:01:00Z',
    steps: [
      {
        id: 's1',
        agent_name: 'Supervisor',
        step_name: 'Classification & Planning',
        status: 'completed',
        sequence_order: 0,
        started_at: '2026-01-02T10:00:01Z',
        completed_at: '2026-01-02T10:00:02Z',
        duration_ms: 840,
        input_summary: { user_request: 'Audit invoice revenue', api_key: 'should-be-redacted' },
        output_summary: { selected_mode: 'deep_analysis', raw_rows: ['secret_row'] },
      },
      {
        id: 's2',
        agent_name: 'Data Discovery',
        step_name: 'Schema Mapping',
        status: 'completed',
        sequence_order: 1,
        duration_ms: 120,
        output_summary: { tables_found: 1 },
      },
      {
        id: 's3',
        agent_name: 'Data Quality',
        step_name: 'Profiling Check',
        status: 'failed',
        sequence_order: 2,
        duration_ms: 65,
        error_message: 'Missing partition metadata on staging snapshot',
      },
      {
        id: 's4',
        agent_name: 'Approval Gate',
        step_name: 'Awaiting Human SQL Approval',
        status: 'awaiting_approval',
        sequence_order: 3,
      },
    ],
    evidence_items: [],
  }

  const mockCompletedRun: AgentRunItem = {
    ...mockAwaitingRun,
    id: 'run-comp-2',
    user_request: 'Executive Q4 Profitability Report',
    status: 'completed',
    approval_status: 'approved',
    current_step: 'Completed',
    steps: [
      {
        id: 'sc1',
        agent_name: 'Supervisor',
        step_name: 'Planning',
        status: 'completed',
        sequence_order: 0,
        duration_ms: 400,
      },
    ],
  }

  const mockResults: AgentRunResultsResponse = {
    run_id: 'run-await-1',
    status: 'completed',
    workflow_type: 'deep_analysis',
    discovery: {
      sufficient_data: true,
      sufficiency_reason: 'Mapped revenue_ledger.invoices cleanly.',
      relevant_tables: [
        {
          dataset_id: 'ds-1',
          dataset_name: 'Revenue Ledger',
          table_name: 'invoices',
          qualified_name: 'revenue_ledger.invoices',
          row_count: 5000,
          measures: ['total_usd'],
          dimensions: ['region'],
          date_columns: [],
          pii_columns: ['customer_email'],
        },
      ],
      relationships: [],
      recommended_metrics: ['SUM(total_usd)'],
    },
    data_quality: null,
    sql_drafts: [],
    executed_queries: [],
    statistical_analysis: null,
    visualizations: {
      charts: [
        {
          chart_id: 'vis-1',
          title: 'Revenue by Region',
          chart_type: 'bar',
          x_axis: 'region',
          y_axis: 'rev',
          columns: [
            { name: 'region', type: 'VARCHAR' },
            { name: 'rev', type: 'DOUBLE' },
          ],
          data_preview: [{ region: 'NA', rev: 90000 }],
        },
      ],
      notes: [],
    },
    insights: {
      executive_takeaway: 'North America drives majority revenue.',
      findings: [],
      hypotheses: [],
      follow_up_questions: [],
    },
    report: {
      title: 'Regional Revenue Audit',
      executive_summary: 'North America leads Q4 invoiced total.',
      datasets_analyzed: ['Revenue Ledger (v1)'],
      analytical_objectives: ['Audit regional totals'],
      key_findings: ['NA = $90,000'],
      statistical_analysis: [],
      data_quality_observations: [],
      trends_and_comparisons: [],
      recommended_visualizations: ['Revenue by Region'],
      business_recommendations: ['Monitor EMEA variance'],
      limitations: [],
      supporting_evidence: [],
    },
    report_markdown: '# Regional Revenue Audit\n',
    evidence: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: mockProjects,
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })
    vi.mocked(apiService.analytics.getCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(apiService.agents.getStats).mockResolvedValue(mockStats)
    vi.mocked(apiService.agents.listRuns).mockResolvedValue({
      items: [mockAwaitingRun, mockCompletedRun],
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    vi.mocked(apiService.agents.getResults).mockResolvedValue(mockResults)
  })

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/agent-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
          <Route path="/reports" element={<div>Saved Reports Hub</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('renders 8 connected workflow nodes, opens sanitized dark detail inspector on node & timeline clicks', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Agent workflow graph')).toBeInTheDocument()
    })

    const graph = screen.getByLabelText('Agent workflow graph')
    expect(within(graph).getByText('Supervisor')).toBeInTheDocument()
    expect(within(graph).getByText('Data Discovery')).toBeInTheDocument()
    expect(within(graph).getByText('Data Quality')).toBeInTheDocument()
    expect(within(graph).getByText('SQL Analyst')).toBeInTheDocument()
    expect(within(graph).getByText('Statistical Analyst')).toBeInTheDocument()
    expect(within(graph).getByText('Visualization')).toBeInTheDocument()
    expect(within(graph).getByText('Insight')).toBeInTheDocument()
    expect(within(graph).getByText('Report Generation')).toBeInTheDocument()

    // Click Supervisor node -> detail panel displays sanitized metadata & redacts secrets/raw_rows
    fireEvent.click(within(graph).getByRole('button', { name: /Supervisor/i }))
    const detailPanel = screen.getByLabelText('Agent details panel')
    expect(within(detailPanel).getByText('Orchestrator & Planner')).toBeInTheDocument()
    expect(within(detailPanel).getAllByText('[Redacted]').length).toBe(2)
    expect(within(detailPanel).queryByText('should-be-redacted')).not.toBeInTheDocument()

    // Click failed Data Quality step in timeline -> detail panel shows error message
    const timeline = screen.getByLabelText('Workflow execution timeline')
    fireEvent.click(within(timeline).getByText(/Profiling Check/i))
    expect(
      within(screen.getByLabelText('Agent details panel')).getByText(
        'Missing partition metadata on staging snapshot',
      ),
    ).toBeInTheDocument()
  })

  it('supports approval confirmation dialog, workflow cancellation, visualization recommendations, and opening Reports', async () => {
    vi.mocked(apiService.agents.approveRun).mockResolvedValueOnce(mockCompletedRun)
    vi.mocked(apiService.agents.cancelRun).mockResolvedValueOnce({
      ...mockAwaitingRun,
      status: 'cancelled',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText('Workflow SQL execution approval gate')).toBeInTheDocument()
    })

    // Approval confirmation dialog opens on Approve & Run; dismissing does not execute
    fireEvent.click(screen.getByRole('button', { name: /Approve & Run/i }))
    expect(screen.getByText('Confirm SQL Execution Approval')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Review Queries/i }))
    expect(apiService.agents.approveRun).not.toHaveBeenCalled()

    // Confirming triggers approveRun with exact hash & selected index
    fireEvent.click(screen.getByRole('button', { name: /Approve & Run/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Execute/i }))
    await waitFor(() => {
      expect(apiService.agents.approveRun).toHaveBeenCalledWith('proj-1', 'run-await-1', {
        approval_hash: 'hash_9876543210fedcba',
        approved_query_indices: [0],
        comment: undefined,
      })
    })

    // Findings Visualization Recommendations tab works
    fireEvent.click(screen.getByRole('button', { name: /Visualization Recommendations/i }))
    expect(screen.getByText(/X: region · Y: rev/i)).toBeInTheDocument()

    // Queue filter narrows recent runs cleanly
    const historySection = screen.getByLabelText('Recent multi-agent workflows')
    fireEvent.click(within(historySection).getByRole('button', { name: 'Completed' }))
    expect(within(historySection).getByText('Executive Q4 Profitability Report')).toBeInTheDocument()
    expect(
      within(historySection).queryByText('Audit invoice revenue by region and flag outliers'),
    ).not.toBeInTheDocument()

    // Can navigate to Reports via Open Reports link inside ReportViewer
    fireEvent.click(screen.getByRole('link', { name: /Open Reports/i }))
    await waitFor(() => {
      expect(screen.getByText('Saved Reports Hub')).toBeInTheDocument()
    })
  })

  it('triggers cancel workflow when Cancel Workflow is clicked in ApprovalPanel', async () => {
    vi.mocked(apiService.agents.cancelRun).mockResolvedValueOnce({
      ...mockAwaitingRun,
      status: 'cancelled',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel Workflow/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Cancel Workflow/i }))

    await waitFor(() => {
      expect(apiService.agents.cancelRun).toHaveBeenCalledWith('proj-1', 'run-await-1')
    })
  })
})
