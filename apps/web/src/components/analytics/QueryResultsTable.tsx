import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui'
import type { QueryColumn } from '@/types'

interface QueryResultsTableProps {
  columns: QueryColumn[]
  rows: (string | number | boolean | null)[][]
  rowCount: number
  executionTimeMs: number
  truncated: boolean
}

const PAGE_SIZE = 50

export function QueryResultsTable({
  columns,
  rows,
  rowCount,
  executionTimeMs,
  truncated,
}: QueryResultsTableProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [copied, setCopied] = useState(false)

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [rows, currentPage])

  const handleExportCsv = () => {
    if (!columns.length || !rows.length) return

    const escapeCsv = (val: unknown) => {
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const header = columns.map((c) => escapeCsv(c.name)).join(',')
    const dataRows = rows.map((r) => r.map((c) => escapeCsv(c)).join(','))
    const csvContent = [header, ...dataRows].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `query_results_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    if (!columns.length || !rows.length) return
    const text = [
      columns.map((c) => c.name).join('\t'),
      ...rows.map((r) => r.map((c) => (c === null ? 'NULL' : String(c))).join('\t')),
    ].join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (columns.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center p-6 text-center text-ds-secondary">
        <Database className="mb-2 h-7 w-7 text-ds-subtle" />
        <p className="text-xs font-medium text-ds-ink">No query results yet</p>
        <p className="mt-0.5 text-[11px] text-ds-secondary">
          Execute a SQL statement above to inspect tabular results in DuckDB.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-ds-surface select-text">
      {/* Execution Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border-subtle bg-ds-surface2 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-ds-ink tabular-nums">
            {`${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}`}
          </span>
          <span className="text-ds-border-strong">|</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ds-secondary tabular-nums">
            <Clock className="h-3 w-3 text-ds-subtle" />
            {`${executionTimeMs} ms`}
          </span>
          {truncated && (
            <StatusBadge
              tone="warning"
              icon={<AlertTriangle className="h-3 w-3" />}
            >
              Capped at max result rows
            </StatusBadge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1 text-[11px] font-medium text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
            title="Copy all rows to clipboard (TSV)"
          >
            {copied ? (
              <Check className="h-3 w-3 text-ds-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1 text-[11px] font-medium text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
            title="Export results to CSV"
          >
            <Download className="h-3 w-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Scrollable Data Grid */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-left font-mono text-xs">
          <thead className="sticky top-0 z-10 border-b border-ds-border bg-ds-surface2 text-ds-secondary">
            <tr>
              <th className="w-12 px-3 py-2 text-center font-sans text-[10px] font-normal text-ds-subtle">
                #
              </th>
              {columns.map((col) => (
                <th key={col.name} className="whitespace-nowrap px-3 py-2 font-semibold text-ds-ink">
                  <div>{col.name}</div>
                  <div className="font-sans text-[9px] font-normal uppercase text-ds-subtle">
                    {col.type}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-border-subtle bg-ds-surface">
            {paginatedRows.map((row, rowIdx) => {
              const rowNumber = (currentPage - 1) * PAGE_SIZE + rowIdx + 1
              return (
                <tr key={rowIdx} className="transition-colors hover:bg-ds-primary-soft/35">
                  <td className="w-12 select-none px-3 py-1.5 text-center font-sans text-[10px] text-ds-subtle tabular-nums">
                    {rowNumber}
                  </td>
                  {row.map((val, colIdx) => (
                    <td
                      key={colIdx}
                      className="max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-ds-ink"
                    >
                      {val === null || val === undefined ? (
                        <span className="select-none italic text-ds-subtle">null</span>
                      ) : typeof val === 'boolean' ? (
                        <span className={val ? 'font-semibold text-ds-success' : 'text-ds-secondary'}>
                          {String(val)}
                        </span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex select-none items-center justify-between border-t border-ds-border-subtle bg-ds-surface2 px-4 py-2 text-xs text-ds-secondary">
          <span className="tabular-nums">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length} rows
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous results page"
              className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-muted disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-sans text-[11px] font-medium tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next results page"
              className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-muted disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
