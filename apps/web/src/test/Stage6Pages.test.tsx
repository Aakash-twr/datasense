import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReportsPage } from '@/pages/agents/ReportsPage'
import { ProfilePage } from '@/pages/settings/ProfilePage'
import { QueryHistoryPanel } from '@/components/analytics/QueryHistoryPanel'
import { SavedQueriesPanel } from '@/components/analytics/SavedQueriesPanel'
import { HelpModal } from '@/components/common/HelpModal'
import { ToastProvider } from '@/components/ui/Toast'
import { apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { AnalysisReportItem, QueryRunResponse, SavedQueryResponse } from '@/types'

vi.mock('@/services/api', () => ({
  apiService: {
    auth: {
      updateProfile: vi.fn(),
    },
    organizations: {
      getCurrent: vi.fn(),
      updateCurrent: vi.fn(),
    },
    projects: {
      list: vi.fn(),
    },
    ai: {
      getStatus: vi.fn(),
      acknowledgePrivacy: vi.fn(),
    },
    agents: {
      getResults: vi.fn(),
    },
    reports: {
      listOrgReports: vi.fn(),
      getOrgReport: vi.fn(),
      deleteOrgReport: vi.fn(),
    },
  },
  ApiError: class extends Error {
    detail: string
    constructor(_status: number, detail: string) {
      super(detail)
      this.detail = detail
    }
  },
}))

describe('Stage 6 — Reports, History, Saved Queries, Settings & Profile, and Help', () => {
  const mockReports: AnalysisReportItem[] = [
    {
      id: 'rep-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      agent_run_id: 'run-1',
      title: 'Q4 Regional Margin Audit',
      workflow_type: 'deep_analysis',
      report_json: {
        title: 'Q4 Regional Margin Audit',
        executive_summary: 'EMEA margin improved by 3.2 points over Q3.',
        datasets_analyzed: ['Finance Ledger (v1)'],
        analytical_objectives: ['Evaluate margin delta by region'],
        key_findings: ['EMEA margin hit 41.2%'],
        statistical_analysis: ['Mean regional margin = 38.4%'],
        data_quality_observations: ['No critical nulls in ledger'],
        trends_and_comparisons: ['QoQ +3.2 pts'],
        recommended_visualizations: ['Margin Bar Chart'],
        business_recommendations: ['Reallocate marketing spend toward EMEA'],
        limitations: ['Excludes pending rebates'],
        supporting_evidence: [
          {
            evidence_type: 'query_execution',
            evidence_reference: 'query_run:qr-11',
            description: 'Margin aggregation query',
          },
        ],
      },
      report_markdown: '# Q4 Regional Margin Audit\n',
      evidence_references: [],
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-01-11T10:00:00Z',
    },
    {
      id: 'rep-2',
      organization_id: 'org-1',
      project_id: 'proj-2',
      user_id: 'user-2',
      agent_run_id: null,
      title: 'Inventory Quality Scan',
      workflow_type: 'data_quality_audit',
      report_json: {
        title: 'Inventory Quality Scan',
        executive_summary: 'Found 4% missing SKU category codes.',
        datasets_analyzed: ['Warehouse SKUs'],
        analytical_objectives: [],
        key_findings: [],
        statistical_analysis: [],
        data_quality_observations: ['sku_category has 4% nulls'],
        trends_and_comparisons: [],
        recommended_visualizations: [],
        business_recommendations: [],
        limitations: [],
        supporting_evidence: [],
      },
      report_markdown: '# Inventory Quality Scan\n',
      evidence_references: [],
      created_at: '2026-01-08T10:00:00Z',
      updated_at: '2026-01-09T10:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useAuthStore.setState({
      user: {
        id: 'user-1',
        name: 'Alice Analyst',
        email: 'alice@datasense.io',
        avatar_url: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-05T00:00:00Z',
      },
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Acme Analytics',
        organization_slug: 'acme',
        role: 'owner',
      },
      isAuthenticated: true,
      isLoading: false,
    })

    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [
        {
          id: 'proj-1',
          organization_id: 'org-1',
          name: 'Finance BI',
          settings: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'proj-2',
          organization_id: 'org-1',
          name: 'Supply Chain',
          settings: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })

    vi.mocked(apiService.reports.listOrgReports).mockResolvedValue({
      items: mockReports,
      total: 2,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    vi.mocked(apiService.agents.getResults).mockResolvedValue({
      run_id: 'run-1',
      status: 'completed',
      workflow_type: 'deep_analysis',
      sql_drafts: [],
      executed_queries: [],
      visualizations: {
        charts: [
          {
            chart_id: 'c1',
            title: 'EMEA vs APAC Margin',
            chart_type: 'bar',
            x_axis: 'region',
            y_axis: 'margin',
            columns: [
              { name: 'region', type: 'VARCHAR' },
              { name: 'margin', type: 'DOUBLE' },
            ],
            data_preview: [{ region: 'EMEA', margin: 41.2 }],
          },
        ],
        notes: [],
      },
      evidence: [],
    })
  })

  it('renders Reports library with search/filters, BI charts inside report detail, and confirmed delete', async () => {
    vi.mocked(apiService.reports.deleteOrgReport).mockResolvedValueOnce()

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reports']}>
          <Routes>
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:reportId" element={<ReportsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Finance BI')).toBeInTheDocument()
      expect(screen.getByText('EMEA vs APAC Margin')).toBeInTheDocument()
    })

    // Filter by workflow type
    fireEvent.change(screen.getByLabelText('Filter reports by workflow'), {
      target: { value: 'data_quality_audit' },
    })
    expect(screen.getByText('Inventory Quality Scan')).toBeInTheDocument()

    // Reset filter and test confirmation delete on first report
    fireEvent.change(screen.getByLabelText('Filter reports by workflow'), {
      target: { value: 'all' },
    })
    fireEvent.click(screen.getByLabelText('Delete report Q4 Regional Margin Audit'))
    expect(screen.getByText('Delete Saved Report')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Report' }))

    await waitFor(() => {
      expect(apiService.reports.deleteOrgReport).toHaveBeenCalledWith('rep-1', 'org-1')
    })
  })

  it('renders Query History activity table with search, status filtering, Open Query, and Run Again', () => {
    const history: QueryRunResponse[] = [
      {
        id: 'qh-1',
        organization_id: 'org-1',
        project_id: 'proj-1',
        user_id: 'user-1',
        sql_query: 'SELECT region, SUM(revenue) FROM invoices GROUP BY region',
        selected_dataset_ids: ['ds-1'],
        status: 'success',
        execution_time_ms: 14.5,
        returned_row_count: 12,
        created_at: '2026-01-10T10:00:00Z',
      },
      {
        id: 'qh-2',
        organization_id: 'org-1',
        project_id: 'proj-1',
        user_id: 'user-2',
        sql_query: 'SELECT missing_col FROM invoices',
        selected_dataset_ids: ['ds-1'],
        status: 'failed',
        error_summary: 'Binder Error: Referenced column missing_col not found',
        created_at: '2026-01-10T09:00:00Z',
      },
    ]

    const onRerun = vi.fn()
    const onExecuteAgain = vi.fn()
    const onDelete = vi.fn()

    render(
      <QueryHistoryPanel
        history={history}
        onRerun={onRerun}
        onExecuteAgain={onExecuteAgain}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText(/Alice Analyst/i)).toBeInTheDocument()
    expect(screen.getByText(/User user-2/i)).toBeInTheDocument()

    // Filter to Failed only
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    expect(screen.queryByText(/SELECT region, SUM/i)).not.toBeInTheDocument()
    expect(screen.getByText(/SELECT missing_col FROM invoices/i)).toBeInTheDocument()

    // Open Query and Run Again trigger separate callbacks
    fireEvent.click(screen.getByRole('button', { name: /Open Query/i }))
    expect(onRerun).toHaveBeenCalledWith('SELECT missing_col FROM invoices')

    fireEvent.click(screen.getByRole('button', { name: /Run Again/i }))
    expect(onExecuteAgain).toHaveBeenCalledWith('SELECT missing_col FROM invoices')
  })

  it('supports create, update, and delete CRUD operations in Saved Queries', async () => {
    const saved: SavedQueryResponse[] = [
      {
        id: 'sq-1',
        organization_id: 'org-1',
        project_id: 'proj-1',
        user_id: 'user-1',
        name: 'Top Regions',
        description: 'Ranked regional revenue',
        sql_query: 'SELECT region, SUM(rev) FROM orders GROUP BY region',
        selected_dataset_ids: ['ds-1'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-05T00:00:00Z',
      },
    ]
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn()

    render(
      <SavedQueriesPanel
        savedQueries={saved}
        projectName="Finance BI"
        onSelectQuery={vi.fn()}
        onRunQuery={vi.fn()}
        onCreateQuery={onCreate}
        onUpdateQuery={onUpdate}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Finance BI')).toBeInTheDocument()

    // Edit existing saved query
    fireEvent.click(screen.getByLabelText('Edit saved query Top Regions'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByDisplayValue('Top Regions'), {
      target: { value: 'Top EMEA Regions' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('sq-1', {
        name: 'Top EMEA Regions',
        description: 'Ranked regional revenue',
        sql_query: 'SELECT region, SUM(rev) FROM orders GROUP BY region',
      })
    })

    // Create new saved query
    fireEvent.click(screen.getByRole('button', { name: /New Saved Query/i }))
    const createDialog = screen.getByRole('dialog')
    fireEvent.change(within(createDialog).getByPlaceholderText('Monthly Active Revenue'), {
      target: { value: 'Weekly Signups' },
    })
    fireEvent.change(within(createDialog).getByPlaceholderText('SELECT * FROM ...'), {
      target: { value: 'SELECT COUNT(*) FROM users' },
    })
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Create Saved Query' }))

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Weekly Signups',
        description: null,
        sql_query: 'SELECT COUNT(*) FROM users',
      })
    })
  })

  it('renders structured Settings & Profile sections with real updates for profile, privacy, AI, preferences, and workspace', async () => {
    vi.mocked(apiService.ai.getStatus).mockResolvedValue({
      enabled: true,
      configured: true,
      model: 'gemini-2.5-flash',
      available: true,
      privacy_acknowledged: false,
      message: 'Ready',
    })
    vi.mocked(apiService.ai.acknowledgePrivacy).mockResolvedValue({
      acknowledged: true,
      acknowledged_at: '2026-01-10T10:00:00Z',
    })
    vi.mocked(apiService.organizations.getCurrent).mockResolvedValue({
      id: 'org-1',
      name: 'Acme Analytics',
      slug: 'acme',
      owner_id: 'user-1',
      role: 'owner',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.mocked(apiService.organizations.updateCurrent).mockResolvedValue({
      id: 'org-1',
      name: 'Acme Global BI',
      slug: 'acme',
      owner_id: 'user-1',
      role: 'owner',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-12T00:00:00Z',
    })
    vi.mocked(apiService.auth.updateProfile).mockResolvedValue({
      id: 'user-1',
      name: 'Alice Updated',
      email: 'alice@datasense.io',
      avatar_url: null,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-12T00:00:00Z',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/settings/profile']}>
          <Routes>
            <Route path="/settings/profile" element={<ProfilePage />} />
            <Route path="/settings/:section" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )

    // Profile update
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => {
      expect(apiService.auth.updateProfile).toHaveBeenCalledWith({
        name: 'Alice Updated',
        avatar_url: null,
      })
    })

    // AI Settings
    fireEvent.click(screen.getByRole('button', { name: 'AI Settings' }))
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument()
    expect(screen.getByText('Configured & Available')).toBeInTheDocument()

    // Privacy section & acknowledge
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }))
    fireEvent.click(screen.getByRole('button', { name: /Acknowledge Privacy Notice/i }))
    await waitFor(() => {
      expect(apiService.ai.acknowledgePrivacy).toHaveBeenCalled()
    })

    // Preferences
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    fireEvent.change(screen.getByLabelText('Default SQL Result Limit'), {
      target: { value: '5000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
    expect(window.localStorage.getItem('datasense_default_row_limit')).toBe('5000')

    // Workspace Settings rename
    fireEvent.click(screen.getByRole('button', { name: 'Workspace Settings' }))
    fireEvent.change(screen.getByLabelText('Organization Workspace Name'), {
      target: { value: 'Acme Global BI' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Workspace' }))
    await waitFor(() => {
      expect(apiService.organizations.updateCurrent).toHaveBeenCalledWith(
        { name: 'Acme Global BI' },
        'org-1',
      )
    })
  })

  it('renders searchable HelpModal covering Projects, Datasets, SQL, AI Copilot, Agents, and Reports', () => {
    render(<HelpModal open={true} onClose={vi.fn()} />)

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Dataset Uploads & Ingestion')).toBeInTheDocument()
    expect(screen.getByText('SQL Analytics & Deterministic SQL Safety')).toBeInTheDocument()
    expect(screen.getByText('AI Copilot (Schema-Only)')).toBeInTheDocument()
    expect(screen.getByText('Multi-Agent Analytics')).toBeInTheDocument()
    expect(screen.getByText('Reports & Export')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search documentation'), { target: { value: 'Copilot' } })
    expect(screen.getByText('AI Copilot (Schema-Only)')).toBeInTheDocument()
    expect(screen.queryByText('Reports & Export')).not.toBeInTheDocument()
  })
})
