import { useMemo, useState } from 'react'
import { Bookmark, Code2, Loader2, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import {
  Button,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui'
import type { SavedQueryCreate, SavedQueryResponse, SavedQueryUpdate } from '@/types'

interface SavedQueriesPanelProps {
  savedQueries: SavedQueryResponse[]
  projectName?: string
  defaultSql?: string
  onSelectQuery: (query: SavedQueryResponse) => void
  onRunQuery: (query: SavedQueryResponse) => void
  onCreateQuery?: (data: Pick<SavedQueryCreate, 'name' | 'description' | 'sql_query'>) => Promise<void>
  onUpdateQuery?: (id: string, data: SavedQueryUpdate) => Promise<void>
  onDelete: (id: string) => void
  isLoading?: boolean
}

export function SavedQueriesPanel({
  savedQueries,
  projectName = 'Active Project',
  defaultSql = '',
  onSelectQuery,
  onRunQuery,
  onCreateQuery,
  onUpdateQuery,
  onDelete,
  isLoading = false,
}: SavedQueriesPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [editingQuery, setEditingQuery] = useState<SavedQueryResponse | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formSql, setFormSql] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredQueries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return savedQueries
    return savedQueries.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.sql_query.toLowerCase().includes(q),
    )
  }, [savedQueries, searchTerm])

  const openCreateModal = () => {
    setEditingQuery(null)
    setIsCreating(true)
    setFormName('')
    setFormDesc('')
    setFormSql(defaultSql)
    setFormError(null)
  }

  const openEditModal = (query: SavedQueryResponse) => {
    setIsCreating(false)
    setEditingQuery(query)
    setFormName(query.name)
    setFormDesc(query.description || '')
    setFormSql(query.sql_query)
    setFormError(null)
  }

  const closeModal = () => {
    setIsCreating(false)
    setEditingQuery(null)
    setFormError(null)
  }

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError('Query name is required.')
      return
    }
    if (!formSql.trim()) {
      setFormError('SQL query text is required.')
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      if (editingQuery && onUpdateQuery) {
        await onUpdateQuery(editingQuery.id, {
          name: formName.trim(),
          description: formDesc.trim() || null,
          sql_query: formSql.trim(),
        })
      } else if (isCreating && onCreateQuery) {
        await onCreateQuery({
          name: formName.trim(),
          description: formDesc.trim() || null,
          sql_query: formSql.trim(),
        })
      }
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save query.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ds-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ds-subtle" />
          <input
            type="text"
            aria-label="Search saved queries"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search saved queries..."
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-2.5 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
          />
        </div>

        {onCreateQuery && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            New Saved Query
          </Button>
        )}
      </div>

      {savedQueries.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved queries yet"
          description="Save reusable analytical SQL queries for quick execution and team reference."
        />
      ) : filteredQueries.length === 0 ? (
        <div className="rounded-ds-md border border-ds-border bg-ds-surface py-8 text-center text-xs text-ds-secondary">
          No saved queries match &ldquo;{searchTerm}&rdquo;.
        </div>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Query Name &amp; Description</TableHeaderCell>
                <TableHeaderCell>SQL Preview</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Last Updated</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="text-xs">
              {filteredQueries.map((query) => (
                <TableRow key={query.id} interactive>
                  <TableCell className="max-w-xs">
                    <div className="font-semibold text-ds-ink">{query.name}</div>
                    {query.description && (
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-ds-secondary">
                        {query.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <code className="block truncate rounded bg-ds-surface2 px-2 py-1 font-mono text-[11px] text-ds-ink">
                      {query.sql_query}
                    </code>
                  </TableCell>
                  <TableCell className="text-[11px] text-ds-secondary">{projectName}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[11px] text-ds-subtle tabular-nums">
                    {new Date(query.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectQuery(query)}
                        className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1 text-[11px] font-medium text-ds-ink transition-colors hover:bg-ds-surface2"
                        title="Load into editor"
                      >
                        <Code2 className="h-3 w-3" />
                        <span>Open in Editor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRunQuery(query)}
                        className="inline-flex items-center gap-1 rounded-ds-sm bg-ds-primary px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-ds-primary-hover"
                        title="Load and execute query"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Run</span>
                      </button>
                      {onUpdateQuery && (
                        <button
                          type="button"
                          onClick={() => openEditModal(query)}
                          aria-label={`Edit saved query ${query.name}`}
                          className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
                          title="Edit saved query"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(query.id)}
                        aria-label={`Delete saved query ${query.name}`}
                        className="rounded-ds-sm p-1 text-ds-subtle transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                        title="Delete saved query"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit Saved Query Modal */}
      <Modal
        open={isCreating || Boolean(editingQuery)}
        onClose={closeModal}
        title={editingQuery ? 'Edit Saved Query' : 'Create Saved Query'}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="saved-query-crud-form"
              variant="primary"
              size="sm"
              loading={isSubmitting}
            >
              {editingQuery ? 'Save Changes' : 'Create Saved Query'}
            </Button>
          </>
        }
      >
        <form id="saved-query-crud-form" onSubmit={handleSaveForm} className="space-y-3 text-xs">
          {formError && (
            <div className="rounded-ds-sm border border-[var(--ds-error-border)] bg-ds-error-soft px-3 py-2 text-ds-error">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1 block font-medium text-ds-ink">Query Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Monthly Active Revenue"
              className="w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-ds-ink">Description</label>
            <input
              type="text"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Optional description of query purpose"
              className="w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-1.5 text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-ds-ink">SQL Statement</label>
            <textarea
              rows={5}
              value={formSql}
              onChange={(e) => setFormSql(e.target.value)}
              placeholder="SELECT * FROM ..."
              className="w-full rounded-ds-sm border border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] p-3 font-mono text-xs text-[var(--ds-text-on-dark)] focus:border-ds-primary focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
