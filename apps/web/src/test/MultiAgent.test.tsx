import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MultiAgentWorkspacePage } from '@/pages/agents/MultiAgentWorkspacePage'
import { ReportsPage } from '@/pages/agents/ReportsPage'
import { AgentRunsPage } from '@/pages/agents/AgentRunsPage'
import { apiService } from '@/services/api'
import type {
  AgentRunItem,
  AgentRunResultsResponse,
  AgentWorkspaceDashboardStats,
  AnalysisReportItem,
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

describe('Phase 6 Multi-Agent Analytics Workspace', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Enterprise Sales',
      slug: 'enterprise-sales',
      description: 'Test project',
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
        dataset_name: 'Sales 2026',
        schema_name: 'sales_2026',
        version_id: 'ver-1',
        version_number: 1,
        source_format: 'csv',
        tables: [
          {
            table_name: 'orders',
            schema_name: 'sales_2026',
            qualified_name: 'sales_2026.orders',
            display_name: 'orders',
            row_count: 1000,
            column_count: 3,
            columns: [],
          },
        ],
      },
    ],
  }

  const mockStats: AgentWorkspaceDashboardStats = {
    total_runs: 4,
    completed_analyses: 2,
    awaiting_approval: 1,
    saved_reports: 3,
    failed_or_cancelled: 1,
  }

  const mockAwaitingRun: AgentRunItem = {
    id: 'run-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    conversation_id: null,
    workflow_type: 'deep_analysis',
    user_request: 'Analyze my complete sales dataset.',
    selected_dataset_ids: ['ds-1'],
    dataset_version_snapshot: { 'ds-1': 'ver-1' },
    share_aggregate_summaries: false,
    status: 'awaiting_approval',
    current_step: 'Awaiting User Approval',
    approval_status: 'pending',
    approval_hash: 'sha256_hash_abc',
    approval_payload: {
      run_id: 'run-1',
      approval_hash: 'sha256_hash_abc',
      estimated_queries: 1,
      queries: [
        {
          query_index: 0,
          title: 'Monthly Revenue Breakdown',
          purpose: 'Aggregates monthly revenue totals',
          sql: 'SELECT order_month, SUM(revenue) AS total_rev FROM sales_2026.orders GROUP BY 1',
          tables_referenced: ['sales_2026.orders'],
          datasets_involved: ['Sales 2026'],
          validation_status: 'valid',
        },
      ],
    },
    approved_query_indices: [],
    llm_calls_count: 2,
    sql_queries_count: 1,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:05Z',
    steps: [
      {
        id: 'st-1',
        agent_name: 'Supervisor',
        step_name: 'Classification & Planning',
        status: 'completed',
        sequence_order: 0,
        duration_ms: 42,
      },
      {
        id: 'st-2',
        agent_name: 'Approval Gate',
        step_name: 'Awaiting Human SQL Approval',
        status: 'awaiting_approval',
        sequence_order: 1,
      },
    ],
    evidence_items: [],
  }

  const mockCompletedRun: AgentRunItem = {
    ...mockAwaitingRun,
    status: 'completed',
    approval_status: 'approved',
    current_step: 'Completed',
    approved_query_indices: [0],
    duration_ms: 1520,
  }

  const mockResults: AgentRunResultsResponse = {
    run_id: 'run-1',
    status: 'completed',
    workflow_type: 'deep_analysis',
    discovery: {
      sufficient_data: true,
      sufficiency_reason: 'Discovered 1 table.',
      relevant_tables: [
        {
          dataset_id: 'ds-1',
          dataset_name: 'Sales 2026',
          table_name: 'orders',
          qualified_name: 'sales_2026.orders',
          row_count: 1000,
          measures: ['revenue'],
          dimensions: ['category'],
          date_columns: ['order_month'],
          pii_columns: [],
        },
      ],
      relationships: [],
      recommended_metrics: ['SUM(revenue)'],
    },
    data_quality: {
      overall_health: 'warning',
      total_issues: 1,
      summary: '1 medium issue detected.',
      findings: [
        {
          title: 'High Missing Value Rate',
          description: 'discount column has 25% nulls',
          severity: 'medium',
          affected_table: 'orders',
          affected_column: 'discount',
          evidence: 'null_percentage = 25%',
          recommended_action: 'Use COALESCE',
          confidence: 'high',
        },
      ],
    },
    sql_drafts: [],
    executed_queries: [
      {
        query_index: 0,
        title: 'Monthly Revenue Breakdown',
        query_run_id: 'qr-1',
        sql: 'SELECT order_month, SUM(revenue) AS total_rev FROM sales_2026.orders GROUP BY 1',
        row_count: 2,
        status: 'success',
      },
    ],
    statistical_analysis: {
      summary: 'Computed 1 metric summary.',
      metrics: [
        {
          metric_name: 'total_rev',
          table_or_query: 'Query #1',
          column_name: 'total_rev',
          count: 2,
          sum_value: 1500,
          mean: 750,
          median: 750,
          min_value: 500,
          max_value: 1000,
          std_dev: 353.55,
          evidence_reference: 'query_run:qr-1',
        },
      ],
      rankings: [],
      correlations: [],
      anomalies: [],
    },
    visualizations: {
      charts: [
        {
          chart_id: 'chart_1',
          title: 'Monthly Revenue Trend',
          chart_type: 'bar',
          x_axis: 'order_month',
          y_axis: 'total_rev',
          columns: [
            { name: 'order_month', type: 'VARCHAR' },
            { name: 'total_rev', type: 'DOUBLE' },
          ],
          data_preview: [
            { order_month: '2026-01', total_rev: 500 },
            { order_month: '2026-02', total_rev: 1000 },
          ],
        },
      ],
      notes: [],
    },
    insights: {
      executive_takeaway: 'Revenue doubled from January to February.',
      findings: [
        {
          title: 'Strong Month Growth',
          finding_type: 'evidence_backed',
          summary: 'Total revenue reached 1,500 across 2 periods.',
          evidence_references: ['query_run:qr-1'],
        },
      ],
      hypotheses: [],
      follow_up_questions: [],
    },
    report: {
      title: 'Analysis Report: Sales 2026',
      executive_summary: 'Revenue doubled from January to February.',
      datasets_analyzed: ['Sales 2026 (v1)'],
      analytical_objectives: ['Analyze my complete sales dataset.'],
      key_findings: ['Total revenue reached 1,500.'],
      statistical_analysis: ['total_rev: mean=750'],
      data_quality_observations: ['discount column has 25% nulls'],
      trends_and_comparisons: [],
      recommended_visualizations: ['Monthly Revenue Trend'],
      business_recommendations: ['Monitor discount nulls'],
      limitations: [],
      supporting_evidence: [
        { evidence_type: 'query_execution', evidence_reference: 'query_run:qr-1', description: 'Executed SQL' },
      ],
    },
    report_markdown: '# Analysis Report: Sales 2026\n',
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
      items: [mockAwaitingRun],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    vi.mocked(apiService.agents.getResults).mockResolvedValue(mockResults)
  })

  it('renders workspace KPI cards, analysis modes, timeline, and approval panel', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/agent-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Analytics Workspace')).toBeInTheDocument()
    })

    // KPI Cards
    expect(screen.getByText('Total Agent Runs')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Saved Reports')).toBeInTheDocument()

    // 7 Analysis Modes
    expect(screen.getByText('Quick Analysis')).toBeInTheDocument()
    expect(screen.getByText('Deep Analysis')).toBeInTheDocument()
    expect(screen.getByText('Data Quality Audit')).toBeInTheDocument()
    expect(screen.getByText('Anomaly Investigation')).toBeInTheDocument()

    // Timeline & Approval Panel
    expect(screen.getByText('Agent Execution Timeline')).toBeInTheDocument()
    expect(screen.getByText('Human-in-the-Loop SQL Execution Approval Required')).toBeInTheDocument()
    expect(screen.getByText('#1: Monthly Revenue Breakdown')).toBeInTheDocument()
  })

  it('launches a new workflow when mode is selected and form is submitted', async () => {
    vi.mocked(apiService.agents.startRun).mockResolvedValueOnce(mockAwaitingRun)

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/agent-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Trend Analysis'))

    const textarea = screen.getByPlaceholderText(/Describe your analytical goal/i)
    fireEvent.change(textarea, { target: { value: 'Show monthly revenue trends' } })

    const launchBtn = screen.getByRole('button', { name: /Launch Multi-Agent Analysis/i })
    fireEvent.click(launchBtn)

    await waitFor(() => {
      expect(apiService.agents.startRun).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          request: 'Show monthly revenue trends',
          workflow_type: 'trend_analysis',
          share_aggregate_summaries_with_gemini: false,
        }),
      )
    })
  })

  it('handles approval, findings tabs, visualization gallery, and saving report', async () => {
    vi.mocked(apiService.agents.approveRun).mockResolvedValueOnce(mockCompletedRun)
    vi.mocked(apiService.reports.saveFromRun).mockResolvedValueOnce({
      id: 'rep-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      agent_run_id: 'run-1',
      title: 'Analysis Report: Sales 2026',
      workflow_type: 'deep_analysis',
      report_json: mockResults.report!,
      report_markdown: '# Report\n',
      evidence_references: [],
      created_at: '2026-01-01T10:05:00Z',
      updated_at: '2026-01-01T10:05:00Z',
    })

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/agent-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Approve & Run/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Approve & Run/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm & Execute/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Execute/i }))

    await waitFor(() => {
      expect(apiService.agents.approveRun).toHaveBeenCalledWith(
        'proj-1',
        'run-1',
        expect.objectContaining({
          approval_hash: 'sha256_hash_abc',
          approved_query_indices: [0],
        }),
      )
    })

    // Findings Tabs
    expect(screen.getAllByText('Revenue doubled from January to February.').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: /Statistics/i }))
    expect(screen.getByText('Computed 1 metric summary.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Data Quality \(/i }))
    expect(screen.getAllByText(/discount column has 25% nulls/i).length).toBeGreaterThanOrEqual(1)

    // Visualization Gallery & Save Report
    expect(screen.getAllByText('Monthly Revenue Trend').length).toBeGreaterThanOrEqual(1)
    const saveBtn = screen.getByRole('button', { name: /Save Report/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(apiService.reports.saveFromRun).toHaveBeenCalledWith('proj-1', 'run-1', {})
    })
  })

  it('handles reject workflow action cleanly', async () => {
    vi.mocked(apiService.agents.rejectRun).mockResolvedValueOnce({
      ...mockAwaitingRun,
      status: 'rejected',
      approval_status: 'rejected',
    })

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/agent-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reject Plan/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Reject Plan/i }))

    await waitFor(() => {
      expect(apiService.agents.rejectRun).toHaveBeenCalledWith('proj-1', 'run-1', expect.any(Object))
    })
  })

  it('renders ReportsPage and AgentRunsPage with real API data', async () => {
    const mockReport: AnalysisReportItem = {
      id: 'rep-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      agent_run_id: 'run-1',
      title: 'Executive Sales Report 2026',
      workflow_type: 'deep_analysis',
      report_json: mockResults.report!,
      report_markdown: '# Executive Sales Report 2026\n',
      evidence_references: [],
      created_at: '2026-01-01T10:05:00Z',
      updated_at: '2026-01-01T10:05:00Z',
    }
    vi.mocked(apiService.reports.listOrgReports).mockResolvedValueOnce({
      items: [mockReport],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(apiService.agents.listOrgRuns).mockResolvedValueOnce({
      items: [mockCompletedRun],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/agent-runs" element={<AgentRunsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Executive Sales Report 2026')).toBeInTheDocument()
    })
  })
})
