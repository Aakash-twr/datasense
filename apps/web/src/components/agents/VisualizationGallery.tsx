import React, { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Maximize2, X } from 'lucide-react'
import { StatusBadge } from '@/components/ui'
import type { AgentVisualizationSpec } from '@/types'

interface VisualizationGalleryProps {
  charts: AgentVisualizationSpec[]
  notes?: string[]
}

const COLORS = ['#356AE6', '#159A95', '#16A36A', '#D99A2B', '#6366F1', '#0EA5E9', '#D84C59']

export const VisualizationGallery: React.FC<VisualizationGalleryProps> = ({
  charts,
  notes = [],
}) => {
  const [expandedChart, setExpandedChart] = useState<AgentVisualizationSpec | null>(null)

  const renderChart = (spec: AgentVisualizationSpec, height = 240) => {
    const data = spec.data_preview || []
    if (data.length === 0) {
      return <p className="py-12 text-center text-xs text-ds-subtle">No chartable rows available.</p>
    }

    if (spec.chart_type === 'line') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey={spec.x_axis} tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={spec.y_axis} stroke="#356AE6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    if (spec.chart_type === 'area') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey={spec.x_axis} tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey={spec.y_axis} stroke="#356AE6" fill="#EEF4FF" />
          </AreaChart>
        </ResponsiveContainer>
      )
    }

    if (spec.chart_type === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey={spec.y_axis}
              nameKey={spec.x_axis}
              cx="50%"
              cy="50%"
              outerRadius={Math.floor(height / 3)}
              label
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (spec.chart_type === 'scatter') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey={spec.x_axis}
              name={spec.x_label || spec.x_axis}
              tick={{ fontSize: 11, fill: '#64748B' }}
            />
            <YAxis
              dataKey={spec.y_axis}
              name={spec.y_label || spec.y_axis}
              tick={{ fontSize: 11, fill: '#64748B' }}
            />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter name={spec.title} data={data} fill="#356AE6" />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey={spec.x_axis} tick={{ fontSize: 11, fill: '#64748B' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
          <Tooltip />
          <Legend />
          <Bar dataKey={spec.y_axis} fill="#356AE6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <section
      aria-label="Visualization gallery"
      className="space-y-4 rounded-ds-lg border border-ds-border bg-ds-surface p-4 shadow-xs"
    >
      <div className="flex items-center justify-between border-b border-ds-border-subtle pb-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-ds-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
            Visualization Gallery
          </h3>
        </div>
        <StatusBadge tone="neutral">{charts.length} chart(s)</StatusBadge>
      </div>

      {charts.length === 0 ? (
        <div className="py-8 text-center text-xs text-ds-secondary">
          {notes[0] || 'Charts appear after approved SQL queries return tabular data.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {charts.map((chart) => (
            <div
              key={chart.chart_id}
              className="space-y-2 rounded-ds-md border border-ds-border bg-ds-surface2 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-ds-ink">{chart.title}</h4>
                  <p className="font-mono text-[11px] text-ds-secondary">
                    {chart.chart_type.toUpperCase()} · {chart.x_label || chart.x_axis} vs{' '}
                    {chart.y_label || chart.y_axis}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedChart(chart)}
                  title="Expand chart"
                  aria-label={`Expand ${chart.title}`}
                  className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-surface hover:text-ds-ink"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="rounded-ds-sm bg-ds-surface p-2">{renderChart(chart, 220)}</div>
              {chart.query_run_id && (
                <p className="font-mono text-[10px] text-ds-subtle">
                  Source query: {chart.query_run_id}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {expandedChart && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-4xl space-y-4 rounded-ds-lg border border-ds-border bg-ds-surface p-6 shadow-overlay">
            <div className="flex items-center justify-between border-b border-ds-border pb-3">
              <div>
                <h3 className="text-base font-semibold text-ds-ink">{expandedChart.title}</h3>
                {expandedChart.description && (
                  <p className="text-xs text-ds-secondary">{expandedChart.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setExpandedChart(null)}
                aria-label="Close expanded chart"
                className="rounded-ds-sm p-1.5 text-ds-secondary hover:bg-ds-muted hover:text-ds-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderChart(expandedChart, 380)}
          </div>
        </div>
      )}
    </section>
  )
}
