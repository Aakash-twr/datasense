import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { DataSourcesPage } from '@/pages/datasets/DataSourcesPage'
import { UploadDatasetModal } from '@/components/datasets/UploadDatasetModal'
import { apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    },
    datasets: {
      list: vi.fn(),
      getSchema: vi.fn(),
      upload: vi.fn(),
      uploadWithProgress: vi.fn(),
      getJob: vi.fn(),
      archive: vi.fn(),
    },
    analytics: {
      getHistory: vi.fn(),
    },
    ai: {
      listConversations: vi.fn(),
    },
    agents: {
      listOrgRuns: vi.fn(),
    },
    reports: {
      listOrgReports: vi.fn(),
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

const mockOrg = {
  organization_id: 'org-1',
  organization_name: 'Acme Analytics',
  organization_slug: 'acme',
  role: 'owner' as const,
}

const mockProject = {
  id: 'proj-1',
  organization_id: 'org-1',
  name: 'Sales Insights',
  description: 'Q4 revenue and cohort analysis',
  settings: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('Stage 2 Dashboard, Projects, Data Sources & Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'u-1',
        name: 'Alice Analyst',
        email: 'alice@example.com',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      currentOrg: mockOrg,
    })
  })

  it('Dashboard renders all 5 real KPIs, workflow summaries, and chronological activity feed', async () => {
    const nowIso = new Date().toISOString()
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [mockProject],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(apiService.datasets.list).mockResolvedValue({
      items: [
        {
          id: 'ds-1',
          project_id: 'proj-1',
          name: 'Orders CSV',
          source_type: 'csv',
          original_filename: 'orders.csv',
          status: 'ready',
          created_at: nowIso,
          updated_at: nowIso,
          active_version: {
            id: 'ver-1',
            version_number: 1,
            checksum: 'sha',
            file_size_bytes: 2048,
            total_row_count: 250,
            total_column_count: 5,
            status: 'ready',
            created_at: nowIso,
            is_active: true,
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(apiService.analytics.getHistory).mockResolvedValue({
      items: [
        {
          id: 'q-1',
          organization_id: 'org-1',
          project_id: 'proj-1',
          user_id: 'u-1',
          sql_query: 'SELECT region, SUM(amount) FROM orders GROUP BY region',
          selected_dataset_ids: ['ds-1'],
          status: 'success',
          execution_time_ms: 19,
          returned_row_count: 4,
          created_at: nowIso,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
    })
    vi.mocked(apiService.ai.listConversations).mockResolvedValue({
      items: [
        {
          id: 'c-1',
          title: 'Revenue drivers',
          selected_dataset_ids: ['ds-1'],
          message_count: 4,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ],
      total: 1,
      page: 1,
      page_size: 15,
      total_pages: 1,
    })
    vi.mocked(apiService.agents.listOrgRuns).mockResolvedValue({
      items: [
        {
          id: 'run-1',
          organization_id: 'org-1',
          project_id: 'proj-1',
          user_id: 'u-1',
          workflow_type: 'deep_analysis',
          user_request: 'Analyze regional margins',
          selected_dataset_ids: ['ds-1'],
          dataset_version_snapshot: {},
          share_aggregate_summaries: false,
          status: 'completed',
          approval_status: 'approved',
          approved_query_indices: [],
          llm_calls_count: 2,
          sql_queries_count: 1,
          created_at: nowIso,
          updated_at: nowIso,
          steps: [],
          evidence_items: [],
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
    })
    vi.mocked(apiService.reports.listOrgReports).mockResolvedValue({
      items: [
        {
          id: 'rep-1',
          organization_id: 'org-1',
          project_id: 'proj-1',
          user_id: 'u-1',
          title: 'Q4 Margin Executive Brief',
          workflow_type: 'deep_analysis',
          report_json: {
            title: 'Q4 Margin Executive Brief',
            executive_summary: 'Margins rose',
            datasets_analyzed: [],
            analytical_objectives: [],
            key_findings: [],
            statistical_analysis: [],
            data_quality_observations: [],
            trends_and_comparisons: [],
            recommended_visualizations: [],
            business_recommendations: [],
            limitations: [],
            supporting_evidence: [],
          },
          report_markdown: '# Q4',
          evidence_references: [],
          created_at: nowIso,
          updated_at: nowIso,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
    })

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Total Projects')).toBeInTheDocument()
    expect(screen.getByText('Total Datasets')).toBeInTheDocument()
    expect(screen.getByText('Total Queries')).toBeInTheDocument()
    expect(screen.getByText('AI Workflows')).toBeInTheDocument()
    expect(screen.getByText('Saved Reports')).toBeInTheDocument()

    expect(screen.getByText(/Uploaded dataset "Orders CSV"/i)).toBeInTheDocument()
    expect(screen.getByText('Q4 Margin Executive Brief')).toBeInTheDocument()
    expect(screen.getAllByText(/Analyze regional margins/i).length).toBeGreaterThanOrEqual(1)
  })

  it('ProjectsPage switches smoothly between Grid and List views with real dataset metadata', async () => {
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [mockProject],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    vi.mocked(apiService.datasets.list).mockResolvedValue({
      items: [],
      total: 2,
      page: 1,
      page_size: 5,
      total_pages: 1,
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Sales Insights')).toBeInTheDocument()
    expect(screen.getByText('2 datasets')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Sales Insights')).toBeInTheDocument()
  })

  it('DataSourcesPage renders table count, version, format filter, and ConfirmDialog archival', async () => {
    const nowIso = new Date().toISOString()
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [mockProject],
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
          name: 'Retail Transactions',
          source_type: 'parquet',
          original_filename: 'retail.parquet',
          status: 'ready',
          created_at: nowIso,
          updated_at: nowIso,
          active_version: {
            id: 'v-2',
            version_number: 2,
            checksum: 'hash',
            file_size_bytes: 2048,
            total_row_count: 1500,
            total_column_count: 8,
            status: 'ready',
            created_at: nowIso,
            is_active: true,
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    vi.mocked(apiService.datasets.getSchema).mockResolvedValue({
      dataset_id: 'ds-1',
      version_id: 'v-2',
      version_number: 2,
      tables: [
        {
          id: 't-1',
          table_name: 'retail',
          original_table_name: 'retail',
          row_count: 1500,
          column_count: 8,
          columns: [],
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/data-sources?projectId=proj-1']}>
        <DataSourcesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Retail Transactions')).toBeInTheDocument()
    expect(screen.getByText('v2')).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Archive Retail Transactions' }))
    expect(screen.getByText('Archive Dataset?')).toBeInTheDocument()
  })

  it('UploadDatasetModal validates file extensions and tracks real backend ingestion progress', async () => {
    vi.mocked(apiService.datasets.uploadWithProgress).mockImplementation(
      async (_pid, _file, opts) => {
        opts?.onProgress?.(100)
        return {
          dataset_id: 'ds-new',
          version_id: 'v-1',
          job_id: 'job-1',
          status: 'processing',
          message: 'Queued',
        }
      },
    )
    vi.mocked(apiService.datasets.getJob).mockResolvedValue({
      id: 'job-1',
      dataset_id: 'ds-new',
      dataset_version_id: 'v-1',
      status: 'completed',
      current_stage: 'profiling',
      progress_percentage: 100,
      status_message: 'Completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const onSuccess = vi.fn()
    render(
      <UploadDatasetModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        projects={[mockProject]}
        selectedProjectId="proj-1"
      />,
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const badFile = new File(['bad'], 'malware.exe', { type: 'application/octet-stream' })
    fireEvent.change(fileInput, { target: { files: [badFile] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported file format/i)

    const goodFile = new File(['a,b\n1,2\n'], 'orders.csv', { type: 'text/csv' })
    fireEvent.change(fileInput, { target: { files: [goodFile] } })

    fireEvent.click(screen.getByRole('button', { name: /Start Ingestion/i }))

    await waitFor(() => {
      expect(screen.getByText('Dataset Ingestion Complete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'View Dataset' }))
    expect(onSuccess).toHaveBeenCalledWith('ds-new')
  })
})
