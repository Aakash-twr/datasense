import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataSourcesPage } from '@/pages/datasets/DataSourcesPage'
import { DatasetDetailPage } from '@/pages/datasets/DatasetDetailPage'
import { useAuthStore } from '@/stores/authStore'
import { apiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
    },
    datasets: {
      list: vi.fn(),
      get: vi.fn(),
      getJob: vi.fn(),
      getSchema: vi.fn(),
      getProfile: vi.fn(),
      getPreview: vi.fn(),
      getVersions: vi.fn(),
      upload: vi.fn(),
      uploadVersion: vi.fn(),
      archive: vi.fn(),
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

describe('DataSourcesPage', () => {
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
  })

  it('renders data sources page with empty state when no datasets exist', async () => {
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

    vi.mocked(apiService.datasets.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    render(
      <MemoryRouter initialEntries={['/data-sources?projectId=proj-1']}>
        <DataSourcesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Data Sources')).toBeInTheDocument()
    expect(await screen.findByText('No datasets found')).toBeInTheDocument()
  })

  it('renders datasets table when datasets exist', async () => {
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

    vi.mocked(apiService.datasets.list).mockResolvedValue({
      items: [
        {
          id: 'ds-1',
          project_id: 'proj-1',
          name: 'Customer Orders 2024',
          description: 'All online orders',
          source_type: 'csv',
          original_filename: 'orders.csv',
          status: 'ready',
          active_version_id: 'ver-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          active_version: {
            id: 'ver-1',
            version_number: 1,
            checksum: 'abc123sha',
            file_size_bytes: 1024 * 1024,
            total_row_count: 5000,
            total_column_count: 12,
            status: 'ready',
            created_at: new Date().toISOString(),
            is_active: true,
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    render(
      <MemoryRouter initialEntries={['/data-sources?projectId=proj-1']}>
        <DataSourcesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Customer Orders 2024')).toBeInTheDocument()
    expect(screen.getByText('CSV')).toBeInTheDocument()
    expect(screen.getByText('5,000')).toBeInTheDocument()
  })
})

describe('DatasetDetailPage', () => {
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
  })

  it('renders dataset overview and switches tabs', async () => {
    vi.mocked(apiService.datasets.get).mockResolvedValue({
      id: 'ds-1',
      project_id: 'proj-1',
      name: 'Customer Orders 2024',
      description: 'Transaction records',
      source_type: 'csv',
      original_filename: 'orders.csv',
      status: 'ready',
      active_version_id: 'ver-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      active_version: {
        id: 'ver-1',
        version_number: 1,
        checksum: 'checksum123',
        file_size_bytes: 2048,
        total_row_count: 1250,
        total_column_count: 8,
        status: 'ready',
        created_at: new Date().toISOString(),
        is_active: true,
      },
    })

    vi.mocked(apiService.datasets.getSchema).mockResolvedValue({
      dataset_id: 'ds-1',
      version_id: 'ver-1',
      version_number: 1,
      tables: [
        {
          id: 'tbl-1',
          table_name: 'orders',
          original_table_name: 'orders',
          row_count: 1250,
          column_count: 2,
          columns: [
            {
              id: 'col-1',
              column_name: 'customer_email',
              physical_name: 'customer_email',
              data_type: 'string',
              ordinal_position: 1,
              nullable: false,
              pii_category: 'email',
              pii_confidence: 0.95,
              profile_stats: {},
            },
          ],
        },
      ],
    })

    vi.mocked(apiService.datasets.getProfile).mockResolvedValue({
      dataset_id: 'ds-1',
      version_id: 'ver-1',
      table_stats: { total_rows: 1250, total_columns: 8 },
      column_stats: {},
      quality_warnings: [
        {
          severity: 'warning',
          code: 'HIGH_NULL_PERCENTAGE',
          column: 'notes',
          message: 'Column has 50% missing values',
          affected_rows: 625,
        },
      ],
    })

    vi.mocked(apiService.datasets.getPreview).mockResolvedValue({
      dataset_id: 'ds-1',
      version_id: 'ver-1',
      table_id: 'tbl-1',
      table_name: 'orders',
      columns: ['customer_email', 'amount'],
      column_types: { customer_email: 'string', amount: 'float' },
      rows: [
        { customer_email: 'alice@example.com', amount: 120.5 },
        { customer_email: 'bob@example.com', amount: 89.0 },
      ],
      total_rows: 1250,
      limit: 50,
      offset: 0,
    })

    render(
      <MemoryRouter initialEntries={['/datasets/ds-1']}>
        <Routes>
          <Route path="/datasets/:datasetId" element={<DatasetDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Verify Overview rendered
    expect(await screen.findByText('Customer Orders 2024')).toBeInTheDocument()
    expect(await screen.findByText('HIGH_NULL_PERCENTAGE')).toBeInTheDocument()
    expect(screen.getByText('customer_email')).toBeInTheDocument()

    // Switch to Data Preview Tab
    fireEvent.click(screen.getByText('Data Preview'))
    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()

    // Switch to Schema Tab
    fireEvent.click(screen.getByText('Schema'))
    expect(await screen.findByText('Table: orders')).toBeInTheDocument()
  })
})
