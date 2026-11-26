import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DatasetDetailPage } from '@/pages/datasets/DatasetDetailPage'
import { AnalyticsWorkspacePage } from '@/pages/analytics/AnalyticsWorkspacePage'
import { apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
      get: vi.fn(),
    },
    datasets: {
      get: vi.fn(),
      getSchema: vi.fn(),
      getProfile: vi.fn(),
      getPreview: vi.fn(),
      getVersions: vi.fn(),
      archive: vi.fn(),
    },
    analytics: {
      getCatalog: vi.fn(),
      validate: vi.fn(),
      execute: vi.fn(),
      getHistory: vi.fn(),
      getSavedQueries: vi.fn(),
    },
    ai: {
      explainSql: vi.fn(),
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

describe('Stage 3 Dataset Detail & SQL Analytics IDE', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'u-1',
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
  })

  it('renders multi-sheet Excel Tables tab and lets users jump straight to sheet preview', async () => {
    const nowIso = new Date().toISOString()
    vi.mocked(apiService.datasets.get).mockResolvedValue({
      id: 'ds-xlsx',
      project_id: 'proj-1',
      name: 'Finance Workbook',
      source_type: 'excel',
      original_filename: 'finance_2026.xlsx',
      status: 'ready',
      active_version_id: 'v-1',
      created_at: nowIso,
      updated_at: nowIso,
      active_version: {
        id: 'v-1',
        version_number: 1,
        checksum: 'abc123',
        file_size_bytes: 4096,
        total_row_count: 150,
        total_column_count: 6,
        status: 'ready',
        created_at: nowIso,
        is_active: true,
      },
    })

    vi.mocked(apiService.datasets.getSchema).mockResolvedValue({
      dataset_id: 'ds-xlsx',
      version_id: 'v-1',
      version_number: 1,
      tables: [
        {
          id: 'tbl-1',
          table_name: 'q1_revenue',
          original_table_name: 'Q1 Revenue',
          row_count: 90,
          column_count: 3,
          columns: [],
        },
        {
          id: 'tbl-2',
          table_name: 'q2_expenses',
          original_table_name: 'Q2 Expenses',
          row_count: 60,
          column_count: 3,
          columns: [],
        },
      ],
    })

    vi.mocked(apiService.datasets.getProfile).mockResolvedValue({
      dataset_id: 'ds-xlsx',
      version_id: 'v-1',
      table_stats: {},
      column_stats: {},
      quality_warnings: [],
    })

    vi.mocked(apiService.datasets.getPreview).mockResolvedValue({
      dataset_id: 'ds-xlsx',
      version_id: 'v-1',
      table_id: 'tbl-2',
      table_name: 'q2_expenses',
      columns: ['category', 'cost'],
      column_types: { category: 'string', cost: 'float' },
      rows: [{ category: 'Cloud Hosting', cost: 420.0 }],
      total_rows: 60,
      limit: 50,
      offset: 0,
    })

    render(
      <MemoryRouter initialEntries={['/datasets/ds-xlsx']}>
        <Routes>
          <Route path="/datasets/:datasetId" element={<DatasetDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Finance Workbook')).toBeInTheDocument()

    // Open Tables tab and confirm both sheets appear cleanly
    fireEvent.click(screen.getByRole('tab', { name: /Tables/i }))
    expect(await screen.findByText('Q1 Revenue')).toBeInTheDocument()
    expect(screen.getByText('Q2 Expenses')).toBeInTheDocument()

    // Click Preview Rows on second sheet
    const previewButtons = screen.getAllByRole('button', { name: 'Preview Rows' })
    fireEvent.click(previewButtons[1])

    expect(await screen.findByText('Cloud Hosting')).toBeInTheDocument()
  })

  it('supports collapsible Contextual AI Assist panel inside SQL Analytics IDE', async () => {
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [
        {
          id: 'proj-1',
          organization_id: 'org-1',
          name: 'Revenue Project',
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
      name: 'Revenue Project',
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    vi.mocked(apiService.analytics.getCatalog).mockResolvedValue({
      datasets: [
        {
          dataset_id: 'ds-1',
          dataset_name: 'Sales',
          schema_name: 'sales',
          version_id: 'v-1',
          version_number: 1,
          source_format: 'csv',
          tables: [
            {
              table_name: 'orders',
              schema_name: 'sales',
              qualified_name: 'sales.orders',
              display_name: 'orders',
              row_count: 100,
              column_count: 1,
              columns: [
                {
                  name: 'amount',
                  display_name: 'amount',
                  data_type: 'DOUBLE',
                  canonical_type: 'float',
                  is_nullable: false,
                  is_sensitive: false,
                },
              ],
            },
          ],
        },
      ],
    })
    vi.mocked(apiService.ai.explainSql).mockResolvedValue({
      explanation: 'Reads up to 20 rows from sales.orders.',
      accessed_tables: ['sales.orders'],
      applied_filters: [],
      aggregations_and_calculations: [],
      suggested_improvements: ['Specify explicit columns instead of SELECT *.'],
      improved_sql: 'SELECT amount FROM sales.orders LIMIT 20;',
    })

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/analytics']}>
        <Routes>
          <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Sales')).toBeInTheDocument()

    // Open Contextual AI Assist panel
    fireEvent.click(screen.getByRole('button', { name: /AI Assist/i }))
    expect(screen.getByText('Contextual AI Assist')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Explain Current SQL/i }))
    await waitFor(() => {
      expect(screen.getByText('Reads up to 20 rows from sales.orders.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Apply Suggested SQL' })).toBeInTheDocument()
    })
  })
})
