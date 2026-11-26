import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { OnboardingGuide } from '@/components/common/OnboardingGuide'
import { HelpModal } from '@/components/common/HelpModal'
import { ObservabilityPage } from '@/pages/admin/ObservabilityPage'
import { apiService } from '@/services/api'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', name: 'Owner User', email: 'owner@example.com' },
    currentOrg: {
      organization_id: 'org-1',
      organization_name: 'Acme Analytics',
      organization_slug: 'acme',
      role: 'owner',
    },
  }),
}))

function BrokenComponent(): JSX.Element {
  throw new Error('Simulated UI Crash')
}

describe('Phase 7 UI Polish & Observability Components', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('ErrorBoundary catches rendering failures safely', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/Simulated UI Crash/i)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('OnboardingGuide tracks steps and dismisses persistently', () => {
    render(
      <MemoryRouter>
        <OnboardingGuide projectCount={1} datasetCount={0} agentRunCount={0} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Quick Start Checklist/i)).toBeInTheDocument()
    expect(screen.getByText(/Done/i)).toBeInTheDocument()

    const dismissBtn = screen.getByRole('button', { name: /Dismiss onboarding checklist/i })
    fireEvent.click(dismissBtn)

    expect(screen.queryByText(/Quick Start Checklist/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem('datasense_onboarding_dismissed')).toBe('true')
  })

  it('HelpModal renders documentation topics and closes on button click', () => {
    const onClose = vi.fn()
    render(<HelpModal open={true} onClose={onClose} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/DataSense Platform Guide/i)).toBeInTheDocument()
    expect(screen.getByText(/Deterministic SQL Safety/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Got it/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ObservabilityPage fetches and renders admin telemetry snapshot', async () => {
    vi.spyOn(apiService.system, 'getAdminObservability').mockResolvedValue({
      timestamp: new Date().toISOString(),
      environment: 'development',
      version: '0.7.0',
      shutting_down: false,
      dependencies: {
        database: 'ok',
        duckdb: 'ok',
        storage: 'ok',
        ai_configured: true,
        ai_model: 'gemini-3.5-flash',
      },
      database_pool: {
        dialect: 'sqlite',
      },
      metrics: {
        total_http_requests: 120,
        http_5xx_errors: 0,
        avg_http_latency_ms: 4.2,
        rate_limit_rejections: 1,
        query_executions: 15,
        query_failures: 0,
        ingestion_failures: 0,
        gemini_errors: 0,
        recent_errors: [],
      },
      agent_runs_by_status: { completed: 3 },
      ingestion_jobs_by_status: { completed: 4 },
    })

    render(<ObservabilityPage />)

    await waitFor(() => {
      expect(screen.getByText(/Operational Observability/i)).toBeInTheDocument()
      expect(screen.getByText('120')).toBeInTheDocument()
      expect(screen.getByText(/gemini-3\.5-flash/i)).toBeInTheDocument()
      expect(screen.getByText(/Queries: 15/i)).toBeInTheDocument()
    })
  })
})
