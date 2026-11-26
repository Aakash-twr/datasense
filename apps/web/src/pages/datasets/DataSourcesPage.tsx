import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Database,
  Eye,
  FileSpreadsheet,
  FolderGit2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { UploadDatasetModal } from '@/components/datasets/UploadDatasetModal'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  PageHeader,
  Select,
  SkeletonText,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
  type StatusTone,
} from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Dataset, Project } from '@/types'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getSourceBadge(type: string) {
  const lower = type.toLowerCase()
  switch (lower) {
    case 'csv':
      return <StatusBadge tone="success">CSV</StatusBadge>
    case 'excel':
      return <StatusBadge tone="teal">XLSX</StatusBadge>
    case 'json':
      return <StatusBadge tone="warning">JSON</StatusBadge>
    case 'parquet':
      return <StatusBadge tone="primary">Parquet</StatusBadge>
    default:
      return <StatusBadge tone="neutral">{type.toUpperCase()}</StatusBadge>
  }
}

function getStatusBadge(status: string) {
  const map: Record<string, { tone: StatusTone; label: string; pulse?: boolean }> = {
    ready: { tone: 'success', label: 'Ready' },
    processing: { tone: 'primary', label: 'Processing', pulse: true },
    uploading: { tone: 'primary', label: 'Uploading', pulse: true },
    failed: { tone: 'error', label: 'Failed' },
    archived: { tone: 'neutral', label: 'Archived' },
  }
  const cfg = map[status] || { tone: 'neutral', label: status }
  return (
    <StatusBadge tone={cfg.tone} dot pulse={cfg.pulse}>
      {cfg.label}
    </StatusBadge>
  )
}

export function DataSourcesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentOrg } = useAuthStore()
  const { notify } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    searchParams.get('projectId') || '',
  )
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({})
  const [totalDatasets, setTotalDatasets] = useState(0)

  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)

  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [archivingDataset, setArchivingDataset] = useState<Dataset | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  const canModify = currentOrg?.role !== 'viewer'

  const fetchProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    try {
      const resp = await apiService.projects.list({
        page_size: 100,
        orgId: currentOrg?.organization_id,
      })
      setProjects(resp.items)
      if (resp.items.length > 0 && !selectedProjectId) {
        setSelectedProjectId(resp.items[0].id)
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail)
    } finally {
      setIsLoadingProjects(false)
    }
  }, [selectedProjectId, currentOrg?.organization_id])

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  const fetchDatasets = useCallback(async () => {
    if (!selectedProjectId) {
      setDatasets([])
      setTotalDatasets(0)
      return
    }

    setIsLoadingDatasets(true)
    setError(null)
    try {
      const resp = await apiService.datasets.list(selectedProjectId, {
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        orgId: currentOrg?.organization_id,
      })
      setDatasets(resp.items)
      setTotalDatasets(resp.total)

      // Fetch real table counts from schema metadata for ready datasets
      const readyItems = resp.items.filter((d) => d.status === 'ready')
      if (apiService.datasets.getSchema && readyItems.length > 0) {
        const schemaResults = await Promise.allSettled(
          readyItems.map(async (ds) => {
            const schema = await apiService.datasets.getSchema(
              ds.id,
              undefined,
              currentOrg?.organization_id,
            )
            return [ds.id, schema?.tables?.length] as const
          }),
        )
        const nextCounts: Record<string, number> = {}
        for (const r of schemaResults) {
          if (r.status === 'fulfilled' && typeof r.value[1] === 'number') {
            nextCounts[r.value[0]] = r.value[1]
          }
        }
        setTableCounts(nextCounts)
      } else {
        setTableCounts({})
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to fetch datasets.')
    } finally {
      setIsLoadingDatasets(false)
    }
  }, [selectedProjectId, search, statusFilter, currentOrg?.organization_id])

  useEffect(() => {
    void fetchDatasets()
  }, [fetchDatasets])

  // Real polling while any dataset is ingesting
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

  const visibleDatasets = useMemo(() => {
    if (formatFilter === 'all') return datasets
    return datasets.filter((d) => d.source_type.toLowerCase() === formatFilter)
  }, [datasets, formatFilter])

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id)
    setSearchParams({ projectId: id })
  }

  const handleConfirmArchive = async () => {
    if (!archivingDataset) return
    setIsArchiving(true)
    try {
      await apiService.datasets.archive(archivingDataset.id, currentOrg?.organization_id)
      notify({
        tone: 'info',
        title: `Archived "${archivingDataset.name}"`,
      })
      setArchivingDataset(null)
      void fetchDatasets()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to archive dataset.')
      setArchivingDataset(null)
    } finally {
      setIsArchiving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
      <PageHeader
        title="Data Sources"
        description="Upload, inspect, and govern structured datasets (CSV, XLSX, JSON, Parquet) inside your project workspaces."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => void fetchDatasets()}
              loading={isLoadingDatasets}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
            {canModify && (
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsUploadOpen(true)}
                disabled={projects.length === 0}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Upload Dataset
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <ErrorState
          title="Unable to load datasets"
          message={error}
          onRetry={() => void fetchDatasets()}
        />
      )}

      {/* Controls Bar */}
      <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Project Selector */}
        <div className="flex items-center gap-2.5">
          <FolderGit2 className="h-4 w-4 flex-shrink-0 text-ds-secondary" />
          <span className="text-xs font-medium text-ds-secondary">Project:</span>
          {isLoadingProjects ? (
            <div className="h-9 w-48 animate-pulse rounded-ds bg-ds-muted" />
          ) : projects.length === 0 ? (
            <Link to="/projects" className="text-xs font-medium text-ds-primary hover:underline">
              + Create a project first
            </Link>
          ) : (
            <div className="w-56">
              <Select
                aria-label="Select project workspace"
                value={selectedProjectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-56">
            <Input
              placeholder="Search datasets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-3.5 w-3.5" />}
              aria-label="Search datasets"
            />
          </div>

          <div className="w-36">
            <Select
              aria-label="Filter by format"
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All formats' },
                { value: 'csv', label: 'CSV files' },
                { value: 'excel', label: 'Excel (.xlsx)' },
                { value: 'json', label: 'JSON files' },
                { value: 'parquet', label: 'Parquet files' },
              ]}
            />
          </div>

          <div className="w-36">
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'ready', label: 'Ready' },
                { value: 'processing', label: 'Processing' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Dataset Inventory */}
      {projects.length === 0 && !isLoadingProjects ? (
        <EmptyState
          icon={FolderGit2}
          title="No project available"
          description="Create a project first before uploading structured datasets."
          action={
            <Link to="/projects" className="btn-primary text-xs">
              Go to Projects
            </Link>
          }
        />
      ) : isLoadingDatasets ? (
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
          <SkeletonText lines={6} />
        </div>
      ) : visibleDatasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No datasets found"
          description={
            search || statusFilter !== 'all' || formatFilter !== 'all'
              ? 'Try adjusting your search query or filters.'
              : 'Upload CSV, Excel (.xlsx), JSON, or Parquet files to start automated profiling and DuckDB analytics.'
          }
          action={
            canModify && projects.length > 0 && !search && statusFilter === 'all' && formatFilter === 'all' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsUploadOpen(true)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Upload Your First Dataset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Dataset</TableHeaderCell>
                <TableHeaderCell>Format</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Tables</TableHeaderCell>
                <TableHeaderCell className="text-right">Rows</TableHeaderCell>
                <TableHeaderCell className="text-right">File Size</TableHeaderCell>
                <TableHeaderCell>Version</TableHeaderCell>
                <TableHeaderCell>Uploaded</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleDatasets.map((dataset) => {
                const activeVer = dataset.active_version
                const tblCount = tableCounts[dataset.id]

                return (
                  <TableRow key={dataset.id} interactive>
                    <TableCell>
                      <Link
                        to={`/datasets/${dataset.id}`}
                        className="flex items-center gap-2 font-semibold text-ds-ink hover:text-ds-primary"
                      >
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-ds-secondary" />
                        <span className="truncate max-w-[220px]">{dataset.name}</span>
                      </Link>
                      <p className="mt-0.5 truncate max-w-[260px] text-[11px] text-ds-secondary">
                        {dataset.description || dataset.original_filename}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {getSourceBadge(dataset.source_type)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {getStatusBadge(dataset.status)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                      {typeof tblCount === 'number' ? tblCount : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                      {activeVer ? activeVer.total_row_count.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums">
                      {activeVer ? formatBytes(activeVer.file_size_bytes) : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {activeVer ? (
                        <StatusBadge tone="neutral">v{activeVer.version_number}</StatusBadge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ds-secondary tabular-nums">
                      {new Date(dataset.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Link
                          to={`/datasets/${dataset.id}`}
                          className="rounded-ds-sm p-1.5 text-ds-secondary transition-colors hover:bg-ds-primary-soft hover:text-ds-primary"
                          title="View Dataset"
                          aria-label={`View ${dataset.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {canModify && (
                          <button
                            type="button"
                            onClick={() => setArchivingDataset(dataset)}
                            className="rounded-ds-sm p-1.5 text-ds-secondary transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                            title="Archive Dataset"
                            aria-label={`Archive ${dataset.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-ds-border-subtle bg-ds-surface2 px-4 py-2.5 text-xs text-ds-secondary">
            <span>
              Showing {visibleDatasets.length} of {totalDatasets} datasets
            </span>
          </div>
        </TableContainer>
      )}

      {/* Upload Modal */}
      <UploadDatasetModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSuccess={(datasetId) => {
          setIsUploadOpen(false)
          navigate(`/datasets/${datasetId}`)
        }}
      />

      {/* Archive Confirmation */}
      <ConfirmDialog
        open={Boolean(archivingDataset)}
        title="Archive Dataset?"
        description={`Are you sure you want to archive "${archivingDataset?.name}"? Queries referencing it will no longer run until restored.`}
        confirmLabel="Archive Dataset"
        variant="danger"
        loading={isArchiving}
        onConfirm={() => void handleConfirmArchive()}
        onCancel={() => setArchivingDataset(null)}
      />
    </div>
  )
}
