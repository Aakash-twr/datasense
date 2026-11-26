import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AnalyticsWorkspacePage } from '@/pages/analytics/AnalyticsWorkspacePage'
import { useAuthStore } from '@/stores/authStore'
import { apiService } from '@/services/api'

// Mock apiService
vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
      get: vi.fn(),
    },
    analytics: {
      getCatalog: vi.fn(),
      validate: vi.fn(),
      execute: vi.fn(),
      getQueryStatus: vi.fn(),
      getHistory: vi.fn(),
      deleteHistory: vi.fn(),
      createSavedQuery: vi.fn(),
      getSavedQueries: vi.fn(),
      getSavedQuery: vi.fn(),
      updateSavedQuery: vi.fn(),
      deleteSavedQuery: vi.fn(),
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

describe('AnalyticsWorkspacePage', () => {
  const mockCatalog = {
    datasets: [
      {
        dataset_id: 'ds-1',
        dataset_name: 'E-Commerce Sales',
        schema_name: 'ecommerce_sales',
        version_id: 'ver-1',
        version_number: 1,
        source_format: 'csv',
        tables: [
          {
            table_name: 'orders',
            schema_name: 'ecommerce_sales',
            qualified_name: 'ecommerce_sales.orders',
            display_name: 'orders',
            row_count: 1500,
            column_count: 3,
            columns: [
              {
                name: 'order_id',
                display_name: 'order_id',
                data_type: 'INTEGER',
                canonical_type: 'integer',
                is_nullable: false,
                is_sensitive: false,
                sensitivity_category: null,
              },
              {
                name: 'customer_email',
                display_name: 'customer_email',
                data_type: 'VARCHAR',
                canonical_type: 'email',
                is_nullable: true,
                is_sensitive: true,
                sensitivity_category: 'email',
              },
              {
                name: 'amount',
                display_name: 'amount',
                data_type: 'DOUBLE',
                canonical_type: 'currency',
                is_nullable: false,
                is_sensitive: false,
                sensitivity_category: null,
              },
            ],
          },
        ],
      },
    ],
  }

  const mockQueryResults = {
    query_id: 'q-101',
    status: 'success',
    columns: [
      { name: 'order_id', type: 'INTEGER' },
      { name: 'amount', type: 'DOUBLE' },
    ],
    rows: [
      [1, 199.99],
      [2, 49.5],
      [3, null],
    ],
    row_count: 3,
    truncated: false,
    execution_time_ms: 14.5,
    error_message: null,
  }

  const mockQueryHistory = {
    items: [
      {
        id: 'hist-1',
        organization_id: 'org-1',
        project_id: 'proj-1',
        user_id: 'user-1',
        sql_query: 'SELECT * FROM orders LIMIT 10',
        selected_dataset_ids: ['ds-1'],
        status: 'success' as const,
        execution_time_ms: 12.3,
        returned_row_count: 10,
        error_summary: null,
        created_at: new Date().toISOString(),
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
  }

  const mockSavedQueries = {
    items: [
      {
        id: 'sq-1',
        organization_id: 'org-1',
        project_id: 'proj-1',
        user_id: 'user-1',
        name: 'Top Revenue Orders',
        description: 'Orders with revenue > $100',
        sql_query: 'SELECT * FROM orders WHERE amount > 100 ORDER BY amount DESC',
        selected_dataset_ids: ['ds-1'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    total: 1,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'user-1',
        name: 'Analyst Jane',
        email: 'jane@example.com',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Alpha Corp',
        organization_slug: 'alpha-corp',
        role: 'owner',
      },
    })

    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [
        {
          id: 'proj-1',
          organization_id: 'org-1',
          name: 'Revenue Intelligence',
          settings: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })

    vi.mocked(apiService.projects.get).mockResolvedValue({
      id: 'proj-1',
      organization_id: 'org-1',
      name: 'Revenue Intelligence',
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    vi.mocked(apiService.analytics.getCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(apiService.analytics.execute).mockResolvedValue(mockQueryResults)
    vi.mocked(apiService.analytics.getHistory).mockResolvedValue(mockQueryHistory)
    vi.mocked(apiService.analytics.getSavedQueries).mockResolvedValue(mockSavedQueries)
  })

  it('renders SQL analytics workspace with catalog data explorer', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    // Wait for catalog to load
    await waitFor(() => {
      expect(screen.getByText('E-Commerce Sales')).toBeInTheDocument()
      expect(screen.getByText('orders')).toBeInTheDocument()
    })

    // Column metadata pills should be visible
    expect(screen.getByText('order_id')).toBeInTheDocument()
    expect(screen.getByText('customer_email')).toBeInTheDocument()
    expect(screen.getByTitle(/Sensitive PII: email/i)).toBeInTheDocument()

    // SQL Editor Action Buttons
    expect(screen.getByRole('button', { name: /Run Query/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Validate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument()
  })

  it('executes SQL query and renders structured results data grid', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('E-Commerce Sales')).toBeInTheDocument()
    })

    const runBtn = screen.getByRole('button', { name: /Run Query/i })
    await waitFor(() => expect(runBtn).not.toBeDisabled())
    fireEvent.click(runBtn)

    // Verify execute was called
    await waitFor(() => {
      console.log('EXECUTE CALLS:', vi.mocked(apiService.analytics.execute).mock.calls)
      expect(apiService.analytics.execute).toHaveBeenCalled()
    })

    // Verify results table is rendered
    await waitFor(() => {
      expect(screen.getByText(/3 rows/i)).toBeInTheDocument()
      expect(screen.getByText('199.99')).toBeInTheDocument()
      expect(screen.getByText('49.5')).toBeInTheDocument()
    })
  })

  it('validates SQL query and shows validation errors on invalid queries', async () => {
    vi.mocked(apiService.analytics.validate).mockResolvedValue({
      is_valid: false,
      error: "Forbidden SQL operation detected: DROP. Only read-only analytical SELECT queries are permitted.",
      tables_referenced: [],
      suggested_fixes: ['Rewrite query as a read-only SELECT statement'],
    })

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('E-Commerce Sales')).toBeInTheDocument()
    })

    const validateBtn = screen.getByRole('button', { name: /Validate/i })
    await waitFor(() => expect(validateBtn).not.toBeDisabled())
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(apiService.analytics.validate).toHaveBeenCalled()
      expect(
        screen.getByText(/Forbidden SQL operation detected: DROP/i)
      ).toBeInTheDocument()
    })
  })

  it('switches between Results, History, and Saved Queries tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('E-Commerce Sales')).toBeInTheDocument()
    })

    // Click "Query History" tab
    const historyTab = screen.getByRole('button', { name: /Query History/i })
    fireEvent.click(historyTab)

    await waitFor(() => {
      expect(apiService.analytics.getHistory).toHaveBeenCalled()
      expect(screen.getByText('SELECT * FROM orders LIMIT 10')).toBeInTheDocument()
      expect(screen.getByText(/12.3\s*ms/i)).toBeInTheDocument()
    })

    // Click "Saved Queries" tab
    const savedTab = screen.getByRole('button', { name: /Saved Queries/i })
    fireEvent.click(savedTab)

    await waitFor(() => {
      expect(apiService.analytics.getSavedQueries).toHaveBeenCalled()
      expect(screen.getByText('Top Revenue Orders')).toBeInTheDocument()
      expect(screen.getByText('Orders with revenue > $100')).toBeInTheDocument()
    })
  })

  it('toggles Chart View when query results are present', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('E-Commerce Sales')).toBeInTheDocument()
    })

    // Run query to populate results
    const runBtn = screen.getByRole('button', { name: /Run Query/i })
    await waitFor(() => expect(runBtn).not.toBeDisabled())
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(screen.getByText('3 rows')).toBeInTheDocument()
    })

    // Toggle Chart View
    const chartTab = screen.getByRole('button', { name: /^Chart$/i })
    fireEvent.click(chartTab)

    // Chart controls should be present
    await waitFor(() => {
      expect(screen.getByText(/X-Axis/i)).toBeInTheDocument()
      expect(screen.getByText(/Y-Axis/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Line/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Pie/i })).toBeInTheDocument()
    })
  })
})
