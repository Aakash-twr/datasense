import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Bookmark,
  Database,
  History,
  Loader2,
  PanelLeft,
  Sparkles,
  Table as TableIcon,
  X,
} from 'lucide-react'
import { DataExplorerPanel } from '@/components/analytics/DataExplorerPanel'
import { QueryChartViewer } from '@/components/analytics/QueryChartViewer'
import { QueryHistoryPanel } from '@/components/analytics/QueryHistoryPanel'
import { QueryResultsTable } from '@/components/analytics/QueryResultsTable'
import { SaveQueryModal } from '@/components/analytics/SaveQueryModal'
import { SavedQueriesPanel } from '@/components/analytics/SavedQueriesPanel'
import { SqlEditorPanel } from '@/components/analytics/SqlEditorPanel'
import { Button, ErrorState, StatusBadge } from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type {
  AISQLExplanationResponse,
  CatalogDataset,
  Project,
  QueryColumn,
  QueryRunResponse,
  SavedQueryResponse,
} from '@/types'

type BottomTab = 'results' | 'history' | 'saved'
type ResultViewMode = 'table' | 'chart'

export function AnalyticsWorkspacePage() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { currentOrg } = useAuthStore()
  const preloadedSql = (location.state as { preloadedSql?: string } | null)?.preloadedSql

  // Project state
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>(routeProjectId || '')
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)

  // Catalog state
  const [catalog, setCatalog] = useState<CatalogDataset[]>([])
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)

  // Editor state
  const [sql, setSql] = useState(() => preloadedSql || '')
  const [rowLimit, setRowLimit] = useState(1000)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationSuccess, setValidationSuccess] = useState(false)

  // Results state
  const [resultColumns, setResultColumns] = useState<QueryColumn[]>([])
  const [resultRows, setResultRows] = useState<(string | number | boolean | null)[][]>([])
  const [rowCount, setRowCount] = useState(0)
  const [executionTimeMs, setExecutionTimeMs] = useState(0)
  const [isTruncated, setIsTruncated] = useState(false)

  // Bottom Tabs & View Modes
  const requestedTab = searchParams.get('tab')
  const initialTab: BottomTab =
    requestedTab === 'history' || requestedTab === 'saved' ? requestedTab : 'results'
  const [bottomTab, setBottomTab] = useState<BottomTab>(initialTab)
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>('table')

  useEffect(() => {
    if (requestedTab === 'history' || requestedTab === 'saved') {
      setBottomTab(requestedTab)
    } else if (requestedTab === 'results') {
      setBottomTab('results')
    }
  }, [requestedTab])

  // History & Saved queries
  const [history, setHistory] = useState<QueryRunResponse[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQueryResponse[]>([])
  const [isLoadingSaved, setIsLoadingSaved] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)

  // Resizable IDE panels & optional Contextual AI Assistant
  const [showExplorer, setShowExplorer] = useState(true)
  const [explorerWidth, setExplorerWidth] = useState(276)
  const [editorHeight, setEditorHeight] = useState(248)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiExplanation, setAiExplanation] = useState<AISQLExplanationResponse | null>(null)
  const [isExplainingSql, setIsExplainingSql] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const workspaceRef = useRef<HTMLDivElement>(null)

  // Horizontal & vertical drag resize helpers
  const startResizeExplorer = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = explorerWidth

    const onMove = (ev: MouseEvent) => {
      const next = Math.min(440, Math.max(220, startW + (ev.clientX - startX)))
      setExplorerWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResizeEditor = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = editorHeight

    const onMove = (ev: MouseEvent) => {
      const next = Math.min(460, Math.max(170, startH + (ev.clientY - startY)))
      setEditorHeight(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    setIsLoadingProjects(true)
    apiService.projects
      .list({ page_size: 100, orgId: currentOrg?.organization_id })
      .then((resp) => {
        setProjects(resp.items)
        if (resp.items.length > 0 && !selectedProjectId) {
          const firstId = resp.items[0].id
          setSelectedProjectId(firstId)
          navigate(`/projects/${firstId}/analytics`, { replace: true })
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingProjects(false))
  }, [currentOrg?.organization_id, selectedProjectId, navigate])

  useEffect(() => {
    if (routeProjectId && routeProjectId !== selectedProjectId) {
      setSelectedProjectId(routeProjectId)
    }
  }, [routeProjectId, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) return
    apiService.projects
      .get(selectedProjectId, currentOrg?.organization_id)
      .then(setActiveProject)
      .catch(() => {})
  }, [selectedProjectId, currentOrg?.organization_id])

  const fetchCatalog = useCallback(async () => {
    if (!selectedProjectId) return
    setIsLoadingCatalog(true)
    try {
      const resp = await apiService.analytics.getCatalog(
        selectedProjectId,
        undefined,
        currentOrg?.organization_id,
      )
      setCatalog(resp.datasets)
      setSelectedDatasetIds(resp.datasets.map((d) => d.dataset_id))

      if (resp.datasets.length > 0 && resp.datasets[0].tables.length > 0) {
        const firstTbl = resp.datasets[0].tables[0]
        setSql((prev) =>
          prev.trim() ? prev : `SELECT *\nFROM ${firstTbl.qualified_name}\nLIMIT 20;\n`,
        )
      }
    } catch {
      // handled cleanly in UI
    } finally {
      setIsLoadingCatalog(false)
    }
  }, [selectedProjectId, currentOrg?.organization_id])

  useEffect(() => {
    void fetchCatalog()
  }, [fetchCatalog])

  const fetchHistory = useCallback(async () => {
    if (!selectedProjectId) return
    setIsLoadingHistory(true)
    try {
      const resp = await apiService.analytics.getHistory(selectedProjectId, {
        page: 1,
        page_size: 25,
        orgId: currentOrg?.organization_id,
      })
      setHistory(resp.items)
    } catch {
      // handled cleanly
    } finally {
      setIsLoadingHistory(false)
    }
  }, [selectedProjectId, currentOrg?.organization_id])

  const fetchSavedQueries = useCallback(async () => {
    if (!selectedProjectId) return
    setIsLoadingSaved(true)
    try {
      const resp = await apiService.analytics.getSavedQueries(selectedProjectId, {
        page: 1,
        page_size: 50,
        orgId: currentOrg?.organization_id,
      })
      setSavedQueries(resp.items)
    } catch {
      // handled cleanly
    } finally {
      setIsLoadingSaved(false)
    }
  }, [selectedProjectId, currentOrg?.organization_id])

  useEffect(() => {
    if (bottomTab === 'history') void fetchHistory()
    if (bottomTab === 'saved') void fetchSavedQueries()
  }, [bottomTab, fetchHistory, fetchSavedQueries])

  const handleToggleDataset = (id: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  const handleSelectAllDatasets = () => {
    setSelectedDatasetIds(catalog.map((d) => d.dataset_id))
  }

  const handleClearDatasetSelection = () => {
    setSelectedDatasetIds([])
  }

  const handleInsertSql = (snippet: string) => {
    setSql((prev) => (prev ? `${prev.trim()}\n${snippet}` : snippet))
  }

  const handleValidate = async () => {
    if (!selectedProjectId || !sql.trim()) return
    setIsValidating(true)
    setValidationError(null)
    setValidationSuccess(false)
    try {
      const resp = await apiService.analytics.validate(
        selectedProjectId,
        { sql: sql.trim(), dataset_ids: selectedDatasetIds },
        currentOrg?.organization_id,
      )
      if (resp.is_valid) {
        setValidationSuccess(true)
      } else {
        setValidationError(resp.error || 'SQL validation failed.')
      }
    } catch (err: unknown) {
      setValidationError(err instanceof ApiError ? err.detail : 'Failed to validate query.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleExecute = async () => {
    if (!selectedProjectId || !sql.trim() || isExecuting) return
    setIsExecuting(true)
    setValidationError(null)
    setValidationSuccess(false)
    setBottomTab('results')

    try {
      const resp = await apiService.analytics.execute(
        selectedProjectId,
        {
          sql: sql.trim(),
          dataset_ids: selectedDatasetIds,
          limit: rowLimit,
        },
        currentOrg?.organization_id,
      )

      if (resp.status === 'success') {
        setResultColumns(resp.columns)
        setResultRows(resp.rows)
        setRowCount(resp.row_count)
        setExecutionTimeMs(resp.execution_time_ms)
        setIsTruncated(resp.truncated)
        setValidationSuccess(false)
      } else {
        setValidationError(resp.error_message || 'Query execution failed.')
      }
    } catch (err: unknown) {
      setValidationError(err instanceof ApiError ? err.detail : 'Failed to execute query.')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleSaveQuery = async (name: string, description?: string) => {
    if (!selectedProjectId) return
    await apiService.analytics.createSavedQuery(
      selectedProjectId,
      {
        name,
        description,
        sql_query: sql.trim(),
        selected_dataset_ids: selectedDatasetIds,
      },
      currentOrg?.organization_id,
    )
    void fetchSavedQueries()
  }

  const handleCreateSavedFromPanel = async (data: {
    name: string
    description?: string | null
    sql_query: string
  }) => {
    if (!selectedProjectId) return
    await apiService.analytics.createSavedQuery(
      selectedProjectId,
      {
        name: data.name,
        description: data.description,
        sql_query: data.sql_query,
        selected_dataset_ids: selectedDatasetIds,
      },
      currentOrg?.organization_id,
    )
    void fetchSavedQueries()
  }

  const handleUpdateSavedQuery = async (
    id: string,
    data: { name?: string; description?: string | null; sql_query?: string },
  ) => {
    if (!selectedProjectId) return
    await apiService.analytics.updateSavedQuery(
      selectedProjectId,
      id,
      data,
      currentOrg?.organization_id,
    )
    void fetchSavedQueries()
  }

  const handleDeleteHistory = async (id: string) => {
    if (!selectedProjectId) return
    try {
      await apiService.analytics.deleteHistory(
        selectedProjectId,
        id,
        currentOrg?.organization_id,
      )
      setHistory((prev) => prev.filter((h) => h.id !== id))
    } catch {
      // handled
    }
  }

  const handleDeleteSavedQuery = async (id: string) => {
    if (!selectedProjectId) return
    try {
      await apiService.analytics.deleteSavedQuery(
        selectedProjectId,
        id,
        currentOrg?.organization_id,
      )
      setSavedQueries((prev) => prev.filter((q) => q.id !== id))
    } catch {
      // handled
    }
  }

  const handleExplainSql = async () => {
    if (!selectedProjectId || !sql.trim() || !apiService.ai?.explainSql) return
    setIsExplainingSql(true)
    setAiError(null)
    try {
      const res = await apiService.ai.explainSql(
        selectedProjectId,
        { sql: sql.trim(), dataset_ids: selectedDatasetIds },
        currentOrg?.organization_id,
      )
      setAiExplanation(res)
    } catch (err) {
      setAiError(
        err instanceof ApiError
          ? err.detail
          : 'AI explanation requires an active Gemini configuration.',
      )
    } finally {
      setIsExplainingSql(false)
    }
  }

  return (
    <div
      ref={workspaceRef}
      className="flex h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
    >
      {/* Compact IDE Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowExplorer((v) => !v)}
            aria-label="Toggle Database Explorer"
            title="Toggle Database Explorer"
            className={`rounded-ds-sm border px-2 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
              showExplorer
                ? 'border-ds-primary/30 bg-ds-primary-soft text-ds-primary'
                : 'border-ds-border bg-ds-surface text-ds-secondary hover:text-ds-ink'
            }`}
          >
            <PanelLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Explorer</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
              Project:
            </span>
            {isLoadingProjects ? (
              <div className="h-7 w-36 animate-pulse rounded-ds-sm bg-ds-muted" />
            ) : (
              <select
                aria-label="Select SQL workspace project"
                value={selectedProjectId}
                onChange={(e) => {
                  const newId = e.target.value
                  setSelectedProjectId(newId)
                  navigate(`/projects/${newId}/analytics`)
                }}
                className="rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1 text-xs font-semibold text-ds-ink focus:border-ds-primary focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <StatusBadge tone="neutral">
            {catalog.length} dataset{catalog.length === 1 ? '' : 's'}
          </StatusBadge>
        </div>

        <div className="flex items-center gap-2">
          {activeProject && (
            <Link
              to={`/data-sources?projectId=${activeProject.id}`}
              className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1 text-xs font-medium text-ds-ink transition-colors hover:bg-ds-surface2"
            >
              <Database className="h-3.5 w-3.5 text-ds-secondary" />
              <span className="hidden sm:inline">Manage Datasets</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setShowAiPanel((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-ds-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
              showAiPanel
                ? 'border-[var(--ds-accent-secondary-border)] bg-ds-teal-soft text-ds-teal'
                : 'border-ds-border bg-ds-surface text-ds-ink hover:bg-ds-surface2'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Assist</span>
          </button>
        </div>
      </div>

      {/* Main Resizable IDE Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Resizable Database Explorer */}
        {showExplorer && (
          <>
            <div
              className="hidden h-full flex-shrink-0 overflow-hidden md:block"
              style={{ width: `${explorerWidth}px` }}
            >
              <DataExplorerPanel
                catalog={catalog}
                selectedDatasetIds={selectedDatasetIds}
                onToggleDataset={handleToggleDataset}
                onSelectAllDatasets={handleSelectAllDatasets}
                onClearDatasetSelection={handleClearDatasetSelection}
                onInsertSql={handleInsertSql}
                isLoading={isLoadingCatalog}
              />
            </div>
            {/* Vertical Column Splitter */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Database Explorer"
              onMouseDown={startResizeExplorer}
              className="hidden w-1 flex-shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-ds-primary/40 md:block"
            />
          </>
        )}

        {/* Center: Dark SQL Editor + Bottom Tabbed Results */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <SqlEditorPanel
            value={sql}
            onChange={setSql}
            onExecute={() => void handleExecute()}
            onValidate={() => void handleValidate()}
            onOpenSaveModal={() => setIsSaveModalOpen(true)}
            onClear={() => setSql('')}
            isExecuting={isExecuting}
            isValidating={isValidating}
            validationError={validationError}
            validationSuccess={validationSuccess}
            rowLimit={rowLimit}
            onChangeRowLimit={setRowLimit}
            editorHeight={editorHeight}
          />

          {/* Horizontal Row Splitter */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize SQL Editor height"
            onMouseDown={startResizeEditor}
            className="h-1 flex-shrink-0 cursor-row-resize bg-ds-border-subtle transition-colors hover:bg-ds-primary/40"
          />

          {/* Bottom Pane: Results / History / Saved Queries */}
          <div className="flex min-h-0 flex-1 flex-col bg-ds-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border bg-ds-surface2 px-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setBottomTab('results')}
                  className={`flex items-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors ${
                    bottomTab === 'results'
                      ? 'border-ds-primary text-ds-primary'
                      : 'border-transparent text-ds-secondary hover:text-ds-ink'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  Query Results
                  {resultRows.length > 0 && (
                    <span className="rounded-full bg-ds-primary-soft px-1.5 py-0.5 font-mono text-[10px] text-ds-primary tabular-nums">
                      {rowCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setBottomTab('history')}
                  className={`flex items-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors ${
                    bottomTab === 'history'
                      ? 'border-ds-primary text-ds-primary'
                      : 'border-transparent text-ds-secondary hover:text-ds-ink'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Query History
                </button>

                <button
                  type="button"
                  onClick={() => setBottomTab('saved')}
                  className={`flex items-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors ${
                    bottomTab === 'saved'
                      ? 'border-ds-primary text-ds-primary'
                      : 'border-transparent text-ds-secondary hover:text-ds-ink'
                  }`}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Saved Queries
                </button>
              </div>

              {bottomTab === 'results' && resultColumns.length > 0 && (
                <div className="my-1 flex items-center rounded-ds-sm border border-ds-border bg-ds-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => setResultViewMode('table')}
                    className={`flex items-center gap-1 rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                      resultViewMode === 'table'
                        ? 'bg-ds-primary-soft text-ds-primary'
                        : 'text-ds-secondary hover:text-ds-ink'
                    }`}
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultViewMode('chart')}
                    className={`flex items-center gap-1 rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                      resultViewMode === 'chart'
                        ? 'bg-ds-primary-soft text-ds-primary'
                        : 'text-ds-secondary hover:text-ds-ink'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Chart
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {bottomTab === 'results' &&
                (resultViewMode === 'table' ? (
                  <QueryResultsTable
                    columns={resultColumns}
                    rows={resultRows}
                    rowCount={rowCount}
                    executionTimeMs={executionTimeMs}
                    truncated={isTruncated}
                  />
                ) : (
                  <QueryChartViewer columns={resultColumns} rows={resultRows} />
                ))}

              {bottomTab === 'history' && (
                <QueryHistoryPanel
                  history={history}
                  onRerun={(rerunSql) => {
                    setSql(rerunSql)
                    setBottomTab('results')
                  }}
                  onExecuteAgain={(rerunSql) => {
                    setSql(rerunSql)
                    setBottomTab('results')
                    setTimeout(() => void handleExecute(), 50)
                  }}
                  onDelete={(id) => void handleDeleteHistory(id)}
                  isLoading={isLoadingHistory}
                />
              )}

              {bottomTab === 'saved' && (
                <SavedQueriesPanel
                  savedQueries={savedQueries}
                  projectName={activeProject?.name || 'Active Project'}
                  defaultSql={sql}
                  onSelectQuery={(saved) => {
                    setSql(saved.sql_query)
                    setBottomTab('results')
                  }}
                  onRunQuery={(saved) => {
                    setSql(saved.sql_query)
                    setBottomTab('results')
                    setTimeout(() => void handleExecute(), 50)
                  }}
                  onCreateQuery={handleCreateSavedFromPanel}
                  onUpdateQuery={handleUpdateSavedQuery}
                  onDelete={(id) => void handleDeleteSavedQuery(id)}
                  isLoading={isLoadingSaved}
                />
              )}
            </div>
          </div>
        </div>

        {/* Optional Collapsible Right Panel: Contextual AI SQL Assistant */}
        {showAiPanel && (
          <aside
            aria-label="Contextual SQL AI Assistant"
            className="flex h-full w-80 flex-shrink-0 flex-col border-l border-ds-border bg-ds-surface2"
          >
            <div className="flex items-center justify-between border-b border-ds-border bg-ds-surface px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-ds-teal" />
                <span className="text-xs font-semibold text-ds-ink">Contextual AI Assist</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAiPanel(false)}
                aria-label="Close AI Assist panel"
                className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-muted hover:text-ds-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
              <div className="space-y-2">
                <p className="text-ds-secondary">
                  Analyze your current SQL statement using schema-only metadata without exposing row data.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  loading={isExplainingSql}
                  disabled={!sql.trim() || !selectedProjectId}
                  onClick={() => void handleExplainSql()}
                  leftIcon={isExplainingSql ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                >
                  Explain Current SQL
                </Button>
              </div>

              {aiError && <ErrorState title="AI Explanation Unavailable" message={aiError} compact />}

              {aiExplanation && (
                <div className="space-y-3 rounded-ds border border-ds-border bg-ds-surface p-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                      Explanation
                    </p>
                    <p className="mt-1 text-ds-ink leading-relaxed">{aiExplanation.explanation}</p>
                  </div>

                  {aiExplanation.accessed_tables.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                        Tables Referenced
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {aiExplanation.accessed_tables.map((t) => (
                          <StatusBadge key={t} tone="neutral">
                            {t}
                          </StatusBadge>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiExplanation.suggested_improvements.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                        Suggestions
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-ds-secondary">
                        {aiExplanation.suggested_improvements.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiExplanation.improved_sql && (
                    <div className="space-y-2 border-t border-ds-border-subtle pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                        Suggested SQL
                      </p>
                      <pre className="overflow-x-auto rounded-ds-sm bg-ds-dark p-2 font-mono text-[11px] text-white">
                        {aiExplanation.improved_sql}
                      </pre>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => setSql(aiExplanation.improved_sql || sql)}
                      >
                        Apply Suggested SQL
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-ds-border bg-ds-surface px-3.5 py-2.5 text-xs">
              <Link
                to={selectedProjectId ? `/projects/${selectedProjectId}/ai-analytics` : '/ai-analytics'}
                className="font-medium text-ds-primary hover:underline"
              >
                Open Full AI Copilot →
              </Link>
            </div>
          </aside>
        )}
      </div>

      {/* Save Query Modal */}
      <SaveQueryModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveQuery}
        sqlQuery={sql}
      />
    </div>
  )
}
