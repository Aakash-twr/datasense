import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Eye,
  FileText,
  FolderKanban,
  Search,
  Sparkles,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { ReportViewer } from '@/components/agents/ReportViewer'
import { EmptyState } from '@/components/common/EmptyState'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui'
import { useToast } from '@/components/ui/useToast'
import { ApiError, apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { AgentVisualizationSpec, AnalysisReportItem, Project } from '@/types'

export const ReportsPage: React.FC = () => {
  const { reportId: routeReportId } = useParams<{ reportId?: string }>()
  const navigate = useNavigate()
  const { user, currentOrg } = useAuthStore()
  const { notify } = useToast()

  const canDelete = currentOrg?.role !== 'viewer'

  const [reports, setReports] = useState<AnalysisReportItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedReport, setSelectedReport] = useState<AnalysisReportItem | null>(null)
  const [reportCharts, setReportCharts] = useState<AgentVisualizationSpec[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search & filters
  const [searchTerm, setSearchTerm] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<AnalysisReportItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [reportsRes, projectsRes] = await Promise.all([
        apiService.reports.listOrgReports({ page_size: 50, orgId: currentOrg?.organization_id }),
        apiService.projects
          ?.list({ page_size: 100, orgId: currentOrg?.organization_id })
          .catch(() => ({ items: [] as Project[] })) ?? Promise.resolve({ items: [] as Project[] }),
      ])

      setReports(reportsRes.items)
      setProjects(projectsRes.items)

      if (routeReportId) {
        const match = reportsRes.items.find((r) => r.id === routeReportId)
        if (match) {
          setSelectedReport(match)
        } else if (apiService.reports.getOrgReport) {
          const fetched = await apiService.reports
            .getOrgReport(routeReportId, currentOrg?.organization_id)
            .catch(() => null)
          if (fetched) setSelectedReport(fetched)
        }
      } else if (reportsRes.items.length > 0 && !selectedReport) {
        setSelectedReport(reportsRes.items[0])
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to load analytical reports.')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.organization_id, routeReportId])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  // Fetch associated run charts when inspecting a report linked to an agent run
  useEffect(() => {
    if (!selectedReport?.agent_run_id || !selectedReport.project_id || !apiService.agents?.getResults) {
      setReportCharts([])
      return
    }

    let cancelled = false
    apiService.agents
      .getResults(selectedReport.project_id, selectedReport.agent_run_id)
      .then((res) => {
        if (!cancelled) {
          setReportCharts(res?.visualizations?.charts || [])
        }
      })
      .catch(() => {
        if (!cancelled) setReportCharts([])
      })

    return () => {
      cancelled = true
    }
  }, [selectedReport?.id, selectedReport?.agent_run_id, selectedReport?.project_id])

  const workflowTypes = useMemo(
    () => Array.from(new Set(reports.map((r) => r.workflow_type))).sort(),
    [reports],
  )

  const filteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return reports.filter((rep) => {
      if (workflowFilter !== 'all' && rep.workflow_type !== workflowFilter) return false
      if (projectFilter !== 'all' && rep.project_id !== projectFilter) return false
      if (!q) return true
      const projName = projectMap.get(rep.project_id)?.toLowerCase() || ''
      const summary = rep.report_json?.executive_summary?.toLowerCase() || ''
      return (
        rep.title.toLowerCase().includes(q) ||
        summary.includes(q) ||
        rep.workflow_type.toLowerCase().includes(q) ||
        projName.includes(q)
      )
    })
  }, [reports, searchTerm, workflowFilter, projectFilter, projectMap])

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await apiService.reports.deleteOrgReport(deleteTarget.id, currentOrg?.organization_id)
      const remaining = reports.filter((r) => r.id !== deleteTarget.id)
      setReports(remaining)
      if (selectedReport?.id === deleteTarget.id) {
        setSelectedReport(remaining[0] || null)
        if (routeReportId) {
          navigate('/reports')
        }
      }
      notify({ tone: 'info', title: `Deleted "${deleteTarget.title}"` })
      setDeleteTarget(null)
    } catch (err) {
      notify({
        tone: 'error',
        title: err instanceof ApiError ? err.detail : 'Failed to delete report.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const resolveOwnerLabel = (userId: string) => {
    if (user?.id === userId) return user.name
    return `User ${userId.slice(0, 6)}`
  }

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      <PageHeader
        title="Reports"
        description="Executive business intelligence reports generated from validated multi-agent workflows."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {routeReportId && (
              <Link to="/reports" className="btn-secondary text-xs">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Report Library</span>
              </Link>
            )}
            <Link to="/agent-analytics" className="btn-primary text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>New Agent Analysis</span>
            </Link>
          </div>
        }
      />

      {error && <ErrorState title="Could not load reports" message={error} onRetry={loadReports} />}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Saved Reports Yet"
          description="Run a Deep Analysis or Report Generation workflow in the Multi-Agent Workspace and save the resulting executive report."
          action={
            <Link to="/agent-analytics" className="btn-primary text-xs">
              Open Multi-Agent Workspace
            </Link>
          }
        />
      ) : routeReportId && selectedReport ? (
        /* Dedicated Full-Width Report Detail Route View */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 text-xs text-ds-secondary">
            <span className="inline-flex items-center gap-1.5 font-medium text-ds-ink">
              <FolderKanban className="h-3.5 w-3.5 text-ds-subtle" />
              {projectMap.get(selectedReport.project_id) || 'Project'}
            </span>
            <span>·</span>
            <StatusBadge tone="primary">{selectedReport.workflow_type}</StatusBadge>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Calendar className="h-3.5 w-3.5 text-ds-subtle" />
              Created {new Date(selectedReport.created_at).toLocaleDateString()}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              Updated {new Date(selectedReport.updated_at).toLocaleDateString()}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5 text-ds-subtle" />
              {resolveOwnerLabel(selectedReport.user_id)}
            </span>
          </div>

          <ReportViewer
            report={selectedReport.report_json}
            markdown={selectedReport.report_markdown}
            charts={reportCharts}
            projectId={selectedReport.project_id}
            agentRunId={selectedReport.agent_run_id}
          />
        </div>
      ) : (
        /* Library Table + Live Report Preview Split */
        <div className="space-y-6">
          {/* Search & Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 shadow-xs">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ds-subtle" />
              <input
                type="text"
                aria-label="Search reports"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search reports by title, summary, or workflow..."
                className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-3 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {projects.length > 0 && (
                <select
                  aria-label="Filter reports by project"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1.5 text-xs font-medium text-ds-ink focus:border-ds-primary focus:outline-none"
                >
                  <option value="all">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Filter reports by workflow"
                value={workflowFilter}
                onChange={(e) => setWorkflowFilter(e.target.value)}
                className="rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1.5 text-xs font-medium text-ds-ink focus:border-ds-primary focus:outline-none"
              >
                <option value="all">All Workflows</option>
                {workflowTypes.map((wt) => (
                  <option key={wt} value={wt}>
                    {wt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Report Library Table */}
          {filteredReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No matching reports"
              description="Try clearing your search or filter selections."
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Report Name &amp; Description</TableHeaderCell>
                    <TableHeaderCell>Project</TableHeaderCell>
                    <TableHeaderCell>Workflow</TableHeaderCell>
                    <TableHeaderCell>Owner</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody className="text-xs">
                  {filteredReports.map((rep) => {
                    const isSelected = selectedReport?.id === rep.id
                    return (
                      <TableRow
                        key={rep.id}
                        interactive
                        className={isSelected ? 'bg-ds-primary-soft/35' : ''}
                      >
                        <TableCell className="max-w-sm">
                          <button
                            type="button"
                            onClick={() => setSelectedReport(rep)}
                            className="text-left focus:outline-none"
                          >
                            <span className="block font-semibold text-ds-ink hover:text-ds-primary">
                              {rep.title}
                            </span>
                            <span className="mt-0.5 line-clamp-1 block text-[11px] text-ds-secondary">
                              {rep.report_json?.executive_summary || 'Multi-agent analytical report'}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-ds-secondary">
                          {projectMap.get(rep.project_id) || 'Project'}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="neutral">{rep.workflow_type}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-ds-secondary">
                          {resolveOwnerLabel(rep.user_id)}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-ds-secondary tabular-nums">
                          {new Date(rep.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-ds-secondary tabular-nums">
                          {new Date(rep.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="sm"
                              onClick={() => setSelectedReport(rep)}
                              leftIcon={<Eye className="h-3 w-3" />}
                            >
                              Preview
                            </Button>
                            <Link
                              to={`/reports/${rep.id}`}
                              title="Open full report view"
                              className="btn-secondary text-xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Open</span>
                            </Link>
                            {canDelete && (
                              <button
                                type="button"
                                title="Delete report"
                                aria-label={`Delete report ${rep.title}`}
                                onClick={() => setDeleteTarget(rep)}
                                className="rounded-ds-sm p-1.5 text-ds-subtle transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Selected Report Document Preview */}
          {selectedReport && (
            <ReportViewer
              report={selectedReport.report_json}
              markdown={selectedReport.report_markdown}
              charts={reportCharts}
              projectId={selectedReport.project_id}
              agentRunId={selectedReport.agent_run_id}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Saved Report"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action removes the report from the organization library.`}
        confirmLabel="Delete Report"
        variant="danger"
        loading={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
