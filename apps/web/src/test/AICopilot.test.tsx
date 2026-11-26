import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AICopilotWorkspacePage } from '@/pages/ai/AICopilotWorkspacePage'
import { apiService } from '@/services/api'
import type {
  AIConversationDetails,
  AIConversationListResponse,
  AIMessageItem,
  AIStatusResponse,
  CatalogResponse,
  QueryExecutionResponse,
} from '@/types'

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

describe('AICopilotWorkspacePage', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Retail Analytics',
      slug: 'retail-analytics',
      description: 'Retail test project',
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
        dataset_name: 'E-Commerce Transactions',
        schema_name: 'ecommerce_transactions',
        version_id: 'ver-1',
        version_number: 1,
        source_format: 'csv',
        tables: [
          {
            table_name: 'orders',
            schema_name: 'ecommerce_transactions',
            qualified_name: 'ecommerce_transactions.orders',
            display_name: 'orders',
            row_count: 5000,
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
                name: 'category',
                display_name: 'category',
                data_type: 'VARCHAR',
                canonical_type: 'string',
                is_nullable: false,
                is_sensitive: false,
                sensitivity_category: null,
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

  const mockAiStatusAcknowledged: AIStatusResponse = {
    enabled: true,
    configured: true,
    model: 'gemini-2.5-flash',
    available: true,
    privacy_acknowledged: true,
    message: 'AI Copilot ready',
  }

  const mockAiStatusUnacknowledged: AIStatusResponse = {
    enabled: true,
    configured: true,
    model: 'gemini-2.5-flash',
    available: true,
    privacy_acknowledged: false,
    message: 'Privacy acknowledgment required',
  }

  const mockConversationList: AIConversationListResponse = {
    items: [
      {
        id: 'conv-1',
        title: 'Sales Summary',
        selected_dataset_ids: ['ds-1'],
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:05:00Z',
        message_count: 2,
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    total_pages: 1,
  }

  const mockConversationDetails: AIConversationDetails = {
    id: 'conv-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    user_id: 'user-1',
    title: 'Sales Summary',
    selected_dataset_ids: ['ds-1'],
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:05:00Z',
    messages: [
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Show total sales by category',
        created_at: '2026-01-01T10:00:00Z',
      },
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        role: 'assistant',
        content: 'Here is the total sales broken down by category from your transactions table.',
        generated_sql: 'SELECT category, SUM(amount) AS total_sales FROM ecommerce_transactions.orders GROUP BY category ORDER BY total_sales DESC',
        sql_explanation: 'Aggregates amount by category and orders descending.',
        sql_validation_status: 'valid',
        structured_metadata: {
          response_type: 'sql_query',
          assumptions: ['Includes all completed orders', 'Currency amounts in USD'],
          requires_clarification: false,
          clarification_question: null,
          suggested_follow_up_questions: ['What is the average transaction value?', 'Show month-over-trend'],
        },
        created_at: '2026-01-01T10:00:05Z',
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = () => true
    vi.mocked(apiService.projects.list).mockResolvedValue({ items: mockProjects, total: 1, page: 1, page_size: 10, total_pages: 1 })
    vi.mocked(apiService.analytics.getCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(apiService.ai.getStatus).mockResolvedValue(mockAiStatusAcknowledged)
    vi.mocked(apiService.ai.listConversations).mockResolvedValue(mockConversationList)
    vi.mocked(apiService.ai.getConversation).mockResolvedValue(mockConversationDetails)
    vi.mocked(apiService.ai.createConversation).mockResolvedValue({
      id: 'conv-default-new',
      organization_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      title: 'New Analytics Chat',
      selected_dataset_ids: ['ds-1'],
      created_at: '2026-01-01T12:00:00Z',
      updated_at: '2026-01-01T12:00:00Z',
      messages: [],
    })
  })

  const renderComponent = (projectId = 'proj-1') => {
    return render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/ai-analytics`]}>
        <Routes>
          <Route path="/projects/:projectId/ai-analytics" element={<AICopilotWorkspacePage />} />
          <Route path="/projects/:projectId/analytics" element={<div>Analytics Workspace Page</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders AI Copilot workspace layout with header, conversation sidebar, and dataset context', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('AI Analytics Copilot')).toBeInTheDocument()
    })

    expect(screen.getByText('Retail Analytics')).toBeInTheDocument()
    expect(screen.getByText('E-Commerce Transactions')).toBeInTheDocument()
    expect(screen.getByText('Sales Summary')).toBeInTheDocument()
    expect(screen.getByText(/DuckDB SQL & Conversational Insights/i)).toBeInTheDocument()
  })

  it('displays the Privacy Disclosure Modal when privacy is not yet acknowledged', async () => {
    vi.mocked(apiService.ai.getStatus).mockResolvedValueOnce(mockAiStatusUnacknowledged)
    vi.mocked(apiService.ai.acknowledgePrivacy).mockResolvedValueOnce({
      acknowledged: true,
      acknowledged_at: '2026-01-01T12:30:00Z',
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('AI Analytics Copilot Privacy Notice')).toBeInTheDocument()
    })

    expect(screen.getByText(/Only schema metadata is sent/i)).toBeInTheDocument()
    expect(screen.getByText(/Raw data is strictly protected/i)).toBeInTheDocument()

    const agreeButton = screen.getByRole('button', { name: /I Understand & Agree/i })
    fireEvent.click(agreeButton)

    await waitFor(() => {
      expect(apiService.ai.acknowledgePrivacy).toHaveBeenCalled()
      expect(screen.queryByText('AI Analytics Copilot Privacy Notice')).not.toBeInTheDocument()
    })
  })

  it('displays conversation messages, SQL draft card, and assumptions', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Show total sales by category')).toBeInTheDocument()
    })

    expect(screen.getByText(/Here is the total sales broken down by category/i)).toBeInTheDocument()
    expect(screen.getByText('Validated (DuckDB)')).toBeInTheDocument()
    expect(screen.getByText(/SELECT category, SUM\(amount\) AS total_sales/i)).toBeInTheDocument()
    expect(screen.getByText(/Includes all completed orders/i)).toBeInTheDocument()
    expect(screen.getByText('What is the average transaction value?')).toBeInTheDocument()
  })

  it('executes generated SQL when "Run Query" button is clicked in the draft card', async () => {
    const mockExecutionRes: QueryExecutionResponse = {
      query_id: 'q-201',
      status: 'success',
      columns: [
        { name: 'category', type: 'VARCHAR' },
        { name: 'total_sales', type: 'DOUBLE' },
      ],
      rows: [
        ['Electronics', 45000.0],
        ['Apparel', 23000.0],
      ],
      row_count: 2,
      execution_time_ms: 12.4,
      truncated: false,
    }

    vi.mocked(apiService.analytics.execute).mockResolvedValueOnce(mockExecutionRes)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Query/i })).toBeInTheDocument()
    })

    const runBtn = screen.getByRole('button', { name: /Run Query/i })
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(apiService.analytics.execute).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({
          sql: expect.stringContaining('SELECT category, SUM(amount) AS total_sales'),
          limit: 100,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Electronics')).toBeInTheDocument()
      expect(screen.getByText('45000')).toBeInTheDocument()
      expect(screen.getByText('Apparel')).toBeInTheDocument()
    })
  })

  it('submits a new prompt and appends user and assistant messages', async () => {
    const mockAssistantResponse: AIMessageItem = {
      id: 'msg-3',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Here is the average amount across all orders.',
      generated_sql: 'SELECT AVG(amount) AS avg_amount FROM ecommerce_transactions.orders',
      sql_explanation: 'Calculates the overall average transaction amount.',
      sql_validation_status: 'valid',
      structured_metadata: {
        response_type: 'sql_query',
        assumptions: [],
        requires_clarification: false,
        clarification_question: null,
        suggested_follow_up_questions: [],
      },
      created_at: '2026-01-01T10:10:00Z',
    }

    vi.mocked(apiService.ai.sendMessage).mockResolvedValueOnce(mockAssistantResponse)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask a question about your data/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Ask a question about your data/i)
    fireEvent.change(input, { target: { value: 'What is the average transaction amount?' } })

    const sendBtn = screen.getByRole('button', { name: /Ask AI/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(apiService.ai.sendMessage).toHaveBeenCalledWith(
        'proj-1',
        'conv-1',
        { message: 'What is the average transaction amount?' },
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Here is the average amount across all orders.')).toBeInTheDocument()
      expect(screen.getByText(/SELECT AVG\(amount\) AS avg_amount/i)).toBeInTheDocument()
    })
  })

  it('submits a prompt when clicking a suggested follow-up question', async () => {
    const mockAssistantResponse: AIMessageItem = {
      id: 'msg-4',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'The average transaction value is $84.20.',
      generated_sql: null,
      sql_explanation: null,
      sql_validation_status: null,
      structured_metadata: {
        response_type: 'conversational',
        assumptions: [],
        requires_clarification: false,
        clarification_question: null,
        suggested_follow_up_questions: [],
      },
      created_at: '2026-01-01T10:15:00Z',
    }

    vi.mocked(apiService.ai.sendMessage).mockResolvedValueOnce(mockAssistantResponse)

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('What is the average transaction value?')).toBeInTheDocument()
    })

    const followUpBtn = screen.getByText('What is the average transaction value?')
    fireEvent.click(followUpBtn)

    await waitFor(() => {
      expect(apiService.ai.sendMessage).toHaveBeenCalledWith(
        'proj-1',
        'conv-1',
        { message: 'What is the average transaction value?' },
      )
    })
  })

  it('generates and displays automated AI insights when clicking "Generate AI Insights"', async () => {
    vi.mocked(apiService.ai.generateInsights).mockResolvedValueOnce([
      {
        dataset_id: 'ds-1',
        dataset_name: 'E-Commerce Transactions',
        insights: [
          {
            title: 'High Transaction Density in Electronics',
            category: 'trend',
            description: 'Electronics accounts for 68% of total order value despite 40% volume.',
            suggested_question: 'Target promotions toward high-margin accessories.',
          },
        ],
      },
    ])

    renderComponent()

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Generate AI Insights/i })
      expect(btn).toBeEnabled()
    })

    const insightsBtn = screen.getByRole('button', { name: /Generate AI Insights/i })
    fireEvent.click(insightsBtn)

    await waitFor(() => {
      expect(apiService.ai.generateInsights).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ dataset_ids: ['ds-1'] }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('High Transaction Density in Electronics')).toBeInTheDocument()
      expect(screen.getByText(/Electronics accounts for 68% of total order value/i)).toBeInTheDocument()
    })
  })

  it('creates a new conversation when "New Analysis" button is clicked', async () => {
    vi.mocked(apiService.ai.createConversation).mockResolvedValueOnce({
      id: 'conv-2',
      organization_id: 'org-1',
      project_id: 'proj-1',
      user_id: 'user-1',
      title: 'New Analytics Chat',
      selected_dataset_ids: ['ds-1'],
      created_at: '2026-01-01T11:00:00Z',
      updated_at: '2026-01-01T11:00:00Z',
      messages: [],
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Analysis/i })).toBeInTheDocument()
    })

    const newChatBtn = screen.getByRole('button', { name: /New Analysis/i })
    fireEvent.click(newChatBtn)

    await waitFor(() => {
      expect(apiService.ai.createConversation).toHaveBeenCalledWith('proj-1', {
        title: 'New Analytics Chat',
        dataset_ids: ['ds-1'],
      })
    })
  })

  it('deletes a conversation when the delete button is clicked in the sidebar', async () => {
    vi.mocked(apiService.ai.deleteConversation).mockResolvedValueOnce()

    renderComponent()

    await waitFor(() => {
      expect(screen.getByTitle(/Delete conversation/i)).toBeInTheDocument()
    })

    const deleteBtn = screen.getByTitle(/Delete conversation/i)
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(apiService.ai.deleteConversation).toHaveBeenCalledWith('proj-1', 'conv-1')
    })
  })
})
