import React, { useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Lightbulb,
  Link2,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
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
import type { AgentRunResultsResponse } from '@/types'

interface AgentFindingsPanelProps {
  results: AgentRunResultsResponse
}

type FindingTab = 'insights' | 'statistics' | 'quality' | 'discovery' | 'visualizations'

function getSeverityTone(sev: string): 'error' | 'warning' | 'primary' | 'neutral' {
  switch (sev.toLowerCase()) {
    case 'high':
    case 'critical':
      return 'error'
    case 'medium':
    case 'warning':
      return 'warning'
    case 'low':
      return 'primary'
    default:
      return 'neutral'
  }
}

export const AgentFindingsPanel: React.FC<AgentFindingsPanelProps> = ({ results }) => {
  const [activeTab, setActiveTab] = useState<FindingTab>('insights')

  const tabs: {
    id: FindingTab
    label: string
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    {
      id: 'insights',
      label: `Insights (${results.insights?.findings.length || 0})`,
      icon: Lightbulb,
    },
    {
      id: 'statistics',
      label: `Statistics (${results.statistical_analysis?.metrics.length || 0})`,
      icon: TrendingUp,
    },
    {
      id: 'quality',
      label: `Data Quality (${results.data_quality?.total_issues || 0})`,
      icon: ShieldAlert,
    },
    {
      id: 'discovery',
      label: `Discovery (${results.discovery?.relevant_tables.length || 0})`,
      icon: Database,
    },
    {
      id: 'visualizations',
      label: `Visualization Recommendations (${results.visualizations?.charts.length || 0})`,
      icon: BarChart3,
    },
  ]

  return (
    <section
      aria-label="Agent findings"
      className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
    >
      {/* Tabs Bar */}
      <div className="flex flex-wrap gap-1 border-b border-ds-border bg-ds-surface2 px-3 pt-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
                active
                  ? 'rounded-t-ds-sm border-ds-primary bg-ds-surface text-ds-primary'
                  : 'border-transparent text-ds-secondary hover:text-ds-ink',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Body */}
      <div className="space-y-4 p-4">
        {activeTab === 'insights' && (
          <div className="space-y-3">
            {!results.insights ? (
              <p className="py-6 text-center text-xs text-ds-secondary">
                No insight synthesis recorded for this workflow yet.
              </p>
            ) : (
              <>
                <div className="rounded-ds-md border border-ds-primary/25 bg-ds-primary-soft/60 p-3.5 text-xs text-ds-ink">
                  <strong className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ds-primary">
                    Executive Takeaway
                  </strong>
                  <p className="leading-relaxed">{results.insights.executive_takeaway}</p>
                </div>

                {results.insights.findings.map((f, idx) => (
                  <div
                    key={idx}
                    className="space-y-1.5 rounded-ds-md border border-ds-border bg-ds-surface p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ds-ink">{f.title}</span>
                      <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                        Evidence-Backed
                      </StatusBadge>
                    </div>
                    <p className="text-xs leading-relaxed text-ds-secondary">{f.summary}</p>
                    {f.recommended_follow_up && (
                      <p className="text-[11px] font-medium text-ds-primary">
                        Next step: {f.recommended_follow_up}
                      </p>
                    )}
                    {f.evidence_references.length > 0 && (
                      <p className="font-mono text-[10px] text-ds-subtle">
                        Sources: {f.evidence_references.join(', ')}
                      </p>
                    )}
                  </div>
                ))}

                {results.insights.hypotheses.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ds-warning">
                      Labeled Hypotheses (Unverified Drivers)
                    </h4>
                    {results.insights.hypotheses.map((h, idx) => (
                      <div
                        key={idx}
                        className="rounded-ds-md border border-[var(--ds-warning-border)] bg-ds-warning-soft/50 p-3 text-xs"
                      >
                        <strong className="block text-ds-ink">{h.title}</strong>
                        <p className="mt-0.5 text-ds-secondary">{h.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="space-y-4">
            {!results.statistical_analysis ? (
              <p className="py-6 text-center text-xs text-ds-secondary">
                Deterministic statistical metrics appear after approved SQL queries execute.
              </p>
            ) : (
              <>
                <p className="text-xs text-ds-secondary">{results.statistical_analysis.summary}</p>

                {results.statistical_analysis.metrics.length > 0 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Metric</TableHeaderCell>
                          <TableHeaderCell className="text-right">Sum</TableHeaderCell>
                          <TableHeaderCell className="text-right">Mean</TableHeaderCell>
                          <TableHeaderCell className="text-right">Median</TableHeaderCell>
                          <TableHeaderCell className="text-right">Min / Max</TableHeaderCell>
                          <TableHeaderCell className="text-right">Std Dev</TableHeaderCell>
                          <TableHeaderCell>Evidence</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody className="text-xs">
                        {results.statistical_analysis.metrics.map((m, i) => (
                          <TableRow key={i} interactive>
                            <TableCell className="font-semibold text-ds-ink">
                              <div>{m.metric_name}</div>
                              {m.period_comparison && (
                                <span className="text-[11px] font-normal text-ds-primary">
                                  {m.period_comparison}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {m.sum_value?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {m.mean?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {m.median?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-ds-secondary">
                              {m.min_value?.toLocaleString() ?? '—'} /{' '}
                              {m.max_value?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {m.std_dev?.toLocaleString() ?? '—'}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-ds-subtle">
                              {m.evidence_reference}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {results.statistical_analysis.anomalies.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ds-error">
                      Statistical Anomaly Indicators (IQR / Z-Score)
                    </h4>
                    {results.statistical_analysis.anomalies.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-ds-md border border-[var(--ds-error-border)] bg-ds-error-soft p-3 text-xs"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ds-error" />
                        <div>
                          <span className="font-semibold text-ds-ink">
                            {a.metric_name} ({a.method.toUpperCase()}): {a.label} ={' '}
                            {a.observed_value}
                          </span>
                          <p className="mt-0.5 text-ds-secondary">{a.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="space-y-3">
            {!results.data_quality ? (
              <p className="py-6 text-center text-xs text-ds-secondary">
                No data quality audit ran for this workflow.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-ds-md border border-ds-border bg-ds-surface2 p-3 text-xs">
                  <span className="text-ds-ink">{results.data_quality.summary}</span>
                  <StatusBadge tone={getSeverityTone(results.data_quality.overall_health)}>
                    {results.data_quality.overall_health}
                  </StatusBadge>
                </div>

                {results.data_quality.findings.map((qf, idx) => (
                  <div
                    key={idx}
                    className="space-y-1 rounded-ds-md border border-ds-border bg-ds-surface p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ds-ink">
                        {qf.title}{' '}
                        <span className="font-mono text-[11px] font-normal text-ds-secondary">
                          ({qf.affected_table}
                          {qf.affected_column ? `.${qf.affected_column}` : ''})
                        </span>
                      </span>
                      <StatusBadge tone={getSeverityTone(qf.severity)}>{qf.severity}</StatusBadge>
                    </div>
                    <p className="text-ds-secondary">{qf.description}</p>
                    <p className="font-mono text-[11px] text-ds-subtle">Evidence: {qf.evidence}</p>
                    <p className="text-[11px] font-medium text-ds-primary">
                      Action: {qf.recommended_action}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'discovery' && (
          <div className="space-y-3">
            {!results.discovery ? (
              <p className="py-6 text-center text-xs text-ds-secondary">
                No schema discovery output recorded for this workflow.
              </p>
            ) : (
              <>
                <p className="text-xs text-ds-secondary">{results.discovery.sufficiency_reason}</p>
                {results.discovery.relevant_tables.length > 0 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Table</TableHeaderCell>
                          <TableHeaderCell className="text-right">Rows</TableHeaderCell>
                          <TableHeaderCell>Measures</TableHeaderCell>
                          <TableHeaderCell>Dimensions</TableHeaderCell>
                          <TableHeaderCell>PII Columns</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody className="text-xs">
                        {results.discovery.relevant_tables.map((tbl, i) => (
                          <TableRow key={i} interactive>
                            <TableCell className="font-mono font-semibold text-ds-ink">
                              {tbl.qualified_name}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {tbl.row_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-ds-secondary">
                              {tbl.measures.join(', ') || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] text-ds-secondary">
                              {tbl.dimensions.join(', ') || '—'}
                            </TableCell>
                            <TableCell>
                              {tbl.pii_columns.length > 0 ? (
                                <StatusBadge tone="warning">
                                  {tbl.pii_columns.join(', ')}
                                </StatusBadge>
                              ) : (
                                <span className="text-ds-subtle">None</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {results.discovery.relationships.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ds-subtle">
                      Candidate Relationships
                    </h4>
                    {results.discovery.relationships.map((rel, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-ds-md border border-ds-border bg-ds-surface2 p-2.5 text-xs"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-ds-primary" />
                        <span className="text-ds-ink">
                          <code className="font-mono text-[11px]">
                            {rel.left_table}.{rel.left_column}
                          </code>{' '}
                          ↔{' '}
                          <code className="font-mono text-[11px]">
                            {rel.right_table}.{rel.right_column}
                          </code>{' '}
                          <StatusBadge tone={rel.relationship_type === 'verified' ? 'success' : 'warning'}>
                            {rel.relationship_type}
                          </StatusBadge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'visualizations' && (
          <div className="space-y-3">
            {!results.visualizations || results.visualizations.charts.length === 0 ? (
              <p className="py-6 text-center text-xs text-ds-secondary">
                {results.visualizations?.notes?.[0] ||
                  'No chart recommendations recorded for this run.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {results.visualizations.charts.map((chart) => (
                  <div
                    key={chart.chart_id}
                    className="space-y-1.5 rounded-ds-md border border-ds-border bg-ds-surface2 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ds-ink">{chart.title}</span>
                      <StatusBadge tone="primary">{chart.chart_type.toUpperCase()}</StatusBadge>
                    </div>
                    <p className="font-mono text-[11px] text-ds-secondary">
                      X: {chart.x_label || chart.x_axis} · Y: {chart.y_label || chart.y_axis}
                    </p>
                    {chart.description && (
                      <p className="text-[11px] text-ds-secondary">{chart.description}</p>
                    )}
                    {chart.query_run_id && (
                      <p className="font-mono text-[10px] text-ds-subtle">
                        Query ref: {chart.query_run_id}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
