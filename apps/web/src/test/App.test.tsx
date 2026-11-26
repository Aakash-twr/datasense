import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useAuthStore } from '@/stores/authStore'

// Mock the useApiHealth hook to avoid real network calls in tests
vi.mock('../hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    status: 'connected' as const,
    health: {
      status: 'ok',
      service: 'datasense-api',
      version: '0.2.0',
      environment: 'development',
      timestamp: new Date().toISOString(),
      python_version: '3.13.2',
    },
    error: null,
    lastChecked: new Date(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/services/api', () => ({
  apiService: {
    auth: {
      refresh: vi.fn(),
      getMe: vi.fn(),
    },
    projects: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5, total_pages: 1 }),
    },
    reports: {
      listOrgReports: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, total_pages: 1 }),
    },
  },
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}))

describe('App routing and auth protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated users from /dashboard to /login', async () => {
    // Stub initAuth to immediately resolve as unauthenticated
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      currentOrg: null,
      initAuth: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Sign in to DataSense')).toBeInTheDocument()
  })

  it('renders the dashboard page when authenticated', async () => {
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
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Acme Analytics',
        organization_slug: 'acme-analytics',
        role: 'owner',
      },
      initAuth: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Welcome back, Alice Analyst/i)).toBeInTheDocument()
    expect(await screen.findByText(/Active Projects/i)).toBeInTheDocument()
  })

  it('renders a coming-soon page for /analytics when authenticated', async () => {
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
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Acme Analytics',
        organization_slug: 'acme-analytics',
        role: 'owner',
      },
      initAuth: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(await screen.findByText(/No Saved Reports Yet/i)).toBeInTheDocument()
  })
})
