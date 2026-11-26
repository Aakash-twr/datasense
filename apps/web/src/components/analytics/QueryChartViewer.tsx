import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react'
import type { QueryColumn } from '@/types'

interface QueryChartViewerProps {
  columns: QueryColumn[]
  rows: (string | number | boolean | null)[][]
  initialChartType?: ChartType
  initialXAxis?: string
  initialYAxis?: string
}

type ChartType = 'bar' | 'line' | 'pie'

const COLORS = [
  '#356AE6', // ds primary
  '#159A95', // ds secondary
  '#16A36A', // ds success
  '#D99A2B', // ds warning
  '#6366F1', // indigo
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#D84C59', // ds error
]

export function QueryChartViewer({
  columns,
  rows,
  initialChartType,
  initialXAxis,
  initialYAxis,
}: QueryChartViewerProps) {
  const [chartType, setChartType] = useState<ChartType>(initialChartType || 'bar')

  // Identify numeric columns
  const numericColumns = useMemo(() => {
    return columns.filter((col) => {
      const type = col.type.toUpperCase()
      return (
        type.includes('INT') ||
        type.includes('DOUBLE') ||
        type.includes('FLOAT') ||
        type.includes('DECIMAL') ||
        type.includes('NUMERIC') ||
        type.includes('REAL')
      )
    })
  }, [columns])

  // Default X axis (recommended, or first string/date column)
  const [xAxisKey, setXAxisKey] = useState<string>(() => {
    if (initialXAxis && columns.some((c) => c.name === initialXAxis)) {
      return initialXAxis
    }
    const stringCol = columns.find((c) => {
      const t = c.type.toUpperCase()
      return t.includes('VARCHAR') || t.includes('TEXT') || t.includes('CHAR') || t.includes('DATE')
    })
    return stringCol?.name || columns[0]?.name || ''
  })

  // Default Y axis (recommended, or first numeric column)
  const [yAxisKey, setYAxisKey] = useState<string>(() => {
    if (initialYAxis && columns.some((c) => c.name === initialYAxis)) {
      return initialYAxis
    }
    return numericColumns[0]?.name || columns[1]?.name || columns[0]?.name || ''
  })

  // Map rows to array of objects
  const chartData = useMemo(() => {
    return rows.slice(0, 100).map((row) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col, idx) => {
        const val = row[idx]
        // Parse numerical for Y axis if string
        if (col.name === yAxisKey && typeof val === 'string') {
          const parsed = Number(val)
          obj[col.name] = isNaN(parsed) ? val : parsed
        } else {
          obj[col.name] = val
        }
      })
      return obj
    })
  }, [rows, columns, yAxisKey])

  if (!columns.length || !rows.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center p-6 text-center text-xs text-ds-secondary">
        <BarChart3 className="mb-2 h-8 w-8 text-ds-subtle" />
        <p>No query data to chart. Execute a query with numerical results.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col space-y-4 bg-ds-surface p-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border-subtle pb-3">
        {/* Chart Type Selector */}
        <div className="flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface2 p-1">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-ds-surface text-ds-primary shadow-xs'
                : 'text-ds-secondary hover:text-ds-ink'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Bar</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              chartType === 'line'
                ? 'bg-ds-surface text-ds-primary shadow-xs'
                : 'text-ds-secondary hover:text-ds-ink'
            }`}
          >
            <LineChartIcon className="h-3.5 w-3.5" />
            <span>Line</span>
          </button>
          <button
            type="button"
            onClick={() => setChartType('pie')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              chartType === 'pie'
                ? 'bg-ds-surface text-ds-primary shadow-xs'
                : 'text-ds-secondary hover:text-ds-ink'
            }`}
          >
            <PieChartIcon className="h-3.5 w-3.5" />
            <span>Pie</span>
          </button>
        </div>

        {/* Axis Selectors */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ds-secondary">X-Axis (Category):</span>
            <select
              value={xAxisKey}
              onChange={(e) => setXAxisKey(e.target.value)}
              className="rounded-ds-sm border border-ds-border bg-ds-surface px-2 py-1 font-mono text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ds-secondary">Y-Axis (Value):</span>
            <select
              value={yAxisKey}
              onChange={(e) => setYAxisKey(e.target.value)}
              className="rounded-ds-sm border border-ds-border bg-ds-surface px-2 py-1 font-mono text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[260px]">
        <ResponsiveContainer width="100%" height={260}>
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey={yAxisKey} fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line
                type="monotone"
                dataKey={yAxisKey}
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : (
            <PieChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Pie
                data={chartData.slice(0, 10)}
                dataKey={yAxisKey}
                nameKey={xAxisKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {chartData.slice(0, 10).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      {chartData.length > 50 && (
        <p className="text-center text-[10px] text-ds-subtle">
          Showing top 50 data points for optimal chart rendering.
        </p>
      )}
    </div>
  )
}
