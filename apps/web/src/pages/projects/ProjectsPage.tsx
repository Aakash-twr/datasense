import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Database,
  Edit2,
  ExternalLink,
  FolderGit2,
  FolderPlus,
  LayoutGrid,
  List as ListIcon,
  Search,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Dataset, Project } from '@/types'

type ViewMode = 'grid' | 'list'
type ProjectFilter = 'all' | 'has_datasets' | 'setup'
type SortBy = 'recent' | 'name' | 'datasets'

interface ProjectMeta {
  datasetCount: number
  latestActivity?: string
  latestDatasetName?: string
}

export function ProjectsPage() {
  const { currentOrg } = useAuthStore()
  const { notify } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [metaByProject, setMetaByProject] = useState<Record<string, ProjectMeta>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [archivingProject, setArchivingProject] = useState<Project | null>(null)

  // Form fields
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiService.projects.list({
        search: search.trim() || undefined,
        orgId: currentOrg?.organization_id,
      })
      setProjects(res.items)

      // Fetch actual per-project dataset summaries safely
      if (apiService.datasets?.list && res.items.length > 0) {
        const metaEntries = await Promise.all(
          res.items.slice(0, 24).map(async (proj) => {
            try {
              const dsRes = await apiService.datasets.list(proj.id, {
                page_size: 5,
                orgId: currentOrg?.organization_id,
              })
              const latestDs: Dataset | undefined = dsRes.items[0]
              return [
                proj.id,
                {
                  datasetCount: dsRes.total,
                  latestActivity: latestDs?.updated_at || proj.updated_at,
                  latestDatasetName: latestDs?.name,
                },
              ] as const
            } catch {
              return [
                proj.id,
                { datasetCount: 0, latestActivity: proj.updated_at },
              ] as const
            }
          }),
        )
        setMetaByProject(Object.fromEntries(metaEntries))
      } else {
        setMetaByProject({})
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to load projects.')
    } finally {
      setIsLoading(false)
    }
  }, [search, currentOrg?.organization_id])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchProjects()
    }, 180)
    return () => clearTimeout(timer)
  }, [fetchProjects])

  const filteredProjects = useMemo(() => {
    const list = projects.filter((p) => {
      const dsCount = metaByProject[p.id]?.datasetCount ?? 0
      if (statusFilter === 'has_datasets') return dsCount > 0
      if (statusFilter === 'setup') return dsCount === 0
      return true
    })

    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'datasets') {
        return (metaByProject[b.id]?.datasetCount ?? 0) - (metaByProject[a.id]?.datasetCount ?? 0)
      }
      const dateA = new Date(metaByProject[a.id]?.latestActivity || a.updated_at).getTime()
      const dateB = new Date(metaByProject[b.id]?.latestActivity || b.updated_at).getTime()
      return dateB - dateA
    })
  }, [projects, metaByProject, statusFilter, sortBy])

  const totalDatasetsAcrossProjects = useMemo(
    () => Object.values(metaByProject).reduce((sum, m) => sum + m.datasetCount, 0),
    [metaByProject],
  )
  const readyProjectsCount = useMemo(
    () => projects.filter((p) => (metaByProject[p.id]?.datasetCount ?? 0) > 0).length,
    [projects, metaByProject],
  )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError('Project name is required.')
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await apiService.projects.create(
        { name: formName.trim(), description: formDesc.trim() || undefined },
        currentOrg?.organization_id,
      )
      setIsCreateOpen(false)
      setFormName('')
      setFormDesc('')
      notify({ tone: 'success', title: 'Project created' })
      void fetchProjects()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.detail : 'Failed to create project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject || !formName.trim()) {
      setFormError('Project name is required.')
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await apiService.projects.update(
        editingProject.id,
        { name: formName.trim(), description: formDesc.trim() || undefined },
        currentOrg?.organization_id,
      )
      setEditingProject(null)
      notify({ tone: 'success', title: 'Project updated' })
      void fetchProjects()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.detail : 'Failed to update project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleArchive = async () => {
    if (!archivingProject) return
    setIsSubmitting(true)
    try {
      await apiService.projects.archive(archivingProject.id, currentOrg?.organization_id)
      setArchivingProject(null)
      notify({ tone: 'info', title: 'Project archived' })
      void fetchProjects()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to archive project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEdit = (p: Project) => {
    setEditingProject(p)
    setFormName(p.name)
    setFormDesc(p.description || '')
    setFormError(null)
  }

  const canManage = currentOrg?.role === 'owner' || currentOrg?.role === 'admin'
  const canCreate = canManage || currentOrg?.role === 'analyst'

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6">
      <PageHeader
        title="Projects"
        description={`Organize datasets, DuckDB queries, AI threads, and executive reports in ${
          currentOrg?.organization_name || 'your workspace'
        }.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Grid / List View Switcher */}
            <div
              role="group"
              aria-label="Projects layout switcher"
              className="inline-flex rounded-ds border border-ds-border bg-ds-surface p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className={`inline-flex items-center gap-1.5 rounded-ds-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-ds-primary-soft text-ds-primary'
                    : 'text-ds-secondary hover:text-ds-ink'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`inline-flex items-center gap-1.5 rounded-ds-sm px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-ds-primary-soft text-ds-primary'
                    : 'text-ds-secondary hover:text-ds-ink'
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
                List
              </button>
            </div>

            {canCreate && (
              <Button
                variant="primary"
                onClick={() => {
                  setIsCreateOpen(true)
                  setFormName('')
                  setFormDesc('')
                  setFormError(null)
                }}
                leftIcon={<FolderPlus className="h-4 w-4" />}
              >
                New Project
              </Button>
            )}
          </div>
        }
      />

      {/* Main Content + Command-OS Summary Rail */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-9">
          {/* Search & Filters */}
          <div className="flex flex-col gap-3 rounded-ds-lg border border-ds-border bg-ds-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects by name…"
                leftIcon={<Search className="h-3.5 w-3.5" />}
                aria-label="Search projects"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select
                  aria-label="Filter projects by readiness"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ProjectFilter)}
                  options={[
                    { value: 'all', label: 'All projects' },
                    { value: 'has_datasets', label: 'With datasets' },
                    { value: 'setup', label: 'Needs data' },
                  ]}
                />
              </div>

              <div className="w-40">
                <Select
                  aria-label="Sort projects"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  options={[
                    { value: 'recent', label: 'Sort: Recent activity' },
                    { value: 'datasets', label: 'Sort: Dataset count' },
                    { value: 'name', label: 'Sort: Name A–Z' },
                  ]}
                />
              </div>
            </div>
          </div>

          {error && (
            <ErrorState
              title="Unable to load projects"
              message={error}
              onRetry={() => void fetchProjects()}
            />
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              icon={FolderGit2}
              title="No projects found"
              description={
                search || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or filters.'
                  : 'Get started by creating your first analytical project workspace.'
              }
              action={
                canCreate && !search && statusFilter === 'all' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsCreateOpen(true)
                      setFormName('')
                      setFormDesc('')
                      setFormError(null)
                    }}
                    leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
                  >
                    Create project
                  </Button>
                ) : undefined
              }
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => {
                const meta = metaByProject[project.id]
                const dsCount = meta?.datasetCount ?? 0
                const hasDatasets = dsCount > 0
                const lastActive = meta?.latestActivity || project.updated_at

                return (
                  <div
                    key={project.id}
                    className="flex flex-col justify-between rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs transition-shadow hover:shadow-subtle"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-ds bg-ds-primary-soft text-ds-primary">
                            <FolderGit2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/projects/${project.id}`}
                              className="block truncate text-sm font-semibold text-ds-ink hover:text-ds-primary"
                            >
                              {project.name}
                            </Link>
                          </div>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1">
                          <StatusBadge tone={hasDatasets ? 'success' : 'neutral'} dot>
                            {hasDatasets ? 'Active' : 'Setup'}
                          </StatusBadge>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(project)}
                                aria-label="Edit project"
                                className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setArchivingProject(project)}
                                aria-label="Archive project"
                                className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="mt-2.5 line-clamp-2 text-xs text-ds-secondary min-h-[2rem]">
                        {project.description || 'No description provided.'}
                      </p>

                      {/* Metadata row */}
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-ds border border-ds-border-subtle bg-ds-surface2 px-3 py-2 text-[11px]">
                        <div>
                          <span className="text-ds-subtle">Datasets</span>
                          <p className="font-semibold text-ds-ink tabular-nums">
                            {dsCount} {dsCount === 1 ? 'dataset' : 'datasets'}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <span className="text-ds-subtle">Recent activity</span>
                          <p className="truncate font-medium text-ds-ink">
                            {meta?.latestDatasetName
                              ? meta.latestDatasetName
                              : new Date(lastActive).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-ds-border-subtle pt-3 text-[11px] text-ds-secondary">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="h-3 w-3 text-ds-subtle" />
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </span>
                      <Link
                        to={`/projects/${project.id}`}
                        className="inline-flex items-center gap-1 font-medium text-ds-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* List View */
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Project</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Datasets</TableHeaderCell>
                    <TableHeaderCell>Recent Activity</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredProjects.map((project) => {
                    const meta = metaByProject[project.id]
                    const dsCount = meta?.datasetCount ?? 0
                    const lastActive = meta?.latestActivity || project.updated_at

                    return (
                      <TableRow key={project.id} interactive>
                        <TableCell>
                          <Link
                            to={`/projects/${project.id}`}
                            className="font-semibold text-ds-ink hover:text-ds-primary"
                          >
                            {project.name}
                          </Link>
                          {project.description && (
                            <p className="mt-0.5 line-clamp-1 max-w-sm text-xs text-ds-secondary">
                              {project.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={dsCount > 0 ? 'success' : 'neutral'} dot>
                            {dsCount > 0 ? 'Active' : 'Setup'}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="tabular-nums font-medium">
                          {dsCount}
                        </TableCell>
                        <TableCell className="text-xs text-ds-secondary">
                          {meta?.latestDatasetName
                            ? `${meta.latestDatasetName} · ${new Date(lastActive).toLocaleDateString()}`
                            : new Date(lastActive).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs text-ds-secondary tabular-nums">
                          {new Date(project.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/projects/${project.id}`}
                              className="rounded-ds-sm px-2 py-1 text-xs font-medium text-ds-primary hover:bg-ds-primary-soft"
                            >
                              Open
                            </Link>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEdit(project)}
                                  aria-label="Edit project"
                                  className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-muted hover:text-ds-ink"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setArchivingProject(project)}
                                  aria-label="Archive project"
                                  className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-error-soft hover:text-ds-error"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
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
        </div>

        {/* Right Summary Rail (Command-OS structure with strictly real data) */}
        <aside className="space-y-4 xl:col-span-3">
          <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-secondary">
              Workspace Summary
            </h2>

            <div className="space-y-3">
              <div className="rounded-ds border border-ds-border-subtle bg-ds-surface2 p-3">
                <p className="text-[11px] font-medium text-ds-secondary">Total Projects</p>
                <p className="mt-1 text-xl font-semibold text-ds-ink tabular-nums">
                  {projects.length}
                </p>
              </div>

              <div className="rounded-ds border border-ds-border-subtle bg-ds-surface2 p-3">
                <p className="text-[11px] font-medium text-ds-secondary">Ingested Datasets</p>
                <p className="mt-1 text-xl font-semibold text-ds-ink tabular-nums">
                  {totalDatasetsAcrossProjects}
                </p>
              </div>

              <div className="rounded-ds border border-ds-border-subtle bg-ds-surface2 p-3">
                <p className="text-[11px] font-medium text-ds-secondary">Analytics Ready</p>
                <p className="mt-1 text-xl font-semibold text-ds-ink tabular-nums">
                  {readyProjectsCount} / {projects.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-secondary">
                Workspace Breakdown
              </h2>
              <Database className="h-3.5 w-3.5 text-ds-subtle" />
            </div>

            {projects.length === 0 ? (
              <p className="text-xs text-ds-secondary">No projects created yet.</p>
            ) : (
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-ds-secondary">With datasets</dt>
                  <dd className="font-semibold text-ds-success tabular-nums">
                    {readyProjectsCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ds-secondary">Pending ingestion</dt>
                  <dd className="font-semibold text-ds-ink tabular-nums">
                    {projects.length - readyProjectsCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-ds-border-subtle pt-2">
                  <dt className="text-ds-secondary">Showing</dt>
                  <dd className="font-semibold text-ds-ink tabular-nums">
                    {filteredProjects.length} of {projects.length}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </aside>
      </div>

      {/* Create Project Modal */}
      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Project"
        size="sm"
      >
        {formError && (
          <div className="mb-3 rounded-ds border border-[var(--ds-error-border)] bg-ds-error-soft p-2.5 text-xs text-ds-error">
            {formError}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project name *"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Q4 Revenue Analysis"
          />

          <div className="space-y-1.5">
            <label htmlFor="create-proj-desc" className="block text-xs font-medium text-ds-ink">
              Description
            </label>
            <textarea
              id="create-proj-desc"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="What analytical questions will this project investigate?"
              className="w-full rounded-ds border border-ds-border bg-ds-surface px-3 py-2 text-[13px] text-ds-ink placeholder:text-ds-subtle focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        open={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
        title="Edit Project"
        size="sm"
      >
        {formError && (
          <div className="mb-3 rounded-ds border border-[var(--ds-error-border)] bg-ds-error-soft p-2.5 text-xs text-ds-error">
            {formError}
          </div>
        )}
        <form onSubmit={handleUpdate} className="space-y-4">
          <Input
            label="Project name *"
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />

          <div className="space-y-1.5">
            <label htmlFor="edit-proj-desc" className="block text-xs font-medium text-ds-ink">
              Description
            </label>
            <textarea
              id="edit-proj-desc"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              className="w-full rounded-ds border border-ds-border bg-ds-surface px-3 py-2 text-[13px] text-ds-ink placeholder:text-ds-subtle focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditingProject(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(archivingProject)}
        title="Archive Project?"
        description={`Are you sure you want to archive "${archivingProject?.name}"? It will be soft-archived and hidden from standard views.`}
        confirmLabel="Archive Project"
        variant="danger"
        loading={isSubmitting}
        onConfirm={() => void handleArchive()}
        onCancel={() => setArchivingProject(null)}
      />
    </div>
  )
}
