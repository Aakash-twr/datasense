import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AICopilotWorkspacePage } from '@/pages/ai/AICopilotWorkspacePage'
import { apiService } from '@/services/api'
import type {
  AIConversationDetails,
  AIConversationListResponse,
  AIStatusResponse,
  CatalogResponse,
  QueryExecutionResponse,
} from '@/types'

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
    },
    ai: {
      getStatus: vi.fn(),
      acknowledgePrivacy: vi.fn(),
      createConversation: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      sendMessage: vi.fn(),
      generateInsights: vi.fn(),
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

function AnalyticsStudioLocationProbe() {
  const location = useLocation()
  const state = (location.state as { preloadedSql?: string } | null) || null
  return (
    <div>
      <span>Analytics Workspace</span>
      {state?.preloadedSql && <pre data-testid="preloaded-sql">{state.preloadedSql}</pre>}
    </div>
  )
}

describe('Stage 4 — AI Analytics Copilot Redesign', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Enterprise Finance',
      slug: 'enterprise-finance',
      description: 'Finance workspace',
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
        dataset_name: 'Ledger Entries',
        schema_name: 'ledger_entries',
        version_id: 'ver-1',
        version_number: 1,
        source_format: 'parquet',
        tables: [
          {
            table_name: 'gl_lines',
            schema_name: 'ledger_entries',
            qualified_name: 'ledger_entries.gl_lines',
            display_name: 'gl_lines',
            row_count: 12000,
            column_count: 3,
            columns: [
              {
                name: 'department',
                display_name: 'department',
                data_type: 'VARCHAR',
                canonical_type: 'string',
                is_nullable: false,
                is_sensitive: false,
                sensitivity_category: null,
              },
              {
                name: 'expense_usd',
                display_name: 'expense_usd',
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

  const mockAiStatus: AIStatusResponse = {
    enabled: true,
    configured: true,
    model: 'gemini-2.5-flash',
    available: true,
    privacy_acknowledged: true,
    message: 'AI Copilot ready',
  }

  const mockConversations: AIConversationListResponse = {
    items: [
      {
        id: 'conv-1',
        title: 'Q4 Department Spend',
        selected_dataset_ids: ['ds-1'],
        created_at: '2026-01-01T09:00:00Z',
        updated_at: '2026-01-01T09:10:00Z',
        message_count: 2,
      },
      {
        id: 'conv-2',
        title: 'Vendor Anomaly Check',
        selected_dataset_ids: ['ds-1'],
        created_at: '2026-01-01T08:00:00Z',
        updated_at: '2026-01-01T08:05:00Z',
        message_count: 2,
      },
    ],
    total: 2,
    page: 1,
    page_size: 10,
    total_pages: 1,
  }

  const conv1Details: AIConversationDetails = {
    id: 'conv-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    title: 'Q4 Department Spend',
    selected_dataset_ids: ['ds-1'],
    created_at: '2026-01-01T09:00:00Z',
    updated_at: '2026-01-01T09:10:00Z',
    messages: [
      {
        id: 'm1',
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Summarize spend by department',
        created_at: '2026-01-01T09:00:00Z',
      },
      {
        id: 'm2',
        conversation_id: 'conv-1',
        role: 'assistant',
        content:
          '### Spend Breakdown Overview\n- Engineering accounts for 48% of operating spend.\n- Marketing totals $124500 across Q4.',
        generated_sql:
          'SELECT department, SUM(expense_usd) AS total_spend FROM ledger_entries.gl_lines GROUP BY department ORDER BY total_spend DESC',
        sql_explanation: 'Totals operating expense in USD per department.',
        sql_validation_status: 'valid',
        structured_metadata: {
          response_type: 'sql_query',
          assumptions: ['Uses posted ledger rows only'],
          requires_clarification: true,
          clarification_question: 'Should intercompany transfers be excluded from totals?',
          visualization_recommendation: {
            chart_type: 'bar',
            x_axis: 'department',
            y_axis: 'total_spend',
            title: 'Department Spend',
          },
          suggested_follow_up_questions: ['Compare against Q3 spend'],
        },
        created_at: '2026-01-01T09:00:04Z',
      },
    ],
  }

  const conv2Details: AIConversationDetails = {
    id: 'conv-2',
    organization_id: 'org-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    title: 'Vendor Anomaly Check',
    selected_dataset_ids: ['ds-1'],
    created_at: '2026-01-01T08:00:00Z',
    updated_at: '2026-01-01T08:05:00Z',
    messages: [
      {
        id: 'm2-1',
        conversation_id: 'conv-2',
        role: 'assistant',
        content: 'Loaded vendor anomaly summary.',
        created_at: '2026-01-01T08:00:01Z',
      },
    ],
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
    vi.mocked(apiService.ai.getStatus).mockResolvedValue(mockAiStatus)
    vi.mocked(apiService.ai.listConversations).mockResolvedValue(mockConversations)
    vi.mocked(apiService.ai.getConversation).mockImplementation(async (_projId, convId) =>
      convId === 'conv-2' ? conv2Details : conv1Details,
    )
    vi.mocked(apiService.ai.updateConversation).mockResolvedValue(conv1Details)
  })

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/ai-analytics']}>
        <Routes>
          <Route path="/projects/:projectId/ai-analytics" element={<AICopilotWorkspacePage />} />
          <Route
            path="/projects/:projectId/analytics"
            element={<AnalyticsStudioLocationProbe />}
          />
        </Routes>
      </MemoryRouter>,
    )

  it('supports conversation search, switching, context panel collapse, and privacy review', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spend Breakdown Overview')).toBeInTheDocument()
    })

    // Search conversations inside sidebar & switch to conv-2
    const convSidebar = screen.getByLabelText('Conversation history')
    const searchInput = screen.getByPlaceholderText('Search conversations...')
    fireEvent.change(searchInput, { target: { value: 'Vendor' } })
    expect(within(convSidebar).queryByText('Q4 Department Spend')).not.toBeInTheDocument()
    fireEvent.click(within(convSidebar).getByText('Vendor Anomaly Check'))

    await waitFor(() => {
      expect(apiService.ai.getConversation).toHaveBeenCalledWith('proj-1', 'conv-2')
      expect(screen.getByText('Loaded vendor anomaly summary.')).toBeInTheDocument()
    })

    // Collapse and re-expand right Dataset Context panel
    fireEvent.click(screen.getByRole('button', { name: /Collapse Dataset Context/i }))
    expect(screen.queryByText('Available Datasets')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show Dataset Context/i }))
    expect(screen.getByText('Available Datasets')).toBeInTheDocument()

    // Non-intrusive privacy review modal opens and closes cleanly
    fireEvent.click(screen.getByRole('button', { name: /Schema-Only Privacy/i }))
    expect(screen.getByText('AI Analytics Copilot Privacy Notice')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Close privacy notice/i }))
    expect(screen.queryByText('AI Analytics Copilot Privacy Notice')).not.toBeInTheDocument()
  })

  it('revalidates generated SQL on backend before execution, renders table/chart views, and supports Open in SQL Editor', async () => {
    vi.mocked(apiService.analytics.validate).mockResolvedValueOnce({
      is_valid: false,
      error: 'Column expense_usd not found in selected scope',
      tables_referenced: ['ledger_entries.gl_lines'],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Clarification Needed:')).toBeInTheDocument()
    })

    // Clicking Run Query when backend validation fails blocks execution cleanly
    fireEvent.click(screen.getByRole('button', { name: /Run Query/i }))

    await waitFor(() => {
      expect(apiService.analytics.validate).toHaveBeenCalledWith('proj-1', {
        sql: expect.stringContaining('SELECT department, SUM(expense_usd)'),
        dataset_ids: ['ds-1'],
      })
      expect(
        screen.getByText('Column expense_usd not found in selected scope'),
      ).toBeInTheDocument()
    })
    expect(apiService.analytics.execute).not.toHaveBeenCalled()

    // Now return valid validation + actual query results and test Table / Chart switch
    vi.mocked(apiService.analytics.validate).mockResolvedValueOnce({
      is_valid: true,
      tables_referenced: ['ledger_entries.gl_lines'],
    })
    const execResult: QueryExecutionResponse = {
      query_id: 'q-401',
      status: 'success',
      columns: [
        { name: 'department', type: 'VARCHAR' },
        { name: 'total_spend', type: 'DOUBLE' },
      ],
      rows: [
        ['Engineering', 210000],
        ['Marketing', 124500],
      ],
      row_count: 2,
      execution_time_ms: 9.2,
      truncated: false,
    }
    vi.mocked(apiService.analytics.execute).mockResolvedValueOnce(execResult)

    fireEvent.click(screen.getByRole('button', { name: /Run Query/i }))

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument()
      expect(screen.getByText('210000')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Chart View/i }))
    expect(screen.getByText('X-Axis (Category):')).toBeInTheDocument()

    // Copy SQL action
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce()
    fireEvent.click(screen.getByRole('button', { name: /Copy SQL/i }))
    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('SUM(expense_usd)'))
    })

    // Open in SQL Editor passes preloadedSql to SQL Studio route
    fireEvent.click(screen.getByRole('button', { name: /Open in SQL Editor/i }))
    await waitFor(() => {
      expect(screen.getByText('Analytics Workspace')).toBeInTheDocument()
      expect(screen.getByTestId('preloaded-sql')).toHaveTextContent(
        'SELECT department, SUM(expense_usd) AS total_spend',
      )
    })
  })
})
