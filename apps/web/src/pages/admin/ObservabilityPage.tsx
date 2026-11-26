import { useCallback, useEffect, useState } from 'react'
import { Activity, Cpu, Database, RefreshCw, Server, ShieldAlert } from 'lucide-react'
import {
  Button,
  ErrorState,
  PageHeader,
  StatCard,
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
import type { AdminObservabilityResponse } from '@/types'

export function ObservabilityPage() {
  const { currentOrg } = useAuthStore()
  const [data, setData] = useState<AdminObservabilityResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiService.system.getAdminObservability(currentOrg?.organization_id)
      setData(res)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError('Unable to load operational telemetry.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [currentOrg?.organization_id])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      <PageHeader
        title="Operational Observability"
        description="Live dependency health, SQLAlchemy connection pool status, rate limits, and recent safe error telemetry."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadSnapshot()}
            disabled={isLoading}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh Snapshot
          </Button>
        }
      />

      {error && (
        <ErrorState title="Unable to load operational telemetry" message={error} onRetry={loadSnapshot} />
      )}

      {data && (
        <>
          {/* Dependency Health */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="PostgreSQL / DB"
              value={data.dependencies.database}
              description={`Dialect: ${data.database_pool.dialect}${
                typeof data.database_pool.pool_size === 'number'
                  ? ` · Pool ${data.database_pool.checked_out ?? 0}/${data.database_pool.pool_size}`
                  : ''
              }`}
              icon={Database}
              accentTone="primary"
            />
            <StatCard
              label="DuckDB Sandbox"
              value={data.dependencies.duckdb}
              description={`Queries: ${data.metrics.query_executions} (${data.metrics.query_failures} failed)`}
              icon={Server}
              accentTone="teal"
            />
            <StatCard
              label="Artifact Storage"
              value={data.dependencies.storage}
              description={`Ingestion failures: ${data.metrics.ingestion_failures}`}
              icon={Activity}
              accentTone="primary"
            />
            <StatCard
              label="Gemini AI Provider"
              value={data.dependencies.ai_configured ? 'Configured' : 'Unconfigured'}
              description={`Model: ${data.dependencies.ai_model} · Errors: ${data.metrics.gemini_errors}`}
              icon={Cpu}
              accentTone="neutral"
            />
          </section>

          {/* HTTP & Rate Limiting */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                HTTP Requests
              </span>
              <p className="mt-1.5 text-2xl font-semibold text-ds-ink tabular-nums">
                {data.metrics.total_http_requests.toLocaleString()}
              </p>
              <p className="mt-1 font-mono text-xs text-ds-secondary tabular-nums">
                Avg latency: {data.metrics.avg_http_latency_ms} ms
              </p>
            </div>

            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                HTTP 5xx Errors
              </span>
              <p className="mt-1.5 text-2xl font-semibold text-ds-ink tabular-nums">
                {data.metrics.http_5xx_errors}
              </p>
              <p className="mt-1 text-xs text-ds-secondary">Environment: {data.environment}</p>
            </div>

            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
                Rate-Limit Rejections
              </span>
              <p className="mt-1.5 text-2xl font-semibold text-ds-ink tabular-nums">
                {data.metrics.rate_limit_rejections}
              </p>
              <p className="mt-1 text-xs text-ds-secondary">
                Shutting down: {data.shutting_down ? 'Yes' : 'No'}
              </p>
            </div>
          </section>

          {/* Background Job & Agent Queues */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
                Multi-Agent Runs by Status
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(data.agent_runs_by_status).length === 0 ? (
                  <p className="col-span-2 text-ds-secondary">No workflow runs recorded yet.</p>
                ) : (
                  Object.entries(data.agent_runs_by_status).map(([st, count]) => (
                    <div
                      key={st}
                      className="flex items-center justify-between rounded-ds-sm bg-ds-surface2 px-3 py-2"
                    >
                      <dt className="capitalize text-ds-secondary">{st.replace(/_/g, ' ')}</dt>
                      <dd className="font-mono font-semibold text-ds-ink tabular-nums">{count}</dd>
                    </div>
                  ))
                )}
              </dl>
            </div>

            <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
                Ingestion Jobs by Status
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(data.ingestion_jobs_by_status).length === 0 ? (
                  <p className="col-span-2 text-ds-secondary">No ingestion jobs recorded yet.</p>
                ) : (
                  Object.entries(data.ingestion_jobs_by_status).map(([st, count]) => (
                    <div
                      key={st}
                      className="flex items-center justify-between rounded-ds-sm bg-ds-surface2 px-3 py-2"
                    >
                      <dt className="capitalize text-ds-secondary">{st.replace(/_/g, ' ')}</dt>
                      <dd className="font-mono font-semibold text-ds-ink tabular-nums">{count}</dd>
                    </div>
                  ))
                )}
              </dl>
            </div>
          </section>

          {/* Recent Failures */}
          <section className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-ds-warning" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
                Recent Safe Error Log
              </h2>
            </div>
            {data.metrics.recent_errors.length === 0 ? (
              <p className="mt-2 text-xs text-ds-secondary">
                No server errors captured in this process.
              </p>
            ) : (
              <div className="mt-3">
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Timestamp</TableHeaderCell>
                        <TableHeaderCell>Route</TableHeaderCell>
                        <TableHeaderCell>Type</TableHeaderCell>
                        <TableHeaderCell>Summary</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody className="text-xs">
                      {data.metrics.recent_errors.map((errItem, idx) => (
                        <TableRow key={`${errItem.request_id}-${idx}`}>
                          <TableCell className="whitespace-nowrap font-mono text-ds-subtle tabular-nums">
                            {new Date(errItem.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-ds-ink">
                            {errItem.route}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone="error">{errItem.code}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-ds-secondary">{errItem.detail}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
