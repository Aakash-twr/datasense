import type {
  AIConversationDetails,
  AIConversationListResponse,
  AIInsightResponse,
  AIMessageItem,
  AISQLExplanationResponse,
  AIStatusResponse,
  AdminObservabilityResponse,
  AgentRunItem,
  AgentRunListResponse,
  AgentRunResultsResponse,
  AgentRunStepItem,
  AgentWorkspaceDashboardStats,
  AnalysisReportItem,
  AnalysisReportListResponse,
  AuthMeResponse,
  CatalogResponse,
  Dataset,
  DatasetListResponse,
  DatasetPreviewResponse,
  DatasetProfileResponse,
  DatasetSchemaResponse,
  DatasetStatusResponse,
  DatasetUploadResponse,
  DatasetVersionSummary,
  HealthResponse,
  IngestionJob,
  OrganizationWithRole,
  Project,
  ProjectListResponse,
  QueryExecutionResponse,
  QueryHistoryListResponse,
  QueryRunResponse,
  QueryValidationResponse,
  SavedQueryCreate,
  SavedQueryListResponse,
  SavedQueryResponse,
  SavedQueryUpdate,
  TokenResponse,
  User,
} from '@/types'

const API_BASE = '/api/v1'

// In-memory access token storage (never localStorage)
let inMemoryAccessToken: string | null = null

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken
}

// Queue mechanism for handling simultaneous token refreshes
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'DataSense',
        },
      })

      if (!response.ok) {
        setAccessToken(null)
        return null
      }

      const data = (await response.json()) as TokenResponse
      setAccessToken(data.access_token)
      return data.access_token
    } catch {
      setAccessToken(null)
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  retryOnAuth = true,
): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const headers: Record<string, string> = {
    'X-Requested-With': 'DataSense',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init?.headers as Record<string, string>),
  }

  if (inMemoryAccessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${inMemoryAccessToken}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  // Handle 401 Unauthorized with token refresh and retry
  if (response.status === 401 && retryOnAuth && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && !path.startsWith('/auth/refresh')) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      return request<T>(path, init, false)
    }
  }

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errJson = await response.json()
      if (errJson && typeof errJson.detail === 'string') {
        errorDetail = errJson.detail
      } else if (errJson && typeof errJson.message === 'string') {
        errorDetail = errJson.message
      }
    } catch {
      // Ignore JSON parse failure on non-JSON error bodies
    }
    throw new ApiError(response.status, errorDetail)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json() as Promise<T>
}

export const apiService = {
  // System Health & Observability
  getHealth: (): Promise<HealthResponse> =>
    request<HealthResponse>('/health', undefined, false),

  system: {
    getAdminObservability: (orgId?: string): Promise<AdminObservabilityResponse> =>
      request<AdminObservabilityResponse>('/admin/observability', {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },

  // Authentication
  auth: {
    register: (data: {
      name: string
      email: string
      password: string
      organization_name: string
    }): Promise<TokenResponse> =>
      request<TokenResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    login: (data: { email: string; password: string }): Promise<TokenResponse> =>
      request<TokenResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    refresh: (): Promise<TokenResponse> =>
      request<TokenResponse>('/auth/refresh', {
        method: 'POST',
      }),

    logout: (): Promise<{ message: string }> =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
      }),

    getMe: (): Promise<AuthMeResponse> =>
      request<AuthMeResponse>('/auth/me'),

    updateProfile: (data: { name?: string; avatar_url?: string | null }): Promise<User> =>
      request<User>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Organizations
  organizations: {
    list: (): Promise<OrganizationWithRole[]> =>
      request<OrganizationWithRole[]>('/organizations'),

    getCurrent: (orgId?: string): Promise<OrganizationWithRole> =>
      request<OrganizationWithRole>('/organizations/current', {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    updateCurrent: (
      data: { name?: string },
      orgId?: string,
    ): Promise<OrganizationWithRole> =>
      request<OrganizationWithRole>('/organizations/current', {
        method: 'PATCH',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),
  },

  // Projects
  projects: {
    list: (params?: {
      page?: number
      page_size?: number
      search?: string
      include_archived?: boolean
      orgId?: string
    }): Promise<ProjectListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', params.page.toString())
      if (params?.page_size) q.set('page_size', params.page_size.toString())
      if (params?.search) q.set('search', params.search)
      if (params?.include_archived) q.set('include_archived', 'true')
      const queryStr = q.toString() ? `?${q.toString()}` : ''

      return request<ProjectListResponse>(`/projects${queryStr}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    get: (projectId: string, orgId?: string): Promise<Project> =>
      request<Project>(`/projects/${projectId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    create: (
      data: { name: string; description?: string; settings?: Record<string, unknown> },
      orgId?: string,
    ): Promise<Project> =>
      request<Project>('/projects', {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    update: (
      projectId: string,
      data: { name?: string; description?: string; settings?: Record<string, unknown> },
      orgId?: string,
    ): Promise<Project> =>
      request<Project>(`/projects/${projectId}`, {
        method: 'PATCH',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    archive: (projectId: string, orgId?: string): Promise<{ message: string; id: string }> =>
      request<{ message: string; id: string }>(`/projects/${projectId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },

  // Datasets & Ingestion
  datasets: {
    upload: (
      projectId: string,
      file: File,
      name?: string,
      description?: string,
      orgId?: string,
    ): Promise<DatasetUploadResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      if (name) formData.append('dataset_name', name)
      if (description) formData.append('description', description)

      return request<DatasetUploadResponse>(`/projects/${projectId}/datasets`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: formData,
      })
    },

    uploadWithProgress: async (
      projectId: string,
      file: File,
      options?: {
        name?: string
        description?: string
        orgId?: string
        onProgress?: (percent: number) => void
      },
    ): Promise<DatasetUploadResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      if (options?.name) formData.append('dataset_name', options.name)
      if (options?.description) formData.append('description', options.description)

      const executeXhr = (token: string | null): Promise<{ status: number; body: string }> =>
        new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${API_BASE}/projects/${projectId}/datasets`)
          xhr.withCredentials = true
          xhr.setRequestHeader('X-Requested-With', 'DataSense')
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          if (options?.orgId) xhr.setRequestHeader('X-Organization-Id', options.orgId)

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && ev.total > 0) {
              const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100))
              options?.onProgress?.(pct)
            }
          }

          xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
          xhr.onerror = () => reject(new ApiError(0, 'Network error while uploading file.'))
          xhr.send(formData)
        })

      let res = await executeXhr(inMemoryAccessToken)
      if (res.status === 401) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          res = await executeXhr(refreshed)
        }
      }

      if (res.status < 200 || res.status >= 300) {
        let detail = `Upload failed (${res.status})`
        try {
          const parsed = JSON.parse(res.body)
          if (parsed?.detail && typeof parsed.detail === 'string') {
            detail = parsed.detail
          }
        } catch {
          // ignore non-JSON body
        }
        throw new ApiError(res.status, detail)
      }

      options?.onProgress?.(100)
      return JSON.parse(res.body) as DatasetUploadResponse
    },

    list: (
      projectId: string,
      params?: {
        page?: number
        page_size?: number
        search?: string
        status?: string
        include_archived?: boolean
        orgId?: string
      },
    ): Promise<DatasetListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      if (params?.search) q.set('search', params.search)
      if (params?.status) q.set('status', params.status)
      if (params?.include_archived !== undefined)
        q.set('include_archived', String(params.include_archived))

      const queryStr = q.toString() ? `?${q.toString()}` : ''
      return request<DatasetListResponse>(`/projects/${projectId}/datasets${queryStr}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    get: (datasetId: string, orgId?: string): Promise<Dataset> =>
      request<Dataset>(`/datasets/${datasetId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getStatus: (datasetId: string, orgId?: string): Promise<DatasetStatusResponse> =>
      request<DatasetStatusResponse>(`/datasets/${datasetId}/status`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getJob: (jobId: string, orgId?: string): Promise<IngestionJob> =>
      request<IngestionJob>(`/ingestion-jobs/${jobId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getSchema: (datasetId: string, versionId?: string, orgId?: string): Promise<DatasetSchemaResponse> => {
      const query = versionId ? `?version_id=${versionId}` : ''
      return request<DatasetSchemaResponse>(`/datasets/${datasetId}/schema${query}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      })
    },

    getProfile: (
      datasetId: string,
      params?: { version_id?: string; table_id?: string; orgId?: string },
    ): Promise<DatasetProfileResponse> => {
      const q = new URLSearchParams()
      if (params?.version_id) q.set('version_id', params.version_id)
      if (params?.table_id) q.set('table_id', params.table_id)
      const query = q.toString() ? `?${q.toString()}` : ''

      return request<DatasetProfileResponse>(`/datasets/${datasetId}/profile${query}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    getPreview: (
      datasetId: string,
      params?: { table_id?: string; limit?: number; offset?: number; orgId?: string },
    ): Promise<DatasetPreviewResponse> => {
      const q = new URLSearchParams()
      if (params?.table_id) q.set('table_id', params.table_id)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset !== undefined) q.set('offset', String(params.offset))
      const query = q.toString() ? `?${q.toString()}` : ''

      return request<DatasetPreviewResponse>(`/datasets/${datasetId}/preview${query}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    getVersions: (datasetId: string, orgId?: string): Promise<DatasetVersionSummary[]> =>
      request<DatasetVersionSummary[]>(`/datasets/${datasetId}/versions`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    uploadVersion: (
      datasetId: string,
      file: File,
      orgId?: string,
    ): Promise<DatasetUploadResponse> => {
      const formData = new FormData()
      formData.append('file', file)

      return request<DatasetUploadResponse>(`/datasets/${datasetId}/versions`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: formData,
      })
    },

    archive: (datasetId: string, orgId?: string): Promise<void> =>
      request<void>(`/datasets/${datasetId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },

  // Analytics Engine & SQL Queries (Phase 4)
  analytics: {
    getCatalog: (
      projectId: string,
      datasetIds?: string[],
      orgId?: string,
    ): Promise<CatalogResponse> => {
      const q = new URLSearchParams()
      datasetIds?.forEach((id) => q.append('dataset_ids', id))
      const queryStr = q.toString() ? `?${q.toString()}` : ''
      return request<CatalogResponse>(`/projects/${projectId}/query/catalog${queryStr}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      })
    },

    validate: (
      projectId: string,
      data: { sql: string; dataset_ids: string[] },
      orgId?: string,
    ): Promise<QueryValidationResponse> =>
      request<QueryValidationResponse>(`/projects/${projectId}/query/validate`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    execute: (
      projectId: string,
      data: { sql: string; dataset_ids: string[]; limit?: number },
      orgId?: string,
    ): Promise<QueryExecutionResponse> =>
      request<QueryExecutionResponse>(`/projects/${projectId}/query/execute`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    getQueryStatus: (
      projectId: string,
      queryId: string,
      orgId?: string,
    ): Promise<QueryRunResponse> =>
      request<QueryRunResponse>(`/projects/${projectId}/query/${queryId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getHistory: (
      projectId: string,
      params?: { page?: number; page_size?: number; orgId?: string },
    ): Promise<QueryHistoryListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const queryStr = q.toString() ? `?${q.toString()}` : ''
      return request<QueryHistoryListResponse>(`/projects/${projectId}/query/history${queryStr}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    deleteHistory: (projectId: string, queryId: string, orgId?: string): Promise<void> =>
      request<void>(`/projects/${projectId}/query/history/${queryId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    createSavedQuery: (
      projectId: string,
      data: SavedQueryCreate,
      orgId?: string,
    ): Promise<SavedQueryResponse> =>
      request<SavedQueryResponse>(`/projects/${projectId}/saved-queries`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    getSavedQueries: (
      projectId: string,
      params?: { page?: number; page_size?: number; orgId?: string },
    ): Promise<SavedQueryListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const queryStr = q.toString() ? `?${q.toString()}` : ''
      return request<SavedQueryListResponse>(`/projects/${projectId}/saved-queries${queryStr}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    getSavedQuery: (
      projectId: string,
      savedQueryId: string,
      orgId?: string,
    ): Promise<SavedQueryResponse> =>
      request<SavedQueryResponse>(`/projects/${projectId}/saved-queries/${savedQueryId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    updateSavedQuery: (
      projectId: string,
      savedQueryId: string,
      data: SavedQueryUpdate,
      orgId?: string,
    ): Promise<SavedQueryResponse> =>
      request<SavedQueryResponse>(`/projects/${projectId}/saved-queries/${savedQueryId}`, {
        method: 'PUT',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    deleteSavedQuery: (
      projectId: string,
      savedQueryId: string,
      orgId?: string,
    ): Promise<void> =>
      request<void>(`/projects/${projectId}/saved-queries/${savedQueryId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },

  // Phase 5: AI Analytics Copilot
  ai: {
    getStatus: (): Promise<AIStatusResponse> =>
      request<AIStatusResponse>('/ai/status'),

    acknowledgePrivacy: (): Promise<{ acknowledged: boolean; acknowledged_at: string }> =>
      request<{ acknowledged: boolean; acknowledged_at: string }>('/ai/privacy/acknowledge', {
        method: 'POST',
      }),

    createConversation: (
      projectId: string,
      data: { title?: string; dataset_ids?: string[] },
      orgId?: string,
    ): Promise<AIConversationDetails> =>
      request<AIConversationDetails>(`/projects/${projectId}/ai/conversations`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    listConversations: (
      projectId: string,
      params?: { page?: number; page_size?: number; orgId?: string },
    ): Promise<AIConversationListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const queryStr = q.toString() ? `?${q.toString()}` : ''
      return request<AIConversationListResponse>(
        `/projects/${projectId}/ai/conversations${queryStr}`,
        {
          headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
        },
      )
    },

    getConversation: (
      projectId: string,
      conversationId: string,
      orgId?: string,
    ): Promise<AIConversationDetails> =>
      request<AIConversationDetails>(
        `/projects/${projectId}/ai/conversations/${conversationId}`,
        {
          headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        },
      ),

    updateConversation: (
      projectId: string,
      conversationId: string,
      data: { title?: string; dataset_ids?: string[] },
      orgId?: string,
    ): Promise<AIConversationDetails> =>
      request<AIConversationDetails>(
        `/projects/${projectId}/ai/conversations/${conversationId}`,
        {
          method: 'PUT',
          headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
          body: JSON.stringify(data),
        },
      ),

    deleteConversation: (
      projectId: string,
      conversationId: string,
      orgId?: string,
    ): Promise<void> =>
      request<void>(`/projects/${projectId}/ai/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    sendMessage: (
      projectId: string,
      conversationId: string,
      data: { message: string },
      orgId?: string,
    ): Promise<AIMessageItem> =>
      request<AIMessageItem>(
        `/projects/${projectId}/ai/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
          body: JSON.stringify(data),
        },
      ),

    generateInsights: (
      projectId: string,
      data: { dataset_ids?: string[] },
      orgId?: string,
    ): Promise<AIInsightResponse[]> =>
      request<AIInsightResponse[]>(`/projects/${projectId}/ai/insights`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    explainSql: (
      projectId: string,
      data: { sql: string; dataset_ids?: string[] },
      orgId?: string,
    ): Promise<AISQLExplanationResponse> =>
      request<AISQLExplanationResponse>(`/projects/${projectId}/ai/explain-sql`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),
  },

  // Multi-Agent Workflows & Reports (Phase 6)
  agents: {
    startRun: (
      projectId: string,
      data: {
        conversation_id?: string | null
        request: string
        dataset_ids: string[]
        workflow_type?: string | null
        share_aggregate_summaries_with_gemini?: boolean
      },
      orgId?: string,
    ): Promise<AgentRunItem> =>
      request<AgentRunItem>(`/projects/${projectId}/ai/agent-runs`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    getStats: (projectId: string, orgId?: string): Promise<AgentWorkspaceDashboardStats> =>
      request<AgentWorkspaceDashboardStats>(`/projects/${projectId}/ai/agent-runs/stats`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    listRuns: (
      projectId: string,
      params?: { status?: string; workflow_type?: string; page?: number; page_size?: number; orgId?: string },
    ): Promise<AgentRunListResponse> => {
      const q = new URLSearchParams()
      if (params?.status) q.set('status', params.status)
      if (params?.workflow_type) q.set('workflow_type', params.workflow_type)
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const qs = q.toString() ? `?${q.toString()}` : ''
      return request<AgentRunListResponse>(`/projects/${projectId}/ai/agent-runs${qs}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    listOrgRuns: (params?: {
      status?: string
      workflow_type?: string
      page?: number
      page_size?: number
      orgId?: string
    }): Promise<AgentRunListResponse> => {
      const q = new URLSearchParams()
      if (params?.status) q.set('status', params.status)
      if (params?.workflow_type) q.set('workflow_type', params.workflow_type)
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const qs = q.toString() ? `?${q.toString()}` : ''
      return request<AgentRunListResponse>(`/ai/agent-runs${qs}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    getRun: (projectId: string, runId: string, orgId?: string): Promise<AgentRunItem> =>
      request<AgentRunItem>(`/projects/${projectId}/ai/agent-runs/${runId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    deleteRun: (projectId: string, runId: string, orgId?: string): Promise<void> =>
      request<void>(`/projects/${projectId}/ai/agent-runs/${runId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getSteps: (projectId: string, runId: string, orgId?: string): Promise<AgentRunStepItem[]> =>
      request<AgentRunStepItem[]>(`/projects/${projectId}/ai/agent-runs/${runId}/steps`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    approveRun: (
      projectId: string,
      runId: string,
      data: { approval_hash: string; approved_query_indices?: number[]; comment?: string },
      orgId?: string,
    ): Promise<AgentRunItem> =>
      request<AgentRunItem>(`/projects/${projectId}/ai/agent-runs/${runId}/approve`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    rejectRun: (
      projectId: string,
      runId: string,
      data: { reason?: string },
      orgId?: string,
    ): Promise<AgentRunItem> =>
      request<AgentRunItem>(`/projects/${projectId}/ai/agent-runs/${runId}/reject`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    cancelRun: (projectId: string, runId: string, orgId?: string): Promise<AgentRunItem> =>
      request<AgentRunItem>(`/projects/${projectId}/ai/agent-runs/${runId}/cancel`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    getResults: (projectId: string, runId: string, orgId?: string): Promise<AgentRunResultsResponse> =>
      request<AgentRunResultsResponse>(`/projects/${projectId}/ai/agent-runs/${runId}/results`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },

  reports: {
    saveFromRun: (
      projectId: string,
      runId: string,
      data: { title?: string },
      orgId?: string,
    ): Promise<AnalysisReportItem> =>
      request<AnalysisReportItem>(`/projects/${projectId}/ai/agent-runs/${runId}/reports`, {
        method: 'POST',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
        body: JSON.stringify(data),
      }),

    listProjectReports: (
      projectId: string,
      params?: { page?: number; page_size?: number; orgId?: string },
    ): Promise<AnalysisReportListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const qs = q.toString() ? `?${q.toString()}` : ''
      return request<AnalysisReportListResponse>(`/projects/${projectId}/ai/reports${qs}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    listOrgReports: (params?: {
      page?: number
      page_size?: number
      orgId?: string
    }): Promise<AnalysisReportListResponse> => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.page_size) q.set('page_size', String(params.page_size))
      const qs = q.toString() ? `?${q.toString()}` : ''
      return request<AnalysisReportListResponse>(`/ai/reports${qs}`, {
        headers: params?.orgId ? { 'X-Organization-Id': params.orgId } : undefined,
      })
    },

    getOrgReport: (reportId: string, orgId?: string): Promise<AnalysisReportItem> =>
      request<AnalysisReportItem>(`/ai/reports/${reportId}`, {
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),

    deleteOrgReport: (reportId: string, orgId?: string): Promise<void> =>
      request<void>(`/ai/reports/${reportId}`, {
        method: 'DELETE',
        headers: orgId ? { 'X-Organization-Id': orgId } : undefined,
      }),
  },
}
