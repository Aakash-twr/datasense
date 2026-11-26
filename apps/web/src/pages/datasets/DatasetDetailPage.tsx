import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FileText,
  History,
  Layers,
  ShieldAlert,
  Table2,
  TableProperties,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { UploadVersionModal } from '@/components/datasets/UploadVersionModal'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  Select,
  SkeletonCard,
  SkeletonText,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  useToast,
  type StatusTone,
} from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type {
  Dataset,
  DatasetPreviewResponse,
  DatasetProfileResponse,
  DatasetSchemaResponse,
  DatasetVersionSummary,
} from '@/types'

type TabType = 'overview' | 'tables' | 'schema' | 'profile' | 'preview' | 'versions'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function statusToTone(status: string): StatusTone {
  switch (status) {
    case 'ready':
      return 'success'
    case 'processing':
    case 'uploading':
      return 'primary'
    case 'failed':
      return 'error'
    default:
      return 'neutral'
  }
}

export function DatasetDetailPage() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const navigate = useNavigate()
  const { currentOrg } = useAuthStore()
  const { notify } = useToast()

  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false)
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  // Preview state
  const [previewData, setPreviewData] = useState<DatasetPreviewResponse | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>(undefined)
  const [previewLimit, setPreviewLimit] = useState(50)
  const [previewOffset, setPreviewOffset] = useState(0)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Schema & Tables state
  const [schemaData, setSchemaData] = useState<DatasetSchemaResponse | null>(null)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)

  // Profile state
  const [profileData, setProfileData] = useState<DatasetProfileResponse | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)

  // Versions state
  const [versions, setVersions] = useState<DatasetVersionSummary[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)

  const canModify = currentOrg?.role !== 'viewer'

  const fetchDataset = useCallback(async () => {
    if (!datasetId) return
    setIsLoading(true)
    setError(null)
    try {
      const ds = await apiService.datasets.get(datasetId, currentOrg?.organization_id)
      setDataset(ds)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to fetch dataset details.')
    } finally {
      setIsLoading(false)
    }
  }, [datasetId, currentOrg?.organization_id])

  useEffect(() => {
    void fetchDataset()
  }, [fetchDataset])

  const fetchPreview = useCallback(async () => {
    if (!datasetId || !dataset?.active_version_id) return
    setIsLoadingPreview(true)
    try {
      const resp = await apiService.datasets.getPreview(datasetId, {
        table_id: selectedTableId,
        limit: previewLimit,
        offset: previewOffset,
        orgId: currentOrg?.organization_id,
      })
      setPreviewData(resp)
      if (!selectedTableId) {
        setSelectedTableId(resp.table_id)
      }
    } catch {
      // handled cleanly in UI
    } finally {
      setIsLoadingPreview(false)
    }
  }, [datasetId, dataset?.active_version_id, selectedTableId, previewLimit, previewOffset, currentOrg?.organization_id])

  const fetchSchema = useCallback(async () => {
    if (!datasetId || !dataset?.active_version_id) return
    setIsLoadingSchema(true)
    try {
      const resp = await apiService.datasets.getSchema(datasetId, undefined, currentOrg?.organization_id)
      setSchemaData(resp)
    } catch {
      // handled cleanly in UI
    } finally {
      setIsLoadingSchema(false)
    }
  }, [datasetId, dataset?.active_version_id, currentOrg?.organization_id])

  const fetchProfile = useCallback(async () => {
    if (!datasetId || !dataset?.active_version_id) return
    setIsLoadingProfile(true)
    try {
      const resp = await apiService.datasets.getProfile(datasetId, {
        table_id: selectedTableId,
        orgId: currentOrg?.organization_id,
      })
      setProfileData(resp)
    } catch {
      // handled cleanly in UI
    } finally {
      setIsLoadingProfile(false)
    }
  }, [datasetId, dataset?.active_version_id, selectedTableId, currentOrg?.organization_id])

  const fetchVersions = useCallback(async () => {
    if (!datasetId) return
    setIsLoadingVersions(true)
    try {
      const resp = await apiService.datasets.getVersions(datasetId, currentOrg?.organization_id)
      setVersions(resp)
    } catch {
      // handled cleanly in UI
    } finally {
      setIsLoadingVersions(false)
    }
  }, [datasetId, currentOrg?.organization_id])

  useEffect(() => {
    if (activeTab === 'preview') void fetchPreview()
    else if (activeTab === 'schema' || activeTab === 'tables') void fetchSchema()
    else if (activeTab === 'profile') void fetchProfile()
    else if (activeTab === 'versions') void fetchVersions()
    else if (activeTab === 'overview') {
      void fetchSchema()
      void fetchProfile()
    }
  }, [activeTab, fetchPreview, fetchSchema, fetchProfile, fetchVersions])

  const handleArchiveConfirm = async () => {
    if (!dataset) return
    setIsArchiving(true)
    try {
      await apiService.datasets.archive(dataset.id, currentOrg?.organization_id)
      notify({ tone: 'info', title: `Archived "${dataset.name}"` })
      navigate('/data-sources')
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to archive dataset.')
      setConfirmArchiveOpen(false)
    } finally {
      setIsArchiving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
          <SkeletonText lines={6} />
        </div>
      </div>
    )
  }

  if (error || !dataset) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorState
          title="Dataset Not Found"
          message={error || 'Could not load dataset details.'}
          action={
            <Link to="/data-sources" className="btn-secondary text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Data Sources
            </Link>
          }
        />
      </div>
    )
  }

  const activeVer = dataset.active_version
  const tablesList = schemaData?.tables ?? []

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
      <PageHeader
        title={dataset.name}
        description={dataset.description || `Source file: ${dataset.original_filename}`}
        breadcrumbs={[
          { label: 'Data Sources', href: `/data-sources?projectId=${dataset.project_id}` },
          { label: 'Dataset Details' },
        ]}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{dataset.source_type.toUpperCase()}</StatusBadge>
            {activeVer && <StatusBadge tone="primary">v{activeVer.version_number}</StatusBadge>}
            <StatusBadge tone={statusToTone(dataset.status)} dot>
              {dataset.status.toUpperCase()}
            </StatusBadge>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/projects/${dataset.project_id}/analytics`}
              className="btn-secondary text-xs"
            >
              <Code2 className="h-3.5 w-3.5" />
              Query in SQL Studio
            </Link>
            {canModify && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsVersionModalOpen(true)}
                  leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
                >
                  Upload New Version
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmArchiveOpen(true)}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Archive
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Tabs Navigation */}
      <Tabs<TabType>
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'overview', label: 'Overview', icon: <Layers className="h-3.5 w-3.5" /> },
          {
            id: 'tables',
            label: 'Tables',
            icon: <TableProperties className="h-3.5 w-3.5" />,
            badge: tablesList.length > 0 ? tablesList.length : undefined,
          },
          { id: 'schema', label: 'Schema', icon: <Database className="h-3.5 w-3.5" /> },
          { id: 'profile', label: 'Data Profile', icon: <FileText className="h-3.5 w-3.5" /> },
          { id: 'preview', label: 'Data Preview', icon: <Table2 className="h-3.5 w-3.5" /> },
          { id: 'versions', label: 'Versions', icon: <History className="h-3.5 w-3.5" /> },
        ]}
      />

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Rows"
              value={activeVer ? activeVer.total_row_count.toLocaleString() : '0'}
              description="Normalized Parquet records"
              accentTone="primary"
            />
            <StatCard
              label="Total Columns"
              value={activeVer ? activeVer.total_column_count : '0'}
              description={`Format: ${dataset.source_type.toUpperCase()}`}
              accentTone="teal"
            />
            <StatCard
              label="Tables / Sheets"
              value={schemaData ? tablesList.length : '—'}
              description="Queryable logical tables"
              accentTone="primary"
            />
            <StatCard
              label="File Size"
              value={activeVer ? formatBytes(activeVer.file_size_bytes) : '0 B'}
              description={`Uploaded ${new Date(dataset.created_at).toLocaleDateString()}`}
              accentTone="neutral"
            />
          </div>

          {/* Dataset Metadata Summary */}
          <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-ds-ink">Dataset Metadata</h2>
            <dl className="mt-3 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-ds-secondary">Original Filename</dt>
                <dd className="mt-0.5 font-mono font-medium text-ds-ink truncate">
                  {dataset.original_filename}
                </dd>
              </div>
              <div>
                <dt className="text-ds-secondary">Active Version</dt>
                <dd className="mt-0.5 font-mono font-medium text-ds-ink">
                  {activeVer ? `v${activeVer.version_number}` : 'None'}
                </dd>
              </div>
              <div>
                <dt className="text-ds-secondary">Upload Timestamp</dt>
                <dd className="mt-0.5 font-medium text-ds-ink tabular-nums">
                  {new Date(dataset.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-ds-secondary">Ingestion Status</dt>
                <dd className="mt-0.5 font-medium text-ds-ink uppercase">{dataset.status}</dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Quality Warnings */}
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-ds-warning" />
                <h3 className="text-sm font-semibold text-ds-ink">Data Quality Warnings</h3>
              </div>
              <div className="mt-3">
                {profileData?.quality_warnings && profileData.quality_warnings.length > 0 ? (
                  <div className="divide-y divide-ds-border-subtle">
                    {profileData.quality_warnings.map((warn, idx) => (
                      <div key={idx} className="flex items-start gap-3 py-2.5 text-xs">
                        <StatusBadge
                          tone={
                            warn.severity === 'critical'
                              ? 'error'
                              : warn.severity === 'warning'
                                ? 'warning'
                                : 'primary'
                          }
                        >
                          {warn.severity}
                        </StatusBadge>
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-ds-ink">{warn.code}</span>
                          {warn.column && (
                            <span className="ml-1 font-mono text-ds-secondary">({warn.column})</span>
                          )}
                          <p className="mt-0.5 text-ds-secondary">{warn.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ds-secondary">No data quality issues detected.</p>
                )}
              </div>
            </div>

            {/* Potential Sensitive Columns */}
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-ds-primary" />
                <h3 className="text-sm font-semibold text-ds-ink">
                  Potential Sensitive Columns (PII)
                </h3>
              </div>
              <p className="mt-1 text-xs text-ds-secondary">
                Heuristic local detection during ingestion. Raw values never leave your environment.
              </p>
              <div className="mt-3">
                {tablesList.some((t) => t.columns.some((c) => c.pii_category)) ? (
                  <div className="divide-y divide-ds-border-subtle">
                    {tablesList.flatMap((t) =>
                      t.columns
                        .filter((c) => c.pii_category)
                        .map((c) => (
                          <div key={c.id} className="flex items-center justify-between py-2 text-xs">
                            <span className="font-mono font-medium text-ds-ink">
                              {c.column_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <StatusBadge tone="primary">{c.pii_category}</StatusBadge>
                              {c.pii_confidence && (
                                <span className="text-[11px] text-ds-secondary tabular-nums">
                                  {Math.round(c.pii_confidence * 100)}% conf
                                </span>
                              )}
                            </div>
                          </div>
                        )),
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-ds-secondary">No sensitive or PII columns identified.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Logical Tables / Worksheets */}
      {activeTab === 'tables' && (
        <div className="space-y-4">
          {isLoadingSchema ? (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <SkeletonText lines={4} />
            </div>
          ) : tablesList.length === 0 ? (
            <EmptyState
              icon={TableProperties}
              title="No logical tables discovered"
              description="Wait for ingestion to complete or upload a valid dataset version."
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Original Table / Sheet</TableHeaderCell>
                    <TableHeaderCell>SQL Identifier</TableHeaderCell>
                    <TableHeaderCell className="text-right">Rows</TableHeaderCell>
                    <TableHeaderCell className="text-right">Columns</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tablesList.map((tbl) => (
                    <TableRow key={tbl.id} interactive>
                      <TableCell className="font-semibold text-ds-ink">
                        {tbl.original_table_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-ds-secondary">
                        {tbl.table_name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {tbl.row_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {tbl.column_count}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedTableId(tbl.id)
                              setPreviewOffset(0)
                              setActiveTab('preview')
                            }}
                          >
                            Preview Rows
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTableId(tbl.id)
                              setActiveTab('profile')
                            }}
                          >
                            Profile
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      )}

      {/* Tab 3: Schema */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
          {isLoadingSchema ? (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <SkeletonText lines={6} />
            </div>
          ) : tablesList.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Schema unavailable"
              description="No schema metadata has been generated for this version."
            />
          ) : (
            tablesList.map((table) => (
              <TableContainer key={table.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border bg-ds-surface2 px-4 py-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ds-ink">
                    <span>Table: {table.original_table_name}</span>
                    <span className="font-mono font-normal text-ds-secondary">
                      ({table.table_name})
                    </span>
                  </h3>
                  <span className="text-xs text-ds-secondary tabular-nums">
                    {table.row_count.toLocaleString()} rows · {table.column_count} columns
                  </span>
                </div>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Ordinal</TableHeaderCell>
                      <TableHeaderCell>Column Name</TableHeaderCell>
                      <TableHeaderCell>Physical Name</TableHeaderCell>
                      <TableHeaderCell>Data Type</TableHeaderCell>
                      <TableHeaderCell>Nullable</TableHeaderCell>
                      <TableHeaderCell>Semantic / PII</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody className="font-mono text-xs">
                    {table.columns.map((col) => (
                      <TableRow key={col.id} interactive>
                        <TableCell className="text-ds-subtle tabular-nums">
                          {col.ordinal_position}
                        </TableCell>
                        <TableCell className="font-semibold text-ds-ink">
                          {col.column_name}
                        </TableCell>
                        <TableCell className="text-ds-secondary">{col.physical_name}</TableCell>
                        <TableCell className="font-sans">
                          <StatusBadge tone="primary">{col.data_type}</StatusBadge>
                        </TableCell>
                        <TableCell className="font-sans">
                          <StatusBadge tone={col.nullable ? 'warning' : 'success'}>
                            {col.nullable ? 'Yes' : 'No'}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="font-sans">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {col.pii_category ? (
                              <StatusBadge tone="warning">{col.pii_category}</StatusBadge>
                            ) : (
                              <span className="text-ds-subtle">—</span>
                            )}
                            {col.semantic_type && (
                              <StatusBadge tone="neutral">{col.semantic_type}</StatusBadge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Data Profile */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          {tablesList.length > 1 && (
            <div className="w-64">
              <Select
                label="Profile Table / Worksheet"
                value={selectedTableId || tablesList[0].id}
                onChange={(e) => setSelectedTableId(e.target.value)}
                options={tablesList.map((t) => ({
                  value: t.id,
                  label: t.original_table_name,
                }))}
              />
            </div>
          )}

          {isLoadingProfile ? (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <SkeletonText lines={6} />
            </div>
          ) : !profileData ? (
            <EmptyState
              icon={FileText}
              title="No profiling statistics available"
              description="Profile metrics are generated after dataset ingestion finishes."
            />
          ) : (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs overflow-hidden">
              <div className="border-b border-ds-border bg-ds-surface2 px-4 py-3">
                <h3 className="text-xs font-semibold text-ds-ink">
                  Column Statistics ({Object.keys(profileData.column_stats).length} columns)
                </h3>
              </div>
              <div className="divide-y divide-ds-border-subtle">
                {Object.entries(profileData.column_stats).map(([colName, stats]) => (
                  <div key={colName} className="p-4 text-xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-ds-ink">{colName}</span>
                      <div className="flex items-center gap-4 text-ds-secondary tabular-nums">
                        <span>
                          Missing:{' '}
                          <strong className="text-ds-ink">{String(stats.null_count ?? 0)}</strong> (
                          {String(stats.null_percentage ?? 0)}%)
                        </span>
                        <span>
                          Unique:{' '}
                          <strong className="text-ds-ink">{String(stats.unique_count ?? 0)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Numeric Summary */}
                    {stats.mean !== undefined && (
                      <div className="grid grid-cols-2 gap-2 rounded-ds border border-ds-border-subtle bg-ds-surface2 p-2.5 text-center sm:grid-cols-5">
                        <div>
                          <span className="block text-[10px] uppercase text-ds-subtle">Min</span>
                          <span className="font-mono font-medium text-ds-ink tabular-nums">
                            {String(stats.min ?? '—')}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-ds-subtle">Max</span>
                          <span className="font-mono font-medium text-ds-ink tabular-nums">
                            {String(stats.max ?? '—')}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-ds-subtle">Mean</span>
                          <span className="font-mono font-medium text-ds-ink tabular-nums">
                            {String(stats.mean ?? '—')}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-ds-subtle">Median</span>
                          <span className="font-mono font-medium text-ds-ink tabular-nums">
                            {String(stats.median ?? '—')}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-ds-subtle">Std Dev</span>
                          <span className="font-mono font-medium text-ds-ink tabular-nums">
                            {String(stats.std ?? '—')}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Date Range Summary (if non-numeric min/max dates present) */}
                    {stats.mean === undefined &&
                      (stats.min !== undefined || stats.max !== undefined) && (
                        <div className="flex flex-wrap gap-4 rounded-ds border border-ds-border-subtle bg-ds-surface2 px-3 py-2 text-[11px]">
                          <span>
                            Earliest / Min:{' '}
                            <strong className="font-mono text-ds-ink">
                              {String(stats.min ?? '—')}
                            </strong>
                          </span>
                          <span>
                            Latest / Max:{' '}
                            <strong className="font-mono text-ds-ink">
                              {String(stats.max ?? '—')}
                            </strong>
                          </span>
                        </div>
                      )}

                    {/* Categorical Top Frequent Values */}
                    {Array.isArray(stats.top_values) && stats.top_values.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-ds-secondary">
                          Top Frequent Values:
                        </span>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {(
                            stats.top_values as Array<{
                              value: string | number
                              count: number
                              percentage: number
                            }>
                          )
                            .slice(0, 6)
                            .map((tv, tvIdx) => (
                              <div
                                key={tvIdx}
                                className="flex items-center justify-between rounded-ds-sm border border-ds-border-subtle bg-ds-surface2 px-2.5 py-1.5 text-[11px]"
                              >
                                <span className="truncate font-mono text-ds-ink">
                                  {String(tv.value)}
                                </span>
                                <span className="ml-2 font-mono text-ds-secondary tabular-nums">
                                  {tv.count} ({tv.percentage}%)
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Data Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          {tablesList.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ds-secondary">Worksheet / Table:</span>
              <div className="flex flex-wrap gap-1.5">
                {tablesList.map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={selectedTableId === t.id ? 'primary' : 'secondary'}
                    onClick={() => {
                      setSelectedTableId(t.id)
                      setPreviewOffset(0)
                    }}
                  >
                    {t.original_table_name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isLoadingPreview ? (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <SkeletonText lines={6} />
            </div>
          ) : !previewData || previewData.rows.length === 0 ? (
            <EmptyState
              icon={Table2}
              title="No preview rows available"
              description="This table currently contains zero records."
            />
          ) : (
            <TableContainer>
              <Table className="font-mono text-xs">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-12 text-center">#</TableHeaderCell>
                    {previewData.columns.map((col) => (
                      <TableHeaderCell key={col} className="whitespace-nowrap">
                        <div className="normal-case font-mono text-xs text-ds-ink">{col}</div>
                        <span className="text-[10px] font-normal text-ds-subtle">
                          {previewData.column_types[col] || ''}
                        </span>
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewData.rows.map((row, rIdx) => (
                    <TableRow key={rIdx} interactive>
                      <TableCell className="text-center text-ds-subtle tabular-nums">
                        {previewOffset + rIdx + 1}
                      </TableCell>
                      {previewData.columns.map((col) => {
                        const val = row[col]
                        return (
                          <TableCell key={col} className="max-w-xs truncate whitespace-nowrap">
                            {val === null || val === undefined ? (
                              <span className="italic text-ds-subtle">null</span>
                            ) : (
                              String(val)
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border-subtle bg-ds-surface2 px-4 py-3 text-xs text-ds-secondary">
                <span className="tabular-nums">
                  Showing {previewOffset + 1}–
                  {Math.min(previewOffset + previewLimit, previewData.total_rows)} of{' '}
                  {previewData.total_rows.toLocaleString()} rows
                </span>
                <div className="flex items-center gap-3">
                  <div className="w-28">
                    <Select
                      aria-label="Preview page size"
                      value={String(previewLimit)}
                      onChange={(e) => {
                        setPreviewLimit(Number(e.target.value))
                        setPreviewOffset(0)
                      }}
                      options={[
                        { value: '25', label: '25 rows' },
                        { value: '50', label: '50 rows' },
                        { value: '100', label: '100 rows' },
                        { value: '200', label: '200 rows' },
                        { value: '500', label: '500 rows' },
                      ]}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Previous preview page"
                      onClick={() => setPreviewOffset(Math.max(0, previewOffset - previewLimit))}
                      disabled={previewOffset === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Next preview page"
                      onClick={() => setPreviewOffset(previewOffset + previewLimit)}
                      disabled={previewOffset + previewLimit >= previewData.total_rows}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TableContainer>
          )}
        </div>
      )}

      {/* Tab 6: Versions */}
      {activeTab === 'versions' && (
        <div className="space-y-4">
          {isLoadingVersions ? (
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
              <SkeletonText lines={4} />
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              icon={History}
              title="No version history"
              description="Upload a file version to inspect version metadata."
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Version</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell className="text-right">Rows</TableHeaderCell>
                    <TableHeaderCell className="text-right">Columns</TableHeaderCell>
                    <TableHeaderCell className="text-right">File Size</TableHeaderCell>
                    <TableHeaderCell>Checksum (SHA-256)</TableHeaderCell>
                    <TableHeaderCell>Created At</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {versions.map((ver) => (
                    <TableRow key={ver.id} interactive>
                      <TableCell className="font-mono font-semibold text-ds-ink">
                        <span className="inline-flex items-center gap-2">
                          v{ver.version_number}
                          {ver.is_active && <StatusBadge tone="success">Active</StatusBadge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusToTone(ver.status)}>{ver.status}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {ver.total_row_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {ver.total_column_count}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatBytes(ver.file_size_bytes)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-[11px] text-ds-secondary">
                        {ver.checksum}
                      </TableCell>
                      <TableCell className="text-xs text-ds-secondary tabular-nums">
                        {new Date(ver.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      )}

      {/* Upload New Version Modal */}
      <UploadVersionModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        onSuccess={() => {
          setIsVersionModalOpen(false)
          void fetchDataset()
          void fetchVersions()
        }}
        datasetId={dataset.id}
        datasetName={dataset.name}
      />

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        open={confirmArchiveOpen}
        title="Archive Dataset?"
        description={`Are you sure you want to archive "${dataset.name}"? Queries referencing it will fail until restored.`}
        confirmLabel="Archive Dataset"
        variant="danger"
        loading={isArchiving}
        onConfirm={() => void handleArchiveConfirm()}
        onCancel={() => setConfirmArchiveOpen(false)}
      />
    </div>
  )
}
