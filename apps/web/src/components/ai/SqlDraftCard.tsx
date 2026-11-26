import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  ShieldCheck,
  Table as TableIcon,
  XCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { QueryChartViewer } from '@/components/analytics/QueryChartViewer'
import { QueryResultsTable } from '@/components/analytics/QueryResultsTable'
import { Button, StatusBadge } from '@/components/ui'
import { ApiError, apiService } from '@/services/api'
import type { AIVisualizationRecommendation, QueryExecutionResponse } from '@/types'

interface SqlDraftCardProps {
  sql: string
  explanation?: string | null
  validationStatus?: 'valid' | 'repaired' | 'invalid' | null
  visualizationRecommendation?: AIVisualizationRecommendation | null
  projectId: string
  selectedDatasetIds: string[]
}

const SQL_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'ON',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'GROUP',
  'BY',
  'ORDER',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'ASC',
  'DESC',
  'DISTINCT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WITH',
  'UNION',
  'ALL',
  'OVER',
  'PARTITION',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'CAST',
  'FILTER',
])

const SQL_FUNCTIONS = new Set([
  'SUM',
  'AVG',
  'COUNT',
  'MIN',
  'MAX',
  'COALESCE',
  'NULLIF',
  'ROUND',
  'FLOOR',
  'CEIL',
  'ABS',
  'DATE_TRUNC',
  'DATE_PART',
  'EXTRACT',
  'STRFTIME',
  'LOWER',
  'UPPER',
  'TRIM',
  'LENGTH',
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'LAG',
  'LEAD',
])

const TOKEN_REGEX =
  /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g

function renderHighlightedSql(sql: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  TOKEN_REGEX.lastIndex = 0
  while ((match = TOKEN_REGEX.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      parts.push(sql.slice(lastIndex, match.index))
    }

    const token = match[0]
    const upper = token.toUpperCase()
    let className: string | undefined

    if (token.startsWith('--') || token.startsWith('/*')) {
      className = 'text-slate-500 italic'
    } else if (token.startsWith("'")) {
      className = 'text-emerald-300'
    } else if (/^\d/.test(token)) {
      className = 'text-amber-300'
    } else if (SQL_KEYWORDS.has(upper)) {
      className = 'text-sky-400 font-semibold'
    } else if (SQL_FUNCTIONS.has(upper)) {
      className = 'text-cyan-300'
    }

    if (className) {
      parts.push(
        <span key={`${match.index}-${token}`} className={className}>
          {token}
        </span>,
      )
    } else {
      parts.push(token)
    }

    lastIndex = TOKEN_REGEX.lastIndex
  }

  if (lastIndex < sql.length) {
    parts.push(sql.slice(lastIndex))
  }

  return parts
}

export const SqlDraftCard: React.FC<SqlDraftCardProps> = ({
  sql,
  explanation,
  validationStatus = 'valid',
  visualizationRecommendation,
  projectId,
  selectedDatasetIds,
}) => {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [revalidatedAt, setRevalidatedAt] = useState<string | null>(null)
  const [executionResult, setExecutionResult] = useState<QueryExecutionResponse | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'results' | 'chart'>('results')

  const highlightedNodes = useMemo(() => renderHighlightedSql(sql), [sql])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  }

  const handleOpenInStudio = () => {
    navigate(`/projects/${projectId}/analytics`, { state: { preloadedSql: sql } })
  }

  const handleRunQuery = async () => {
    setIsExecuting(true)
    setExecutionError(null)
    try {
      if (typeof apiService.analytics.validate === 'function') {
        const validation = await apiService.analytics.validate(projectId, {
          sql,
          dataset_ids: selectedDatasetIds,
        })
        if (validation) {
          setRevalidatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
          if (!validation.is_valid) {
            setExecutionError(
              validation.error || 'SQL validation failed. Review the query before running.',
            )
            return
          }
        }
      }

      const res = await apiService.analytics.execute(projectId, {
        sql,
        dataset_ids: selectedDatasetIds,
        limit: 100,
      })
      setExecutionResult(res)
      setActiveTab('results')
    } catch (err: unknown) {
      setExecutionError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Failed to execute query',
      )
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface shadow-xs">
      {/* Dark IDE Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] px-3.5 py-2 text-[var(--ds-text-on-dark)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-slate-300">
            Generated SQL Draft
          </span>

          {validationStatus === 'valid' && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-800/80 bg-emerald-950/90 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              <span>Validated (DuckDB)</span>
            </span>
          )}
          {validationStatus === 'repaired' && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-800/80 bg-amber-950/90 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              <span>Repaired &amp; Validated</span>
            </span>
          )}
          {validationStatus === 'invalid' && (
            <span className="inline-flex items-center gap-1 rounded border border-rose-800/80 bg-rose-950/90 px-2 py-0.5 text-[10px] font-medium text-rose-300">
              <XCircle className="h-3 w-3" />
              <span>Validation Warning</span>
            </span>
          )}

          {revalidatedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Revalidated {revalidatedAt}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy SQL"
            aria-label="Copy SQL"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleOpenInStudio}
            title="Open in SQL Studio"
            aria-label="Open in SQL Studio"
            className="rounded p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Syntax-Highlighted SQL Block */}
      <div className="relative overflow-x-auto border-b border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] px-4 py-3 font-mono text-xs leading-relaxed text-[var(--ds-text-on-dark)]">
        <pre aria-hidden="true" className="m-0 whitespace-pre">
          {highlightedNodes}
        </pre>
        <pre className="sr-only">{sql}</pre>
      </div>

      {/* Explanation & Explicit Run Bar */}
      <div className="flex flex-col justify-between gap-3 border-b border-ds-border bg-ds-surface2 px-3.5 py-2.5 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-ds-secondary">
          {explanation ||
            'Review this proposed DuckDB SQL draft. Click Run Query to revalidate and execute it on your workspace data.'}
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleOpenInStudio}
            leftIcon={<ExternalLink className="h-3 w-3" />}
          >
            Open in SQL Editor
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleRunQuery}
            disabled={isExecuting}
            leftIcon={
              isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )
            }
          >
            {isExecuting ? 'Running...' : 'Run Query'}
          </Button>
        </div>
      </div>

      {/* Execution / Validation Error Banner */}
      {executionError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-ds-error-border bg-ds-error-soft px-3.5 py-2.5 text-xs text-ds-error"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{executionError}</span>
        </div>
      )}

      {/* Results Area */}
      {executionResult && (
        <div className="bg-ds-surface p-3">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-ds-border-subtle pb-2">
            <div className="flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface2 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('results')}
                className={[
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  activeTab === 'results'
                    ? 'bg-ds-surface text-ds-ink shadow-xs'
                    : 'text-ds-secondary hover:text-ds-ink',
                ].join(' ')}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Table View ({executionResult.row_count} rows)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chart')}
                className={[
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  activeTab === 'chart'
                    ? 'bg-ds-surface text-ds-ink shadow-xs'
                    : 'text-ds-secondary hover:text-ds-ink',
                ].join(' ')}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Chart View</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-ds-secondary tabular-nums">
              <StatusBadge tone="neutral">{executionResult.columns.length} columns</StatusBadge>
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3 text-ds-subtle" />
                {executionResult.execution_time_ms} ms
              </span>
            </div>
          </div>

          {activeTab === 'results' ? (
            <div className="max-h-72 overflow-auto rounded-ds-sm border border-ds-border">
              <QueryResultsTable
                columns={executionResult.columns}
                rows={executionResult.rows}
                rowCount={executionResult.row_count}
                executionTimeMs={executionResult.execution_time_ms}
                truncated={executionResult.truncated}
              />
            </div>
          ) : (
            <div className="rounded-ds-sm border border-ds-border">
              <QueryChartViewer
                columns={executionResult.columns}
                rows={executionResult.rows}
                initialChartType={visualizationRecommendation?.chart_type}
                initialXAxis={visualizationRecommendation?.x_axis}
                initialYAxis={visualizationRecommendation?.y_axis}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
