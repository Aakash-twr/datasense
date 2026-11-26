import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Calendar,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FolderGit2,
  Layers,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { UploadDatasetModal } from '@/components/datasets/UploadDatasetModal'
import {
  Button,
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
import { ApiError, apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Dataset, Project } from '@/types'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentOrg } = useAuthStore()

  const [project, setProject] = useState<Project | null>(null)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoadingProject, setIsLoadingProject] = useState(true)
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)

  useEffect(() => {
    if (!projectId) return
    setIsLoadingProject(true)
    apiService.projects
      .get(projectId, currentOrg?.organization_id)
      .then(setProject)
      .catch((err) => {
        setError(err instanceof ApiError ? err.detail : 'Failed to load project.')
      })
      .finally(() => setIsLoadingProject(false))
  }, [projectId, currentOrg?.organization_id])

  const fetchDatasets = useCallback(async () => {
    if (!projectId) return
    setIsLoadingDatasets(true)
    try {
      const resp = await apiService.datasets.list(projectId, { page_size: 50 })
      setDatasets(resp.items)
    } catch {
      // Keep project overview visible if dataset list transiently fails
    } finally {
      setIsLoadingDatasets(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      void fetchDatasets()
    }
  }, [projectId, fetchDatasets])

  useEffect(() => {
    const hasProcessing = datasets.some(
      (d) => d.status === 'processing' || d.status === 'uploading',
    )
    if (!hasProcessing) return

    const interval = setInterval(() => {
      void fetchDatasets()
    }, 2500)

    return () => clearInterval(interval)
  }, [datasets, fetchDatasets])

  const handleUploadSuccess = () => {
    setIsUploadOpen(false)
    void fetchDatasets()
  }

  if (isLoadingProject) {
    return (
      <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ds-secondary hover:text-ds-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to projects</span>
        </Link>
        <ErrorState title="Unable to load project" message={error || 'Project not found.'} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      <PageHeader
        title={project.name}
        description={project.description || 'Structured analytical project container and datasets.'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: 'Project Details' },
        ]}
        badge={
          <StatusBadge tone="success" dot>
            Active
          </StatusBadge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/projects/${project.id}/agent-analytics`} className="btn-secondary text-xs">
              <Bot className="h-3.5 w-3.5 text-ds-primary" />
              <span>Multi-Agent</span>
            </Link>
            <Link to={`/projects/${project.id}/ai-analytics`} className="btn-secondary text-xs">
              <Sparkles className="h-3.5 w-3.5 text-ds-primary" />
              <span>AI Copilot</span>
            </Link>
            <Link to={`/projects/${project.id}/analytics`} className="btn-secondary text-xs">
              <BarChart3 className="h-3.5 w-3.5 text-ds-primary" />
              <span>SQL Studio</span>
            </Link>
            <Link to={`/data-sources?projectId=${project.id}`} className="btn-secondary text-xs">
              <Database className="h-3.5 w-3.5" />
              <span>View in Data Sources</span>
            </Link>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsUploadOpen(true)}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Upload Dataset
            </Button>
          </div>
        }
      />

      {/* Project Summary Card */}
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ds-border-subtle pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ds-ink">Workspace Metadata</h2>
              <p className="font-mono text-[11px] text-ds-subtle">ID: {project.id}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ds-subtle">
              Created
            </p>
            <p className="mt-1 font-mono text-ds-ink tabular-nums">
              {new Date(project.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ds-subtle">
              Last Updated
            </p>
            <p className="mt-1 font-mono text-ds-ink tabular-nums">
              {new Date(project.updated_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-ds-subtle">
              Datasets Ingested
            </p>
            <p className="mt-1 font-semibold text-ds-primary tabular-nums">
              {datasets.length} dataset{datasets.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Datasets in this Project */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ds-ink">Project Datasets</h2>
            <p className="text-xs text-ds-secondary">
              Structured datasets uploaded, normalized, and profiled for analysis in this project.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Upload Dataset
          </Button>
        </div>

        {isLoadingDatasets ? (
          <div className="flex h-40 items-center justify-center rounded-ds-lg border border-ds-border bg-ds-surface">
            <Loader2 className="h-5 w-5 animate-spin text-ds-primary" />
          </div>
        ) : datasets.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No datasets uploaded yet"
            description="Upload CSV, Excel (.xlsx), JSON, or Parquet files to inspect schemas, view statistical profiles, and preview data."
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Upload Your First Dataset
              </Button>
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Dataset Name</TableHeaderCell>
                  <TableHeaderCell>Format</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Shape</TableHeaderCell>
                  <TableHeaderCell>Uploaded</TableHeaderCell>
                  <TableHeaderCell className="text-right">Action</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="text-xs">
                {datasets.map((dataset) => {
                  const activeVer = dataset.active_version
                  const format = dataset.source_type?.toUpperCase() || 'DATA'
                  const rows = activeVer?.total_row_count ?? 0
                  const cols = activeVer?.total_column_count ?? 0

                  return (
                    <TableRow key={dataset.id} interactive>
                      <TableCell>
                        <Link
                          to={`/datasets/${dataset.id}`}
                          className="flex items-center gap-1.5 font-semibold text-ds-ink hover:text-ds-primary"
                        >
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-ds-primary" />
                          <span className="max-w-[200px] truncate">{dataset.name}</span>
                        </Link>
                        {dataset.description && (
                          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-ds-secondary">
                            {dataset.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral">{format}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        {dataset.status === 'ready' && (
                          <StatusBadge tone="success" dot>
                            Ready
                          </StatusBadge>
                        )}
                        {(dataset.status === 'processing' || dataset.status === 'uploading') && (
                          <StatusBadge tone="primary">
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                            {dataset.status === 'uploading' ? 'Uploading' : 'Processing'}
                          </StatusBadge>
                        )}
                        {dataset.status === 'failed' && (
                          <StatusBadge tone="error" dot>
                            Failed
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-ds-secondary tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3 text-ds-subtle" />
                          v{activeVer?.version_number ?? 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-ds-secondary tabular-nums">
                        {rows.toLocaleString()} rows × {cols} cols
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-[11px] text-ds-subtle tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-ds-subtle" />
                          {new Date(dataset.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/datasets/${dataset.id}`} className="btn-secondary text-xs">
                          <span>Explore</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </section>

      {project && (
        <UploadDatasetModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={handleUploadSuccess}
          projects={[project]}
          selectedProjectId={project.id}
        />
      )}
    </div>
  )
}
