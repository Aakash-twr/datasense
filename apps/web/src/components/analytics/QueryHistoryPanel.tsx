import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  Loader2,
  Play,
  Search,
  Trash2,
  User as UserIcon,
  XCircle,
} from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import {
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'
import type { QueryRunResponse } from '@/types'

interface QueryHistoryPanelProps {
  history: QueryRunResponse[]
  onRerun: (sql: string) => void
  onExecuteAgain?: (sql: string) => void
  onDelete: (id: string) => void
  isLoading?: boolean
}

type HistoryStatusFilter = 'all' | 'success' | 'failed' | 'cancelled'

export function QueryHistoryPanel({
  history,
  onRerun,
  onExecuteAgain,
  onDelete,
  isLoading = false,
}: QueryHistoryPanelProps) {
  const { user } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all')

  const filteredHistory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return history.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      if (!q) return true
      return (
        run.sql_query.toLowerCase().includes(q) ||
        (run.error_summary && run.error_summary.toLowerCase().includes(q))
      )
    })
  }, [history, searchTerm, statusFilter])

  const resolveUser = (userId: string) => {
    if (user?.id === userId) return user.name
    return `User ${userId.slice(0, 6)}`
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ds-primary" />
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Clock}
          title="No query history yet"
          description="SQL statements executed in this project appear here with duration, row counts, and status."
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ds-subtle" />
          <input
            type="text"
            aria-label="Search query history"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search SQL queries or errors..."
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-2.5 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', 'All'],
              ['success', 'Success'],
              ['failed', 'Failed'],
              ['cancelled', 'Timed Out'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={[
                'rounded-ds-sm px-2.5 py-1 text-[11px] font-medium transition-colors',
                statusFilter === key
                  ? 'bg-ds-primary text-white'
                  : 'border border-ds-border bg-ds-surface text-ds-secondary hover:text-ds-ink',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* SQL Activity Table */}
      {filteredHistory.length === 0 ? (
        <div className="rounded-ds-md border border-ds-border bg-ds-surface py-8 text-center text-xs text-ds-secondary">
          No query runs match your search or filter criteria.
        </div>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Query Preview</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Duration</TableHeaderCell>
                <TableHeaderCell className="text-right">Rows</TableHeaderCell>
                <TableHeaderCell>User</TableHeaderCell>
                <TableHeaderCell>Executed</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="text-xs">
              {filteredHistory.map((run) => {
                const isSuccess = run.status === 'success'
                const isFailed = run.status === 'failed'
                const isCancelled = run.status === 'cancelled'

                return (
                  <TableRow key={run.id} interactive>
                    <TableCell className="max-w-md">
                      <code className="block truncate rounded bg-ds-surface2 px-2 py-1 font-mono text-[11px] text-ds-ink">
                        {run.sql_query}
                      </code>
                      {run.error_summary && (
                        <p className="mt-1 truncate font-mono text-[10px] text-ds-error">
                          {run.error_summary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuccess && (
                        <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                          Success
                        </StatusBadge>
                      )}
                      {isFailed && (
                        <StatusBadge tone="error" icon={<AlertCircle className="h-3 w-3" />}>
                          Failed
                        </StatusBadge>
                      )}
                      {isCancelled && (
                        <StatusBadge tone="warning" icon={<XCircle className="h-3 w-3" />}>
                          Timed Out
                        </StatusBadge>
                      )}
                      {!isSuccess && !isFailed && !isCancelled && (
                        <StatusBadge tone="neutral">{run.status}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-ds-secondary tabular-nums">
                      {run.execution_time_ms !== null && run.execution_time_ms !== undefined
                        ? `${run.execution_time_ms} ms`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-ds-secondary tabular-nums">
                      {run.returned_row_count !== null && run.returned_row_count !== undefined
                        ? run.returned_row_count.toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-[11px] text-ds-secondary">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3 w-3 text-ds-subtle" />
                        {resolveUser(run.user_id)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[11px] text-ds-subtle tabular-nums">
                      {new Date(run.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onRerun(run.sql_query)}
                          className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2 py-1 text-[11px] font-medium text-ds-ink transition-colors hover:bg-ds-surface2"
                          title="Load query in editor"
                        >
                          <Code2 className="h-3 w-3" />
                          <span>Open Query</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => (onExecuteAgain ? onExecuteAgain(run.sql_query) : onRerun(run.sql_query))}
                          className="inline-flex items-center gap-1 rounded-ds-sm bg-ds-primary px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-ds-primary-hover"
                          title="Run query again"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Run Again</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(run.id)}
                          aria-label="Delete query record"
                          className="rounded-ds-sm p-1 text-ds-subtle transition-colors hover:bg-ds-error-soft hover:text-ds-error"
                          title="Delete query record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
  )
}
