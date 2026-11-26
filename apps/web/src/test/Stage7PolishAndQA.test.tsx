import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { AppLayout } from '@/layouts/AppLayout'
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { useAuthStore } from '@/stores/authStore'
import { apiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  apiService: {
    getHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      service: 'datasense-api',
      version: '0.7.0',
      environment: 'test',
      timestamp: '2026-01-01T00:00:00Z',
      python_version: '3.13',
    }),
    projects: {
      get: vi.fn(),
    },
    datasets: {
      list: vi.fn(),
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

describe('Stage 7 — Accessibility, Responsive Shell & Final Consistency QA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'u1',
        name: 'QA Reviewer',
        email: 'qa@datasense.io',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'QA Workspace',
        organization_slug: 'qa-workspace',
        role: 'owner',
      },
    })
  })

  it('Modal enforces aria-modal, Escape dismissal, and restores focus to triggering element', async () => {
    const onClose = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = render(
      <Modal open={true} onClose={onClose} title="Accessible Dialog">
        <p>Dialog body content</p>
      </Modal>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Accessible Dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <Modal open={false} onClose={onClose} title="Accessible Dialog">
        <p>Dialog body content</p>
      </Modal>,
    )

    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })

  it('AppLayout provides skip-to-main-content link, landmark main region, and responsive mobile drawer', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Overview Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const skipLink = screen.getByRole('link', { name: /Skip to main content/i })
    expect(skipLink).toHaveAttribute('href', '#main-content')

    const mainRegion = screen.getByRole('main')
    expect(mainRegion).toHaveAttribute('id', 'main-content')

    // Mobile drawer opens cleanly for <=1024px viewports
    const mobileBtn = screen.getByRole('button', { name: /Open navigation menu/i })
    fireEvent.click(mobileBtn)
    expect(screen.getByRole('dialog', { name: 'Navigation drawer' })).toBeInTheDocument()
  })

  it('ProjectDetailPage renders Stage 1 tokenized header, responsive wrapped actions, and dataset table', async () => {
    vi.mocked(apiService.projects.get).mockResolvedValueOnce({
      id: 'proj-1',
      organization_id: 'org-1',
      name: 'Enterprise Revenue BI',
      description: 'Core executive reporting project',
      settings: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })
    vi.mocked(apiService.datasets.list).mockResolvedValueOnce({
      items: [
        {
          id: 'ds-1',
          project_id: 'proj-1',
          name: 'Q4 Ledger',
          source_type: 'excel',
          original_filename: 'q4_ledger.xlsx',
          status: 'ready',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
          active_version: {
            id: 'v1',
            version_number: 2,
            checksum: 'abc',
            file_size_bytes: 1024,
            total_row_count: 420,
            total_column_count: 8,
            status: 'ready',
            created_at: '2026-01-02T00:00:00Z',
            is_active: true,
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })

    render(
      <MemoryRouter initialEntries={['/projects/proj-1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Enterprise Revenue BI')).toBeInTheDocument()
      expect(screen.getByText('Q4 Ledger')).toBeInTheDocument()
      expect(screen.getByText('420 rows × 8 cols')).toBeInTheDocument()
    })
  })

  it('ProtectedRoute displays calm tokenized session recovery indicator while loading', () => {
    useAuthStore.setState({ isLoading: true, isAuthenticated: false })

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Private</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Restoring session…')).toBeInTheDocument()
  })
})
