import React, { useMemo } from 'react'
import {
  AlertCircle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  Database,
  FileText,
  Lightbulb,
  Loader2,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
import type { AgentRunItem, AgentRunResultsResponse, AgentRunStepItem } from '@/types'

export type NormalizedNodeStatus = 'running' | 'completed' | 'awaiting_approval' | 'failed' | 'pending'

export interface AgentWorkflowNodeData {
  id: string
  agentName: string
  roleTitle: string
  description: string
  status: NormalizedNodeStatus
  startedAt?: string | null
  completedAt?: string | null
  durationMs?: number | null
  outputSummaryText: string | null
  matchedSteps: AgentRunStepItem[]
  x: number
  y: number
}

interface AgentWorkflowGraphProps {
  run: AgentRunItem
  results?: AgentRunResultsResponse | null
  selectedAgentId: string | null
  onSelectAgent: (node: AgentWorkflowNodeData) => void
}

interface AgentBlueprint {
  id: string
  agentName: string
  roleTitle: string
  description: string
  aliases: string[]
  x: number
  y: number
}

const NODE_WIDTH = 224
const NODE_HEIGHT = 112

const AGENT_BLUEPRINTS: AgentBlueprint[] = [
  {
    id: 'supervisor',
    agentName: 'Supervisor',
    roleTitle: 'Orchestrator & Planner',
    description: 'Classifies analytical intent and dispatches specialist agents.',
    aliases: ['Supervisor', 'Context Loader'],
    x: 24,
    y: 120,
  },
  {
    id: 'discovery',
    agentName: 'Data Discovery',
    roleTitle: 'Schema & Lineage Mapper',
    description: 'Identifies tables, measures, dimensions, PII, and join keys.',
    aliases: ['Data Discovery'],
    x: 296,
    y: 28,
  },
  {
    id: 'quality',
    agentName: 'Data Quality',
    roleTitle: 'Profiling & Audit Agent',
    description: 'Evaluates completeness, nulls, duplicates, and type anomalies.',
    aliases: ['Data Quality'],
    x: 296,
    y: 212,
  },
  {
    id: 'sql_analyst',
    agentName: 'SQL Analyst',
    roleTitle: 'DuckDB Query & Approval Gate',
    description: 'Drafts SQL, validates AST safety, and awaits human approval.',
    aliases: ['SQL Analyst', 'SQL Validator', 'Approval Gate', 'Execution Engine'],
    x: 568,
    y: 120,
  },
  {
    id: 'statistical',
    agentName: 'Statistical Analyst',
    roleTitle: 'Deterministic Metrics Engine',
    description: 'Computes distributions, summary metrics, and outliers.',
    aliases: ['Statistical Analyst'],
    x: 840,
    y: 28,
  },
  {
    id: 'visualization',
    agentName: 'Visualization',
    roleTitle: 'Chart Spec Builder',
    description: 'Designs grounded chart specifications from result columns.',
    aliases: ['Visualization Agent', 'Visualization'],
    x: 840,
    y: 212,
  },
  {
    id: 'insight',
    agentName: 'Insight',
    roleTitle: 'Evidence Synthesizer',
    description: 'Turns verified metrics into findings and labeled hypotheses.',
    aliases: ['Insight Agent', 'Insight'],
    x: 1112,
    y: 120,
  },
  {
    id: 'report',
    agentName: 'Report Generation',
    roleTitle: 'Executive Compiler',
    description: 'Assembles structured findings, charts, and evidence references.',
    aliases: ['Report Agent', 'Report Generation'],
    x: 1384,
    y: 120,
  },
]

const EDGES: { from: string; to: string }[] = [
  { from: 'supervisor', to: 'discovery' },
  { from: 'supervisor', to: 'quality' },
  { from: 'discovery', to: 'sql_analyst' },
  { from: 'quality', to: 'sql_analyst' },
  { from: 'sql_analyst', to: 'statistical' },
  { from: 'sql_analyst', to: 'visualization' },
  { from: 'statistical', to: 'insight' },
  { from: 'visualization', to: 'insight' },
  { from: 'insight', to: 'report' },
]

function normalizeStepStatus(raw: string): NormalizedNodeStatus {
  const s = raw.toLowerCase()
  if (s === 'running' || s === 'planning') return 'running'
  if (s === 'completed' || s === 'approved' || s === 'success') return 'completed'
  if (s === 'awaiting_approval') return 'awaiting_approval'
  if (s === 'failed' || s === 'rejected') return 'failed'
  return 'pending'
}

function resolveAggregateStatus(
  steps: AgentRunStepItem[],
  blueprintId: string,
  runStatus: string,
): NormalizedNodeStatus {
  if (steps.length > 0) {
    const statuses = steps.map((s) => normalizeStepStatus(s.status))
    if (statuses.includes('failed')) return 'failed'
    if (statuses.includes('awaiting_approval')) return 'awaiting_approval'
    if (statuses.includes('running')) return 'running'
    if (statuses.every((s) => s === 'completed')) return 'completed'
    if (statuses.includes('completed')) return 'completed'
  }

  // Fallback directly to active run's state if waiting before a sub-step is logged
  if (blueprintId === 'sql_analyst' && runStatus === 'awaiting_approval') {
    return 'awaiting_approval'
  }
  if (blueprintId === 'supervisor' && (runStatus === 'planning' || runStatus === 'running')) {
    return 'running'
  }

  return 'pending'
}

function formatNodeOutputSummary(
  blueprintId: string,
  steps: AgentRunStepItem[],
  results?: AgentRunResultsResponse | null,
): string | null {
  const lastWithOutput = [...steps]
    .reverse()
    .find((s) => s.output_summary && Object.keys(s.output_summary).length > 0)

  if (lastWithOutput?.output_summary) {
    const entries = Object.entries(lastWithOutput.output_summary)
      .filter(([k]) => !/secret|token|key|prompt|raw_row/i.test(k))
      .slice(0, 2)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    if (entries.length > 0) return entries.join(' · ')
  }

  if (!results) return null
  switch (blueprintId) {
    case 'discovery':
      return results.discovery
        ? `${results.discovery.relevant_tables.length} table(s), ${results.discovery.relationships.length} relation(s)`
        : null
    case 'quality':
      return results.data_quality
        ? `${results.data_quality.total_issues} issue(s) · ${results.data_quality.overall_health}`
        : null
    case 'sql_analyst':
      return results.executed_queries.length > 0
        ? `${results.executed_queries.length} executed query(s)`
        : results.sql_drafts.length > 0
          ? `${results.sql_drafts.length} SQL draft(s)`
          : null
    case 'statistical':
      return results.statistical_analysis
        ? `${results.statistical_analysis.metrics.length} metric(s), ${results.statistical_analysis.anomalies.length} anomaly(s)`
        : null
    case 'visualization':
      return results.visualizations
        ? `${results.visualizations.charts.length} chart spec(s)`
        : null
    case 'insight':
      return results.insights
        ? `${results.insights.findings.length} finding(s)`
        : null
    case 'report':
      return results.report ? results.report.title : null
    default:
      return null
  }
}

function getAgentIcon(id: string) {
  switch (id) {
    case 'supervisor':
      return Bot
    case 'discovery':
      return Database
    case 'quality':
      return ShieldAlert
    case 'sql_analyst':
      return Code2
    case 'statistical':
      return TrendingUp
    case 'visualization':
      return BarChart3
    case 'insight':
      return Lightbulb
    case 'report':
      return FileText
    default:
      return Bot
  }
}

const STATUS_STYLE: Record<
  NormalizedNodeStatus,
  {
    label: string
    border: string
    badgeBg: string
    badgeText: string
    dot: string
    stroke: string
  }
> = {
  running: {
    label: 'Running',
    border: 'border-ds-primary ring-2 ring-ds-primary/15',
    badgeBg: 'bg-ds-primary-soft border-ds-primary/30',
    badgeText: 'text-ds-primary',
    dot: 'bg-ds-primary',
    stroke: '#356AE6',
  },
  completed: {
    label: 'Completed',
    border: 'border-ds-success/50',
    badgeBg: 'bg-ds-success-soft border-[var(--ds-success-border)]',
    badgeText: 'text-ds-success',
    dot: 'bg-ds-success',
    stroke: '#16A36A',
  },
  awaiting_approval: {
    label: 'Awaiting approval',
    border: 'border-ds-warning ring-2 ring-ds-warning/15',
    badgeBg: 'bg-ds-warning-soft border-[var(--ds-warning-border)]',
    badgeText: 'text-ds-warning',
    dot: 'bg-ds-warning',
    stroke: '#D99A2B',
  },
  failed: {
    label: 'Failed',
    border: 'border-ds-error/60',
    badgeBg: 'bg-ds-error-soft border-[var(--ds-error-border)]',
    badgeText: 'text-ds-error',
    dot: 'bg-ds-error',
    stroke: '#D84C59',
  },
  pending: {
    label: 'Pending',
    border: 'border-ds-border',
    badgeBg: 'bg-ds-muted border-ds-border',
    badgeText: 'text-ds-secondary',
    dot: 'bg-ds-subtle',
    stroke: '#CBD5E1',
  },
}

function StatusIcon({ status }: { status: NormalizedNodeStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin text-ds-primary" />
    case 'completed':
      return <CheckCircle2 className="h-3 w-3 text-ds-success" />
    case 'awaiting_approval':
      return <ShieldAlert className="h-3 w-3 text-ds-warning" />
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-ds-error" />
    default:
      return <Clock className="h-3 w-3 text-ds-subtle" />
  }
}

export const AgentWorkflowGraph: React.FC<AgentWorkflowGraphProps> = ({
  run,
  results,
  selectedAgentId,
  onSelectAgent,
}) => {
  const nodes = useMemo<AgentWorkflowNodeData[]>(() => {
    const steps = run.steps || []
    return AGENT_BLUEPRINTS.map((bp) => {
      const matchedSteps = steps
        .filter((s) =>
          bp.aliases.some(
            (alias) => s.agent_name.toLowerCase() === alias.toLowerCase(),
          ),
        )
        .sort((a, b) => a.sequence_order - b.sequence_order)

      const status = resolveAggregateStatus(matchedSteps, bp.id, run.status)
      const firstStarted = matchedSteps.find((s) => s.started_at)?.started_at ?? null
      const lastCompleted =
        [...matchedSteps].reverse().find((s) => s.completed_at)?.completed_at ?? null
      const totalDuration = matchedSteps.reduce(
        (acc, s) => (s.duration_ms ? acc + s.duration_ms : acc),
        0,
      )

      return {
        id: bp.id,
        agentName: bp.agentName,
        roleTitle: bp.roleTitle,
        description: bp.description,
        status,
        startedAt: firstStarted,
        completedAt: lastCompleted,
        durationMs: totalDuration > 0 ? totalDuration : null,
        outputSummaryText: formatNodeOutputSummary(bp.id, matchedSteps, results),
        matchedSteps,
        x: bp.x,
        y: bp.y,
      }
    })
  }, [run, results])

  const nodeMap = useMemo(() => {
    const map = new Map<string, AgentWorkflowNodeData>()
    nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [nodes])

  const canvasWidth = 1632
  const canvasHeight = 352

  return (
    <section
      aria-label="Agent workflow graph"
      className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
    >
      {/* Header + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface2 px-4 py-2.5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
            Agent Workflow Visualization
          </h2>
          <p className="text-[11px] text-ds-secondary">
            Click any agent node to inspect step inputs, outputs, and safe execution telemetry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ds-secondary">
          {(
            [
              ['running', 'Running'],
              ['completed', 'Completed'],
              ['awaiting_approval', 'Awaiting approval'],
              ['failed', 'Failed'],
              ['pending', 'Pending'],
            ] as const
          ).map(([statusKey, label]) => (
            <span key={statusKey} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[statusKey].dot}`} />
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Scrollable Connected Node Canvas */}
      <div
        className="overflow-x-auto bg-ds-surface2/70 p-4"
        style={{
          backgroundImage: 'radial-gradient(var(--ds-border-strong) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div
          className="relative mx-auto"
          style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
        >
          {/* Connected SVG Edges */}
          <svg
            aria-hidden="true"
            width={canvasWidth}
            height={canvasHeight}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            className="pointer-events-none absolute inset-0"
          >
            {EDGES.map((edge) => {
              const fromNode = nodeMap.get(edge.from)
              const toNode = nodeMap.get(edge.to)
              if (!fromNode || !toNode) return null

              const x1 = fromNode.x + NODE_WIDTH
              const y1 = fromNode.y + NODE_HEIGHT / 2
              const x2 = toNode.x
              const y2 = toNode.y + NODE_HEIGHT / 2
              const cpx = (x1 + x2) / 2

              const strokeColor =
                toNode.status !== 'pending'
                  ? STATUS_STYLE[toNode.status].stroke
                  : fromNode.status === 'completed'
                    ? '#94A3B8'
                    : '#CBD5E1'

              const isDashed = toNode.status === 'pending'

              return (
                <g key={`${edge.from}->${edge.to}`}>
                  <path
                    d={`M ${x1} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray={isDashed ? '5 4' : undefined}
                  />
                  <circle cx={x1} cy={y1} r={3} fill={strokeColor} />
                  <circle cx={x2} cy={y2} r={3} fill={strokeColor} />
                </g>
              )
            })}
          </svg>

          {/* Interactive Agent Nodes */}
          {nodes.map((node) => {
            const Icon = getAgentIcon(node.id)
            const style = STATUS_STYLE[node.status]
            const isSelected = selectedAgentId === node.id

            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectAgent(node)}
                aria-pressed={isSelected}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${NODE_WIDTH}px`,
                  height: `${NODE_HEIGHT}px`,
                }}
                className={[
                  'absolute flex flex-col justify-between rounded-ds-md border bg-ds-surface p-3 text-left shadow-xs transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ds-primary/25',
                  style.border,
                  isSelected ? 'ring-2 ring-ds-primary shadow-md' : '',
                ].join(' ')}
              >
                {/* Top row: Agent Name + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ds-surface2 text-ds-ink">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-xs font-semibold text-ds-ink">
                      {node.agentName}
                    </span>
                  </div>

                  <span
                    className={[
                      'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                      style.badgeBg,
                      style.badgeText,
                    ].join(' ')}
                  >
                    <StatusIcon status={node.status} />
                    <span>{style.label}</span>
                  </span>
                </div>

                {/* Brief Description */}
                <p className="line-clamp-2 text-[11px] leading-snug text-ds-secondary">
                  {node.description}
                </p>

                {/* Timing & Output Footer */}
                <div className="flex items-center justify-between gap-2 border-t border-ds-border-subtle pt-1.5 text-[10px]">
                  <span className="truncate text-ds-subtle">
                    {node.outputSummaryText ||
                      (node.completedAt
                        ? `Done ${new Date(node.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : node.startedAt
                          ? `Started ${new Date(node.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Waiting for execution')}
                  </span>
                  {node.durationMs !== null && node.durationMs !== undefined && (
                    <span className="shrink-0 font-mono text-ds-secondary tabular-nums">
                      {node.durationMs >= 1000
                        ? `${(node.durationMs / 1000).toFixed(2)}s`
                        : `${Math.round(node.durationMs)}ms`}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
