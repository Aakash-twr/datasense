import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  Bot,
  Code2,
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  FolderGit2,
  FolderPlus,
  MessageSquare,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { OnboardingGuide } from '@/components/common/OnboardingGuide'
import {
  Button,
  ErrorState,
  PageHeader,
  Select,
  SkeletonCard,
  SkeletonText,
  StatCard,
  StatusBadge,
  type StatusTone,
} from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type {
  AIConversationListItem,
  AgentRunItem,
  AnalysisReportItem,
  Dataset,
  Project,
  QueryRunResponse,
} from '@/types'

type TimeWindow = '7d' | '30d' | 'all'

interface ActivityEvent {
  id: string
  kind: 'dataset' | 'query' | 'ai' | 'agent' | 'report'
  title: string
  subtitle: string
  timestamp: string
  href: string
  projectId?: string
  status?: string
}

interface ScopedQueryRun extends QueryRunResponse {
  project_name?: string
}

interface ScopedConversation extends AIConversationListItem {
  project_id: string
  project_name?: string
}

function getCutoffMs(window: TimeWindow): number | null {
  if (window === 'all') return null
  const days = window === '7d' ? 7 : 30
  return Date.now() - days * 24 * 60 * 60 * 1000
}

function getPreviousWindowBounds(window: TimeWindow): { start: number; end: number } | null {
  if (window === 'all') return null
  const days = window === '7d' ? 7 : 30
  const span = days * 24 * 60 * 60 * 1000
  const now = Date.now()
  return { start: now - 2 * span, end: now - span }
}

function computePeriodDelta(
  timestamps: string[],
  window: TimeWindow,
): { value: string; positive: boolean } | undefined {
  if (window === 'all') return undefined
  const cutoff = getCutoffMs(window)
  const prev = getPreviousWindowBounds(window)
  if (!cutoff || !prev) return undefined

  let currCount = 0
  let prevCount = 0
  for (const ts of timestamps) {
    const ms = new Date(ts).getTime()
    if (Number.isNaN(ms)) continue
    if (ms >= cutoff) currCount += 1
    else if (ms >= prev.start && ms < prev.end) prevCount += 1
  }

  // Never display a percentage when there is no prior historical baseline
  if (prevCount === 0) return undefined
  const pct = Math.round(((currCount - prevCount) / prevCount) * 100)
  return {
    value: `${pct >= 0 ? '+' : ''}${pct}%`,
    positive: pct >= 0,
  }
}

function statusToTone(status?: string): StatusTone {
  switch (status) {
    case 'ready':
    case 'completed':
    case 'success':
      return 'success'
    case 'processing':
    case 'running':
    case 'planning':
    case 'awaiting_approval':
    case 'approved':
      return 'primary'
    case 'failed':
    case 'rejected':
    case 'cancelled':
      return 'error'
    default:
      return 'neutral'
  }
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function DashboardPage() {
  const { user, currentOrg } = useAuthStore()

  const [projects, setProjects] = useState<Project[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [queryRuns, setQueryRuns] = useState<ScopedQueryRun[]>([])
  const [conversations, setConversations] = useState<ScopedConversation[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentRunItem[]>([])
  const [reports, setReports] = useState<AnalysisReportItem[]>([])

  const [projectTotal, setProjectTotal] = useState(0)
  const [orgAgentRunTotal, setOrgAgentRunTotal] = useState(0)
  const [orgReportTotal, setOrgReportTotal] = useState(0)

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!currentOrg?.organization_id) return
    setIsLoading(true)
    setError(null)
    const orgId = currentOrg.organization_id

    try {
      const [projRes, runsRes, reportsRes] = await Promise.all([
        apiService.projects.list({ page_size: 50, orgId }),
        apiService.agents?.listOrgRuns
          ? apiService.agents.listOrgRuns({ page_size: 25, orgId }).catch(() => ({
              items: [] as AgentRunItem[],
              total: 0,
            }))
          : Promise.resolve({ items: [] as AgentRunItem[], total: 0 }),
        apiService.reports?.listOrgReports
          ? apiService.reports.listOrgReports({ page_size: 25, orgId }).catch(() => ({
              items: [] as AnalysisReportItem[],
              total: 0,
            }))
          : Promise.resolve({ items: [] as AnalysisReportItem[], total: 0 }),
      ])

      setProjects(projRes.items)
      setProjectTotal(projRes.total)
      setAgentRuns(runsRes.items ?? [])
      setOrgAgentRunTotal(runsRes.total ?? (runsRes.items?.length ?? 0))
      setReports(reportsRes.items ?? [])
      setOrgReportTotal(reportsRes.total ?? (reportsRes.items?.length ?? 0))

      const targetProjects = projRes.items.slice(0, 8)
      const perProjectResults = await Promise.all(
        targetProjects.map(async (proj) => {
          const [dsRes, qRes, convRes] = await Promise.all([
            apiService.datasets?.list
              ? apiService.datasets
                  .list(proj.id, { page_size: 50, orgId })
                  .catch(() => ({ items: [] as Dataset[], total: 0 }))
              : Promise.resolve({ items: [] as Dataset[], total: 0 }),
            apiService.analytics?.getHistory
              ? apiService.analytics
                  .getHistory(proj.id, { page_size: 25, orgId })
                  .catch(() => ({ items: [] as QueryRunResponse[], total: 0 }))
              : Promise.resolve({ items: [] as QueryRunResponse[], total: 0 }),
            apiService.ai?.listConversations
              ? apiService.ai
                  .listConversations(proj.id, { page_size: 15, orgId })
                  .catch(() => ({ items: [] as AIConversationListItem[], total: 0 }))
              : Promise.resolve({ items: [] as AIConversationListItem[], total: 0 }),
          ])

          return {
            project: proj,
            datasets: dsRes.items ?? [],
            queries: (qRes.items ?? []).map((q) => ({ ...q, project_name: proj.name })),
            convs: (convRes.items ?? []).map((c) => ({
              ...c,
              project_id: proj.id,
              project_name: proj.name,
            })),
          }
        }),
      )

      setDatasets(perProjectResults.flatMap((r) => r.datasets))
      setQueryRuns(perProjectResults.flatMap((r) => r.queries))
      setConversations(perProjectResults.flatMap((r) => r.convs))
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to load workspace analytics overview.')
    } finally {
      setIsLoading(false)
    }
  }, [currentOrg?.organization_id])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const cutoffMs = useMemo(() => getCutoffMs(timeWindow), [timeWindow])

  const inFilter = useCallback(
    (projectId: string | undefined, timestamp: string): boolean => {
      if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return false
      if (cutoffMs !== null) {
        const ms = new Date(timestamp).getTime()
        if (!Number.isNaN(ms) && ms < cutoffMs) return false
      }
      return true
    },
    [selectedProjectId, cutoffMs],
  )

  const filteredDatasets = useMemo(
    () => datasets.filter((d) => inFilter(d.project_id, d.created_at)),
    [datasets, inFilter],
  )
  const filteredQueries = useMemo(
    () => queryRuns.filter((q) => inFilter(q.project_id, q.created_at)),
    [queryRuns, inFilter],
  )
  const filteredConversations = useMemo(
    () => conversations.filter((c) => inFilter(c.project_id, c.updated_at || c.created_at)),
    [conversations, inFilter],
  )
  const filteredAgentRuns = useMemo(
    () => agentRuns.filter((r) => inFilter(r.project_id, r.created_at)),
    [agentRuns, inFilter],
  )
  const filteredReports = useMemo(
    () => reports.filter((r) => inFilter(r.project_id, r.created_at)),
    [reports, inFilter],
  )

  // Daily chart data built purely from actual API timestamps
  const dailyActivitySeries = useMemo(() => {
    const buckets = new Map<
      string,
      { isoDate: string; label: string; queries: number; workflows: number; datasets: number }
    >()

    const ensureBucket = (iso: string) => {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      const isoDate = d.toISOString().slice(0, 10)
      let row = buckets.get(isoDate)
      if (!row) {
        row = {
          isoDate,
          label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          queries: 0,
          workflows: 0,
          datasets: 0,
        }
        buckets.set(isoDate, row)
      }
      return row
    }

    for (const q of filteredQueries) {
      const b = ensureBucket(q.created_at)
      if (b) b.queries += 1
    }
    for (const run of filteredAgentRuns) {
      const b = ensureBucket(run.created_at)
      if (b) b.workflows += 1
    }
    for (const ds of filteredDatasets) {
      const b = ensureBucket(ds.created_at)
      if (b) b.datasets += 1
    }

    return Array.from(buckets.values()).sort((a, b) => a.isoDate.localeCompare(b.isoDate)).slice(-14)
  }, [filteredQueries, filteredAgentRuns, filteredDatasets])

  const datasetStatusCounts = useMemo(() => {
    const counts = { ready: 0, processing: 0, failed: 0 }
    for (const ds of filteredDatasets) {
      if (ds.status === 'ready') counts.ready += 1
      else if (ds.status === 'processing' || ds.status === 'uploading') counts.processing += 1
      else if (ds.status === 'failed') counts.failed += 1
    }
    return counts
  }, [filteredDatasets])

  const recentActivity = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = []

    for (const ds of filteredDatasets) {
      events.push({
        id: `ds-${ds.id}`,
        kind: 'dataset',
        title: `Uploaded dataset "${ds.name}"`,
        subtitle: `${ds.source_type.toUpperCase()} · ${
          ds.active_version
            ? `${ds.active_version.total_row_count.toLocaleString()} rows`
            : ds.status
        }`,
        timestamp: ds.created_at,
        href: `/datasets/${ds.id}`,
        projectId: ds.project_id,
        status: ds.status,
      })
    }

    for (const q of filteredQueries) {
      events.push({
        id: `q-${q.id}`,
        kind: 'query',
        title: q.sql_query.replace(/\s+/g, ' ').trim().slice(0, 72),
        subtitle: `${q.project_name || 'SQL Studio'} · ${q.execution_time_ms ?? 0} ms · ${
          q.returned_row_count ?? 0
        } rows`,
        timestamp: q.created_at,
        href: `/projects/${q.project_id}/analytics?tab=history`,
        projectId: q.project_id,
        status: q.status,
      })
    }

    for (const conv of filteredConversations) {
      events.push({
        id: `ai-${conv.id}`,
        kind: 'ai',
        title: conv.title || 'AI Copilot conversation',
        subtitle: `${conv.project_name || 'AI Copilot'} · ${conv.message_count} messages`,
        timestamp: conv.updated_at || conv.created_at,
        href: `/projects/${conv.project_id}/ai-analytics`,
        projectId: conv.project_id,
      })
    }

    for (const run of filteredAgentRuns) {
      events.push({
        id: `run-${run.id}`,
        kind: 'agent',
        title: run.user_request.slice(0, 72),
        subtitle: `Multi-Agent · ${run.workflow_type.replace(/_/g, ' ')}`,
        timestamp: run.created_at,
        href: `/projects/${run.project_id}/agent-analytics`,
        projectId: run.project_id,
        status: run.status,
      })
    }

    for (const rep of filteredReports) {
      events.push({
        id: `rep-${rep.id}`,
        kind: 'report',
        title: `Saved report "${rep.title}"`,
        subtitle: rep.workflow_type.replace(/_/g, ' '),
        timestamp: rep.created_at,
        href: '/reports',
        projectId: rep.project_id,
      })
    }

    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [filteredDatasets, filteredQueries, filteredConversations, filteredAgentRuns, filteredReports])

  const projectCountValue =
    selectedProjectId === 'all' ? projectTotal : projects.some((p) => p.id === selectedProjectId) ? 1 : 0
  const datasetCountValue = filteredDatasets.length
  const queryCountValue = filteredQueries.length
  const workflowCountValue =
    selectedProjectId === 'all' && timeWindow === 'all'
      ? Math.max(orgAgentRunTotal, filteredAgentRuns.length)
      : filteredAgentRuns.length
  const reportCountValue =
    selectedProjectId === 'all' && timeWindow === 'all'
      ? Math.max(orgReportTotal, filteredReports.length)
      : filteredReports.length

  const datasetDelta = useMemo(
    () =>
      computePeriodDelta(
        datasets.filter((d) => selectedProjectId === 'all' || d.project_id === selectedProjectId).map((d) => d.created_at),
        timeWindow,
      ),
    [datasets, selectedProjectId, timeWindow],
  )
  const queryDelta = useMemo(
    () =>
      computePeriodDelta(
        queryRuns.filter((q) => selectedProjectId === 'all' || q.project_id === selectedProjectId).map((q) => q.created_at),
        timeWindow,
      ),
    [queryRuns, selectedProjectId, timeWindow],
  )

  const avgQueryLatencyMs = useMemo(() => {
    const timed = filteredQueries.filter((q) => typeof q.execution_time_ms === 'number')
    if (timed.length === 0) return null
    const sum = timed.reduce((acc, q) => acc + (q.execution_time_ms || 0), 0)
    return Math.round(sum / timed.length)
  }, [filteredQueries])

  const canCreate = currentOrg?.role !== 'viewer'

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
      {/* Header with Context, Time Filter & Quick Actions */}
      <PageHeader
        title="Overview"
        description={
          user
            ? `Welcome back, ${user.name}. Monitor active datasets, SQL query telemetry, and multi-agent analytics in ${currentOrg?.organization_name || 'your workspace'}.`
            : 'Monitor active datasets, SQL query telemetry, and multi-agent analytics.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label="Filter dashboard by project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                options={[
                  { value: 'all', label: 'All Projects' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>

            <div className="w-32">
              <Select
                aria-label="Filter dashboard by time range"
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
                options={[
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                  { value: 'all', label: 'All time' },
                ]}
              />
            </div>

            <Button
              variant="secondary"
              size="md"
              onClick={() => void loadDashboard()}
              loading={isLoading}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>

            {canCreate && (
              <Link to="/data-sources" className="btn-primary text-[13px]">
                <Upload className="h-3.5 w-3.5" />
                Upload Dataset
              </Link>
            )}
          </div>
        }
      />

      {error && (
        <ErrorState
          title="Unable to refresh overview metrics"
          message={error}
          onRetry={() => void loadDashboard()}
        />
      )}

      {/* KPI Section (5 Real Workspace KPIs) */}
      <section aria-label="Workspace KPIs">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Total Projects"
              value={projectCountValue}
              description={
                currentOrg
                  ? `Active Projects in ${currentOrg.organization_name}`
                  : 'Active Projects'
              }
              icon={FolderGit2}
              accentTone="primary"
            />
            <StatCard
              label="Total Datasets"
              value={datasetCountValue}
              description={`${datasetStatusCounts.ready} ready for querying`}
              delta={datasetDelta}
              icon={Database}
              accentTone="teal"
            />
            <StatCard
              label="Total Queries"
              value={queryCountValue}
              description={
                avgQueryLatencyMs !== null
                  ? `Avg ${avgQueryLatencyMs} ms in DuckDB`
                  : 'Executed SQL runs'
              }
              delta={queryDelta}
              icon={Code2}
              accentTone="primary"
            />
            <StatCard
              label="AI Workflows"
              value={workflowCountValue}
              description={`${
                filteredAgentRuns.filter((r) => r.status === 'awaiting_approval').length
              } awaiting approval`}
              icon={Cpu}
              accentTone="teal"
            />
            <StatCard
              label="Saved Reports"
              value={reportCountValue}
              description="Executive AI deliverables"
              icon={FileText}
              accentTone="neutral"
            />
          </div>
        )}
      </section>

      {/* Main Balanced BI Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Column (8 cols) */}
        <div className="space-y-6 lg:col-span-8">
          {/* Analytical Activity Chart */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ds-ink">Analytical Activity</h2>
                <p className="text-xs text-ds-secondary">
                  Daily SQL executions, multi-agent workflows, and dataset uploads from workspace records
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ds-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-ds-primary" /> Queries
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-ds-teal" /> Workflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-slate-400" /> Datasets
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="py-8">
                <SkeletonText lines={5} />
              </div>
            ) : dailyActivitySeries.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No analytical activity in this window"
                description="Execute a SQL query or upload a dataset to track daily analytical activity."
                action={
                  <Link to="/analytics" className="btn-secondary text-xs">
                    <Play className="h-3.5 w-3.5" />
                    Open SQL Analytics
                  </Link>
                }
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyActivitySeries} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#172033',
                      }}
                    />
                    <Bar dataKey="queries" name="SQL Queries" fill="#356AE6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="workflows" name="AI Workflows" fill="#159A95" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="datasets" name="Datasets" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Dataset Activity + Query Execution Activity */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Dataset Activity */}
            <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ds-ink">Dataset Activity</h2>
                <Link
                  to="/data-sources"
                  className="text-xs font-medium text-ds-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {isLoading ? (
                <SkeletonText lines={4} />
              ) : filteredDatasets.length === 0 ? (
                <EmptyState
                  icon={Database}
                  title="No datasets uploaded"
                  description="Upload CSV, XLSX, JSON, or Parquet files to begin."
                  action={
                    canCreate ? (
                      <Link to="/data-sources" className="btn-secondary text-xs">
                        Upload Dataset
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 rounded-ds border border-ds-border-subtle bg-ds-surface2 p-2.5 text-center text-xs">
                    <div>
                      <p className="font-semibold text-ds-success tabular-nums">
                        {datasetStatusCounts.ready}
                      </p>
                      <p className="text-[11px] text-ds-secondary">Ready</p>
                    </div>
                    <div>
                      <p className="font-semibold text-ds-primary tabular-nums">
                        {datasetStatusCounts.processing}
                      </p>
                      <p className="text-[11px] text-ds-secondary">Processing</p>
                    </div>
                    <div>
                      <p className="font-semibold text-ds-error tabular-nums">
                        {datasetStatusCounts.failed}
                      </p>
                      <p className="text-[11px] text-ds-secondary">Failed</p>
                    </div>
                  </div>

                  <ul className="divide-y divide-ds-border-subtle">
                    {filteredDatasets.slice(0, 4).map((ds) => (
                      <li key={ds.id} className="py-2.5 first:pt-1 last:pb-0">
                        <Link
                          to={`/datasets/${ds.id}`}
                          className="flex items-center justify-between gap-2 group"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-ds-secondary group-hover:text-ds-primary" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-ds-ink group-hover:text-ds-primary">
                                {ds.name}
                              </p>
                              <p className="text-[11px] text-ds-secondary tabular-nums">
                                {ds.source_type.toUpperCase()} ·{' '}
                                {ds.active_version
                                  ? `${ds.active_version.total_row_count.toLocaleString()} rows`
                                  : 'Pending'}
                              </p>
                            </div>
                          </div>
                          <StatusBadge tone={statusToTone(ds.status)} dot>
                            {ds.status}
                          </StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Query Execution Activity */}
            <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ds-ink">Query Execution Activity</h2>
                <Link
                  to="/analytics?tab=history"
                  className="text-xs font-medium text-ds-primary hover:underline"
                >
                  History →
                </Link>
              </div>

              {isLoading ? (
                <SkeletonText lines={4} />
              ) : filteredQueries.length === 0 ? (
                <EmptyState
                  icon={Code2}
                  title="No SQL queries executed"
                  description="Run read-only analytical SQL directly in DuckDB."
                  action={
                    <Link to="/analytics" className="btn-secondary text-xs">
                      Open SQL Studio
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-ds-border-subtle">
                  {filteredQueries.slice(0, 5).map((q) => (
                    <li key={q.id} className="py-2.5 first:pt-1 last:pb-0">
                      <Link
                        to={`/projects/${q.project_id}/analytics?tab=history`}
                        className="block group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <code className="truncate font-mono text-[11px] text-ds-ink group-hover:text-ds-primary">
                            {q.sql_query.replace(/\s+/g, ' ').trim()}
                          </code>
                          <StatusBadge tone={statusToTone(q.status)}>
                            {q.status}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-[11px] text-ds-secondary tabular-nums">
                          {q.execution_time_ms ?? 0} ms · {q.returned_row_count ?? 0} rows ·{' '}
                          {formatRelativeDate(q.created_at)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Unified Recent Activity Timeline */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ds-ink">Recent Activity</h2>
                <p className="text-xs text-ds-secondary">
                  Verified workspace events across datasets, queries, AI threads, agents, and reports
                </p>
              </div>
            </div>

            {isLoading ? (
              <SkeletonText lines={5} />
            ) : recentActivity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No recent activity"
                description="Create a project, upload data, or start an AI analysis to see workspace activity here."
              />
            ) : (
              <ul className="divide-y divide-ds-border-subtle">
                {recentActivity.map((ev) => {
                  const Icon =
                    ev.kind === 'dataset'
                      ? Database
                      : ev.kind === 'query'
                        ? Code2
                        : ev.kind === 'ai'
                          ? MessageSquare
                          : ev.kind === 'agent'
                            ? Bot
                            : FileText

                  return (
                    <li key={ev.id}>
                      <Link
                        to={ev.href}
                        className="flex items-center justify-between gap-3 py-2.5 px-1 rounded-ds transition-colors hover:bg-ds-surface2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-ds border border-ds-border bg-ds-surface2 text-ds-secondary">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-ds-ink">{ev.title}</p>
                            <p className="truncate text-[11px] text-ds-secondary">{ev.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {ev.status && (
                            <StatusBadge tone={statusToTone(ev.status)}>{ev.status}</StatusBadge>
                          )}
                          <span className="text-[11px] text-ds-subtle tabular-nums">
                            {formatRelativeDate(ev.timestamp)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Secondary Column (4 cols) */}
        <aside className="space-y-6 lg:col-span-4">
          {/* Quick Actions Card */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-ds-ink">Quick Actions</h2>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Link
                to="/projects"
                className="flex items-center justify-between rounded-ds border border-ds-border bg-ds-surface2 px-3 py-2 text-xs font-medium text-ds-ink transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft"
              >
                <span className="flex items-center gap-2">
                  <FolderPlus className="h-3.5 w-3.5 text-ds-primary" /> Manage Projects
                </span>
                <span className="text-ds-secondary">→</span>
              </Link>
              <Link
                to="/analytics"
                className="flex items-center justify-between rounded-ds border border-ds-border bg-ds-surface2 px-3 py-2 text-xs font-medium text-ds-ink transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft"
              >
                <span className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5 text-ds-primary" /> Open SQL Analytics
                </span>
                <span className="text-ds-secondary">→</span>
              </Link>
              <Link
                to="/ai-analytics"
                className="flex items-center justify-between rounded-ds border border-ds-border bg-ds-surface2 px-3 py-2 text-xs font-medium text-ds-ink transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-ds-teal" /> Ask AI Copilot
                </span>
                <span className="text-ds-secondary">→</span>
              </Link>
              <Link
                to="/agent-analytics"
                className="flex items-center justify-between rounded-ds border border-ds-border bg-ds-surface2 px-3 py-2 text-xs font-medium text-ds-ink transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft"
              >
                <span className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-ds-teal" /> Launch Multi-Agent Run
                </span>
                <span className="text-ds-secondary">→</span>
              </Link>
            </div>
          </section>

          {/* Recent Workflows Summary */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ds-ink">Recent Workflows</h2>
              <Link to="/agent-runs" className="text-xs font-medium text-ds-primary hover:underline">
                All runs →
              </Link>
            </div>

            {isLoading ? (
              <SkeletonText lines={4} />
            ) : filteredAgentRuns.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No agent workflows yet"
                description="Run automated multi-agent analysis with human SQL approval."
                action={
                  <Link to="/agent-analytics" className="btn-secondary text-xs">
                    Start Workflow
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-ds-border-subtle">
                {filteredAgentRuns.slice(0, 4).map((run) => (
                  <li key={run.id} className="py-2.5 first:pt-1 last:pb-0">
                    <Link
                      to={`/projects/${run.project_id}/agent-analytics`}
                      className="block space-y-1 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-ds-ink group-hover:text-ds-primary">
                          {run.user_request}
                        </p>
                        <StatusBadge tone={statusToTone(run.status)}>{run.status}</StatusBadge>
                      </div>
                      <p className="text-[11px] text-ds-secondary capitalize">
                        {run.workflow_type.replace(/_/g, ' ')} · {formatRelativeDate(run.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* AI Copilot Threads / Insights */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ds-ink">AI Copilot Threads</h2>
              <Link
                to="/ai-analytics"
                className="text-xs font-medium text-ds-primary hover:underline"
              >
                Open →
              </Link>
            </div>

            {isLoading ? (
              <SkeletonText lines={3} />
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No AI conversations yet"
                description="Generate safe DuckDB SQL and insights from dataset schemas."
              />
            ) : (
              <ul className="divide-y divide-ds-border-subtle">
                {filteredConversations.slice(0, 4).map((conv) => (
                  <li key={conv.id} className="py-2.5 first:pt-1 last:pb-0">
                    <Link
                      to={`/projects/${conv.project_id}/ai-analytics`}
                      className="flex items-center justify-between gap-2 group"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ds-ink group-hover:text-ds-primary">
                          {conv.title}
                        </p>
                        <p className="text-[11px] text-ds-secondary">
                          {conv.project_name} · {conv.message_count} messages
                        </p>
                      </div>
                      <span className="text-[11px] text-ds-subtle tabular-nums">
                        {formatRelativeDate(conv.updated_at || conv.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent Reports */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ds-ink">Recent Reports</h2>
              <Link to="/reports" className="text-xs font-medium text-ds-primary hover:underline">
                View all →
              </Link>
            </div>

            {isLoading ? (
              <SkeletonText lines={3} />
            ) : filteredReports.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No reports saved yet"
                description="Save structured executive reports from completed agent runs."
              />
            ) : (
              <ul className="divide-y divide-ds-border-subtle">
                {filteredReports.slice(0, 4).map((rep) => (
                  <li key={rep.id} className="py-2.5 first:pt-1 last:pb-0">
                    <Link to="/reports" className="block group">
                      <p className="truncate text-xs font-medium text-ds-ink group-hover:text-ds-primary">
                        {rep.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ds-secondary capitalize">
                        {rep.workflow_type.replace(/_/g, ' ')} ·{' '}
                        {formatRelativeDate(rep.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* Onboarding Checklist */}
      <OnboardingGuide
        projectCount={projectTotal}
        datasetCount={datasets.length}
        agentRunCount={orgAgentRunTotal}
      />
    </div>
  )
}
