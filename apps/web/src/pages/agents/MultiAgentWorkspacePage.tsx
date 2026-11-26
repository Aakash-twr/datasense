import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Eye,
  FileText,
  Lock,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { AgentDetailPanel } from '@/components/agents/AgentDetailPanel'
import { AgentFindingsPanel } from '@/components/agents/AgentFindingsPanel'
import { AgentTimeline } from '@/components/agents/AgentTimeline'
import {
  AgentWorkflowGraph,
  type AgentWorkflowNodeData,
} from '@/components/agents/AgentWorkflowGraph'
import { ApprovalPanel } from '@/components/agents/ApprovalPanel'
import { ReportViewer } from '@/components/agents/ReportViewer'
import { VisualizationGallery } from '@/components/agents/VisualizationGallery'
import { Button, ErrorState, PageHeader, StatCard, StatusBadge } from '@/components/ui'
import { apiService } from '@/services/api'
import type {
  AgentRunItem,
  AgentRunResultsResponse,
  AgentRunStepItem,
  AgentWorkspaceDashboardStats,
  CatalogResponse,
  Project,
} from '@/types'

const ANALYSIS_MODES = [
  { id: 'simple_question', label: 'Quick Analysis', desc: 'Fast SQL draft & verification' },
  { id: 'deep_analysis', label: 'Deep Analysis', desc: 'Full 8-agent end-to-end analysis' },
  {
    id: 'data_quality_audit',
    label: 'Data Quality Audit',
    desc: 'Profiling, nulls, PII & schema audit',
  },
  { id: 'trend_analysis', label: 'Trend Analysis', desc: 'Time-series & period growth rates' },
  {
    id: 'comparative_analysis',
    label: 'Comparative Analysis',
    desc: 'Compare segments or datasets',
  },
  {
    id: 'anomaly_investigation',
    label: 'Anomaly Investigation',
    desc: 'IQR / Z-score outlier investigation',
  },
  { id: 'report_generation', label: 'Report Generation', desc: 'Executive multi-section report' },
]

const SAMPLE_REQUESTS = [
  'Analyze my complete sales dataset and produce a comprehensive business overview.',
  'Check my dataset for data-quality problems, missing values, and PII.',
  'Identify monthly sales trends and growth rates over time.',
  'Find unusual patterns or statistical outliers in revenue.',
  'Compare performance across different product categories or regions.',
]

type RunQueueFilter = 'all' | 'awaiting_approval' | 'completed' | 'failed'

function runStatusTone(
  status: string,
): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'awaiting_approval':
      return 'warning'
    case 'running':
    case 'planning':
      return 'primary'
    case 'failed':
    case 'rejected':
      return 'error'
    default:
      return 'neutral'
  }
}

export const MultiAgentWorkspacePage: React.FC = () => {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(routeProjectId || null)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([])

  // Dashboard stats & history
  const [stats, setStats] = useState<AgentWorkspaceDashboardStats | null>(null)
  const [runs, setRuns] = useState<AgentRunItem[]>([])
  const [activeRun, setActiveRun] = useState<AgentRunItem | null>(null)
  const [activeResults, setActiveResults] = useState<AgentRunResultsResponse | null>(null)
  const [queueFilter, setQueueFilter] = useState<RunQueueFilter>('all')

  // Interactive graph node / step inspection
  const [selectedNode, setSelectedNode] = useState<AgentWorkflowNodeData | null>(null)
  const [selectedStep, setSelectedStep] = useState<AgentRunStepItem | null>(null)

  // Launcher form state
  const [isLauncherExpanded, setIsLauncherExpanded] = useState(true)
  const [mode, setMode] = useState<string>('deep_analysis')
  const [promptInput, setPromptInput] = useState('')
  const [shareAggregateSummaries, setShareAggregateSummaries] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [savedReportForRun, setSavedReportForRun] = useState<Record<string, boolean>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const launcherRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  // 1. Load projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await apiService.projects.list()
        setProjects(res.items)
        if (!selectedProjectId && res.items.length > 0) {
          setSelectedProjectId(res.items[0].id)
        }
      } catch (err) {
        console.error('Failed to load projects:', err)
      }
    }
    void loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (routeProjectId && routeProjectId !== selectedProjectId) {
      setSelectedProjectId(routeProjectId)
    }
  }, [routeProjectId, selectedProjectId])

  const loadWorkspaceData = useCallback(
    async (projectId: string, focusRunId?: string | null) => {
      try {
        const [catRes, statsRes, runsRes] = await Promise.all([
          apiService.analytics.getCatalog(projectId).catch(() => null),
          apiService.agents.getStats(projectId).catch(() => null),
          apiService.agents.listRuns(projectId, { page_size: 20 }).catch(() => ({ items: [] })),
        ])

        if (catRes) {
          setCatalog(catRes)
          setSelectedDatasetIds((prev) =>
            prev.length > 0 ? prev : catRes.datasets.map((d) => d.dataset_id),
          )
        }
        if (statsRes) setStats(statsRes)
        setRuns(runsRes.items)

        const targetId = focusRunId || searchParams.get('runId')
        if (targetId) {
          const found = runsRes.items.find((r) => r.id === targetId)
          if (found) {
            setActiveRun(found)
          } else {
            const single = await apiService.agents.getRun(projectId, targetId).catch(() => null)
            if (single) setActiveRun(single)
          }
        } else if (runsRes.items.length > 0 && !activeRun) {
          setActiveRun(runsRes.items[0])
        }
      } catch (err) {
        console.error('Failed to load multi-agent workspace:', err)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  )

  useEffect(() => {
    if (selectedProjectId) {
      void loadWorkspaceData(selectedProjectId)
    }
  }, [selectedProjectId, loadWorkspaceData])

  // Fetch structured results whenever activeRun updates
  useEffect(() => {
    if (!selectedProjectId || !activeRun) {
      setActiveResults(null)
      return
    }
    const fetchResults = async () => {
      try {
        const res = await apiService.agents.getResults(selectedProjectId, activeRun.id)
        setActiveResults(res)
      } catch {
        // Ignore if run has not persisted summary yet
      }
    }
    void fetchResults()
  }, [selectedProjectId, activeRun])

  // Reset inspector focus when switching run IDs
  useEffect(() => {
    setSelectedNode(null)
    setSelectedStep(null)
  }, [activeRun?.id])

  // Poll active run while running/planning
  useEffect(() => {
    if (!selectedProjectId || !activeRun) return
    if (activeRun.status !== 'planning' && activeRun.status !== 'running') return

    const timer = setInterval(async () => {
      try {
        const updated = await apiService.agents.getRun(selectedProjectId, activeRun.id)
        setActiveRun(updated)
        setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        if (updated.status !== 'planning' && updated.status !== 'running') {
          const [statsRes, resultsRes] = await Promise.all([
            apiService.agents.getStats(selectedProjectId).catch(() => null),
            apiService.agents.getResults(selectedProjectId, updated.id).catch(() => null),
          ])
          if (statsRes) setStats(statsRes)
          if (resultsRes) setActiveResults(resultsRes)
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1500)

    return () => clearInterval(timer)
  }, [selectedProjectId, activeRun])

  const pendingApprovalRuns = useMemo(
    () => runs.filter((r) => r.status === 'awaiting_approval'),
    [runs],
  )

  const filteredRuns = useMemo(() => {
    switch (queueFilter) {
      case 'awaiting_approval':
        return runs.filter((r) => r.status === 'awaiting_approval')
      case 'completed':
        return runs.filter((r) => r.status === 'completed')
      case 'failed':
        return runs.filter(
          (r) => r.status === 'failed' || r.status === 'rejected' || r.status === 'cancelled',
        )
      default:
        return runs
    }
  }, [runs, queueFilter])

  const handleToggleDataset = (datasetId: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(datasetId) ? prev.filter((id) => id !== datasetId) : [...prev, datasetId],
    )
  }

  const handleFocusNewAnalysis = () => {
    setIsLauncherExpanded(true)
    setTimeout(() => {
      launcherRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      promptRef.current?.focus()
    }, 50)
  }

  const handleStartWorkflow = async (customPrompt?: string) => {
    const reqText = (customPrompt ?? promptInput).trim()
    if (!selectedProjectId || !reqText || isStarting) return
    setErrorMsg(null)
    setIsStarting(true)
    try {
      const created = await apiService.agents.startRun(selectedProjectId, {
        request: reqText,
        dataset_ids: selectedDatasetIds,
        workflow_type: mode,
        share_aggregate_summaries_with_gemini: shareAggregateSummaries,
      })
      setActiveRun(created)
      setRuns((prev) => [created, ...prev])
      if (!customPrompt) setPromptInput('')
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start multi-agent workflow')
    } finally {
      setIsStarting(false)
    }
  }

  const handleApprove = async (approvedIndices: number[], comment?: string) => {
    if (!selectedProjectId || !activeRun || !activeRun.approval_hash) return
    setIsActionLoading(true)
    setErrorMsg(null)
    try {
      const updated = await apiService.agents.approveRun(selectedProjectId, activeRun.id, {
        approval_hash: activeRun.approval_hash,
        approved_query_indices: approvedIndices,
        comment,
      })
      setActiveRun(updated)
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleReject = async (reason?: string) => {
    if (!selectedProjectId || !activeRun) return
    setIsActionLoading(true)
    setErrorMsg(null)
    try {
      const updated = await apiService.agents.rejectRun(selectedProjectId, activeRun.id, { reason })
      setActiveRun(updated)
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!selectedProjectId || !activeRun) return
    setIsActionLoading(true)
    setErrorMsg(null)
    try {
      const updated = await apiService.agents.cancelRun(selectedProjectId, activeRun.id)
      setActiveRun(updated)
      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleSaveReport = async () => {
    if (!selectedProjectId || !activeRun) return
    setIsSavingReport(true)
    try {
      await apiService.reports.saveFromRun(selectedProjectId, activeRun.id, {})
      setSavedReportForRun((prev) => ({ ...prev, [activeRun.id]: true }))
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save report')
    } finally {
      setIsSavingReport(false)
    }
  }

  const handleDeleteRun = async (runId: string) => {
    if (!selectedProjectId) return
    if (!window.confirm('Delete this agent workflow run?')) return
    try {
      await apiService.agents.deleteRun(selectedProjectId, runId)
      const remaining = runs.filter((r) => r.id !== runId)
      setRuns(remaining)
      if (activeRun?.id === runId) {
        setActiveRun(remaining[0] || null)
      }
      const statsRes = await apiService.agents.getStats(selectedProjectId).catch(() => null)
      if (statsRes) setStats(statsRes)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete run')
    }
  }

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      {/* Overview Header */}
      <PageHeader
        title="Multi-Agent Analytics Workspace"
        description="Coordinated Supervisor, Discovery, Quality, SQL, Statistical, Visualization, Insight & Report agents backed by LangGraph checkpoints."
        badge={
          <StatusBadge tone="primary" icon={<Bot className="h-3 w-3" />}>
            LangGraph Orchestration
          </StatusBadge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {projects.length > 0 && (
              <select
                aria-label="Select project"
                value={selectedProjectId || ''}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value)
                  setActiveRun(null)
                  navigate(`/projects/${e.target.value}/agent-analytics`)
                }}
                className="rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-xs font-medium text-ds-ink focus:border-ds-primary focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <Link to="/reports" className="btn-secondary text-xs">
              <FileText className="h-3.5 w-3.5" />
              <span>Reports</span>
            </Link>

            {selectedProjectId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/projects/${selectedProjectId}/ai-analytics`)}
                leftIcon={<Sparkles className="h-3.5 w-3.5 text-ds-primary" />}
              >
                AI Copilot
              </Button>
            )}

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleFocusNewAnalysis}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              New Analysis
            </Button>
          </div>
        }
      />

      {/* Workflow Statistics KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Agent Runs"
          value={stats?.total_runs ?? 0}
          icon={Activity}
          accentTone="primary"
        />
        <StatCard
          label="Completed Analyses"
          value={stats?.completed_analyses ?? 0}
          icon={CheckCircle2}
          accentTone="teal"
        />
        <StatCard
          label="Awaiting Approval"
          value={stats?.awaiting_approval ?? 0}
          icon={ShieldAlert}
          accentTone={(stats?.awaiting_approval ?? 0) > 0 ? 'primary' : 'neutral'}
        />
        <StatCard
          label="Saved Reports"
          value={stats?.saved_reports ?? 0}
          icon={FileText}
          accentTone="neutral"
        />
      </div>

      {/* Pending Approvals Callout Queue */}
      {pendingApprovalRuns.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ds-lg border border-[var(--ds-warning-border)] bg-ds-warning-soft/70 px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 shrink-0 text-ds-warning" />
            <div>
              <strong className="font-semibold text-ds-ink">
                {pendingApprovalRuns.length} workflow
                {pendingApprovalRuns.length === 1 ? '' : 's'} waiting for human approval
              </strong>
              <span className="ml-2 text-ds-secondary">
                Select a pending workflow below or inspect the active gate to review SQL drafts.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingApprovalRuns.slice(0, 3).map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => setActiveRun(pr)}
                className={[
                  'rounded-ds-sm border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  activeRun?.id === pr.id
                    ? 'border-ds-warning bg-ds-surface text-ds-ink shadow-xs'
                    : 'border-[var(--ds-warning-border)] bg-ds-surface/80 text-ds-secondary hover:text-ds-ink',
                ].join(' ')}
              >
                {pr.user_request.slice(0, 36)}
                {pr.user_request.length > 36 ? '...' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {errorMsg && (
        <ErrorState title="Workflow Notice" message={errorMsg} compact />
      )}

      {/* Analysis Composer / Modes Launcher */}
      <section
        ref={launcherRef}
        aria-label="New analysis launcher"
        className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
      >
        <div className="flex items-center justify-between border-b border-ds-border bg-ds-surface2 px-5 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-ds-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
              Launch Multi-Agent Analysis
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsLauncherExpanded((v) => !v)}
            className="text-xs font-medium text-ds-primary hover:underline"
          >
            {isLauncherExpanded ? 'Hide Composer' : 'Show Composer'}
          </button>
        </div>

        {isLauncherExpanded && (
          <div className="space-y-4 p-5">
            {/* 7 Analysis Modes */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                1. Select Analysis Mode
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {ANALYSIS_MODES.map((m) => {
                  const selected = mode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={[
                        'rounded-ds-md border p-2.5 text-left transition-colors',
                        selected
                          ? 'border-ds-primary bg-ds-primary-soft/60 ring-1 ring-ds-primary/20'
                          : 'border-ds-border bg-ds-surface hover:border-ds-border-strong',
                      ].join(' ')}
                    >
                      <span className="block text-xs font-semibold text-ds-ink">{m.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-tight text-ds-secondary">
                        {m.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dataset Scope */}
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                <Database className="h-3.5 w-3.5 text-ds-primary" />
                <span>2. Target Datasets ({selectedDatasetIds.length} selected)</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {(catalog?.datasets || []).length === 0 ? (
                  <span className="text-xs text-ds-subtle">
                    No ready datasets in this project yet.
                  </span>
                ) : (
                  catalog?.datasets.map((ds) => {
                    const checked = selectedDatasetIds.includes(ds.dataset_id)
                    return (
                      <label
                        key={ds.dataset_id}
                        className={[
                          'inline-flex cursor-pointer items-center gap-2 rounded-ds-sm border px-3 py-1.5 text-xs transition-colors',
                          checked
                            ? 'border-ds-primary/40 bg-ds-primary-soft/50 font-medium text-ds-ink'
                            : 'border-ds-border bg-ds-surface text-ds-secondary',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleDataset(ds.dataset_id)}
                          className="h-3.5 w-3.5 rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                        />
                        <span>{ds.dataset_name}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            {/* Goal Prompt + Privacy Opt-in */}
            <div className="space-y-3">
              <textarea
                ref={promptRef}
                rows={2}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe your analytical goal (e.g., 'Analyze my complete sales dataset and find anomalies')..."
                className="w-full rounded-ds-md border border-ds-border bg-ds-surface2 px-3.5 py-2.5 text-xs text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
              />

              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_REQUESTS.map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPromptInput(sample)}
                    className="rounded-full border border-ds-border-subtle bg-ds-surface2 px-2.5 py-1 text-[11px] text-ds-secondary transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft/50 hover:text-ds-primary"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div className="flex flex-col justify-between gap-3 border-t border-ds-border-subtle pt-3 sm:flex-row sm:items-center">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ds-secondary">
                  <input
                    type="checkbox"
                    checked={shareAggregateSummaries}
                    onChange={(e) => setShareAggregateSummaries(e.target.checked)}
                    className="h-4 w-4 rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                  />
                  <Lock className="h-3.5 w-3.5 shrink-0 text-ds-subtle" />
                  <span>
                    Allow Gemini to process a limited, sanitized summary of the analytical results
                    to generate explanations (off by default)
                  </span>
                </label>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isStarting || !promptInput.trim() || !selectedProjectId}
                  loading={isStarting}
                  onClick={() => void handleStartWorkflow()}
                  leftIcon={!isStarting ? <Play className="h-3.5 w-3.5 fill-current" /> : undefined}
                  className="shrink-0"
                >
                  Launch Multi-Agent Analysis
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Active Workflow Inspection & Results */}
      {activeRun && (
        <div className="space-y-5">
          {/* Approval Gate (when paused before SQL execution) */}
          <ApprovalPanel
            run={activeRun}
            isSubmitting={isActionLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            onCancel={handleCancel}
          />

          {/* Connected Agent Workflow Visualization */}
          <AgentWorkflowGraph
            run={activeRun}
            results={activeResults}
            selectedAgentId={selectedNode?.id ?? null}
            onSelectAgent={(node) => {
              setSelectedNode(node)
              setSelectedStep(null)
            }}
          />

          {/* Inspector & Timeline (Left 1/3) + Findings, Charts & Report (Right 2/3) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-1">
              <AgentDetailPanel
                node={selectedNode}
                focusedStep={selectedStep}
                onClose={
                  selectedNode || selectedStep
                    ? () => {
                        setSelectedNode(null)
                        setSelectedStep(null)
                      }
                    : undefined
                }
              />

              <AgentTimeline
                steps={activeRun.steps}
                runStatus={activeRun.status}
                currentStep={activeRun.current_step}
                selectedStepId={selectedStep?.id ?? null}
                onSelectStep={(step) => {
                  setSelectedStep(step)
                  setSelectedNode(null)
                }}
              />

              {/* Run Telemetry */}
              <div className="space-y-2 rounded-ds-lg border border-ds-border bg-ds-surface p-4 text-xs shadow-xs">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ds-ink">
                  Run Telemetry
                </h4>
                <div className="flex justify-between text-ds-secondary">
                  <span>Workflow Type</span>
                  <strong className="font-mono text-ds-ink">{activeRun.workflow_type}</strong>
                </div>
                <div className="flex justify-between text-ds-secondary">
                  <span>LLM Calls</span>
                  <strong className="font-mono tabular-nums text-ds-ink">
                    {activeRun.llm_calls_count}
                  </strong>
                </div>
                <div className="flex justify-between text-ds-secondary">
                  <span>SQL Drafts</span>
                  <strong className="font-mono tabular-nums text-ds-ink">
                    {activeRun.sql_queries_count}
                  </strong>
                </div>
                {activeRun.duration_ms !== null && activeRun.duration_ms !== undefined && (
                  <div className="flex justify-between text-ds-secondary">
                    <span>Duration</span>
                    <strong className="font-mono tabular-nums text-ds-ink">
                      {(activeRun.duration_ms / 1000).toFixed(2)}s
                    </strong>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5 xl:col-span-2">
              {activeResults ? (
                <>
                  <AgentFindingsPanel results={activeResults} />

                  {activeResults.visualizations && (
                    <VisualizationGallery
                      charts={activeResults.visualizations.charts}
                      notes={activeResults.visualizations.notes}
                    />
                  )}

                  {activeResults.report && (
                    <ReportViewer
                      report={activeResults.report}
                      markdown={activeResults.report_markdown}
                      onSaveReport={handleSaveReport}
                      isSaving={isSavingReport}
                      alreadySaved={Boolean(savedReportForRun[activeRun.id])}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-8 text-center text-xs text-ds-secondary">
                  Structured agent findings, charts, and executive reports appear here once
                  analysis steps complete.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Runs & Filter Queue */}
      <section
        aria-label="Recent multi-agent workflows"
        className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface2 px-5 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
              Recent Multi-Agent Workflows
            </h3>
            <StatusBadge tone="neutral">{runs.length} total</StatusBadge>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ['all', 'All'],
                ['awaiting_approval', 'Pending Approval'],
                ['completed', 'Completed'],
                ['failed', 'Failed / Cancelled'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setQueueFilter(key)}
                className={[
                  'rounded-ds-sm px-2.5 py-1 text-[11px] font-medium transition-colors',
                  queueFilter === key
                    ? 'bg-ds-primary text-white'
                    : 'text-ds-secondary hover:bg-ds-muted hover:text-ds-ink',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="py-10 text-center text-xs text-ds-secondary">
            {runs.length === 0
              ? 'No multi-agent workflows run in this project yet.'
              : 'No workflow runs match this filter.'}
          </div>
        ) : (
          <div className="divide-y divide-ds-border-subtle">
            {filteredRuns.map((r) => {
              const isSelected = activeRun?.id === r.id
              return (
                <div
                  key={r.id}
                  className={[
                    'flex flex-wrap items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-ds-surface2',
                    isSelected ? 'bg-ds-primary-soft/35' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-semibold text-ds-ink">
                        {r.user_request}
                      </p>
                      <StatusBadge tone={runStatusTone(r.status)} dot>
                        {r.status.replace(/_/g, ' ')}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ds-secondary">
                      <span className="font-mono">{r.workflow_type}</span>
                      <span>·</span>
                      <span className="tabular-nums">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant={r.status === 'awaiting_approval' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setActiveRun(r)}
                      leftIcon={<Eye className="h-3 w-3" />}
                    >
                      {r.status === 'awaiting_approval' ? 'Review' : 'Inspect'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRun(r.id)}
                      title="Delete workflow run"
                      aria-label={`Delete workflow run ${r.user_request}`}
                      className="rounded-ds-sm p-1.5 text-ds-subtle transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
