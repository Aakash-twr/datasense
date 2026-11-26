import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { useAuthStore } from '@/stores/authStore'
import { apiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  apiService: {
    projects: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: '123',
        name: 'Test Analyst',
        email: 'test@example.com',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Test Org',
        organization_slug: 'test-org',
        role: 'owner',
      },
    })
  })

  it('renders projects listing and empty state when none exist', async () => {
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(await screen.findByText('No projects found')).toBeInTheDocument()
  })

  it('renders list of projects when returned from API', async () => {
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [
        {
          id: 'proj-1',
          organization_id: 'org-1',
          name: 'Q3 Financial Analysis',
          description: 'Quarterly financial report',
          settings: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Q3 Financial Analysis')).toBeInTheDocument()
    expect(screen.getByText('Quarterly financial report')).toBeInTheDocument()
  })

  it('opens and submits create project modal', async () => {
    vi.mocked(apiService.projects.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    vi.mocked(apiService.projects.create).mockResolvedValue({
      id: 'proj-new',
      organization_id: 'org-1',
      name: 'New Growth Project',
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )

    const createBtn = await screen.findByRole('button', { name: /new project/i })
    fireEvent.click(createBtn)

    expect(screen.getByText('Create New Project')).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText(/e\.g\. Q4 Revenue Analysis/i)
    fireEvent.change(nameInput, { target: { value: 'New Growth Project' } })

    const submitBtn = screen.getByRole('button', { name: /create project/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(apiService.projects.create).toHaveBeenCalledWith(
        { name: 'New Growth Project', description: undefined },
        'org-1',
      )
    })
  })
})
