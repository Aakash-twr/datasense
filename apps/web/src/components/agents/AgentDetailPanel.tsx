import React from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react'
import type { AgentWorkflowNodeData } from '@/components/agents/AgentWorkflowGraph'
import type { AgentRunStepItem } from '@/types'

interface AgentDetailPanelProps {
  node: AgentWorkflowNodeData | null
  focusedStep?: AgentRunStepItem | null
  onClose?: () => void
}

const SENSITIVE_KEY_PATTERN =
  /(api_key|secret|token|password|system_prompt|raw_prompt|raw_rows|rows|sample_rows|connection_string|credential)/i

function sanitizeValue(key: string, val: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[Redacted]'
  }
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) {
    return val.slice(0, 10).map((item) =>
      typeof item === 'object' && item !== null
        ? sanitizeRecord(item as Record<string, unknown>)
        : item,
    )
  }
  if (typeof val === 'object') {
    return sanitizeRecord(val as Record<string, unknown>)
  }
  return val
}

function sanitizeRecord(record?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!record || Object.keys(record).length === 0) return null
  const out: Record<string, unknown> = {}
  Object.entries(record).forEach(([k, v]) => {
    out[k] = sanitizeValue(k, v)
  })
  return out
}

function getDarkStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'approved':
      return 'border-emerald-700/80 bg-emerald-950/80 text-emerald-300'
    case 'running':
    case 'planning':
      return 'border-sky-700/80 bg-sky-950/80 text-sky-300'
    case 'awaiting_approval':
      return 'border-amber-700/80 bg-amber-950/80 text-amber-300'
    case 'failed':
    case 'rejected':
      return 'border-rose-700/80 bg-rose-950/80 text-rose-300'
    default:
      return 'border-slate-700 bg-slate-800 text-slate-300'
  }
}

export const AgentDetailPanel: React.FC<AgentDetailPanelProps> = ({
  node,
  focusedStep,
  onClose,
}) => {
  if (!node && !focusedStep) {
    return (
      <div className="rounded-ds-lg border border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] p-4 text-[var(--ds-text-on-dark)]">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Terminal className="h-4 w-4 text-sky-400" />
          <span>Agent Execution Inspector</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Select an agent node above or a step in the timeline to view role metadata, sanitized
          inputs/outputs, duration, and execution logs.
        </p>
      </div>
    )
  }

  const displayName = focusedStep?.agent_name || node?.agentName || 'Agent'
  const displayRole = node?.roleTitle || focusedStep?.step_name || 'Specialist Agent'
  const displayStatus = focusedStep?.status || node?.status || 'pending'

  const primaryStep =
    focusedStep ||
    (node && node.matchedSteps.length > 0 ? node.matchedSteps[node.matchedSteps.length - 1] : null)

  const durationMs = primaryStep?.duration_ms ?? node?.durationMs
  const startedAt = primaryStep?.started_at ?? node?.startedAt
  const completedAt = primaryStep?.completed_at ?? node?.completedAt
  const inputSummary = sanitizeRecord(primaryStep?.input_summary)
  const outputSummary = sanitizeRecord(primaryStep?.output_summary)
  const errorMessage = primaryStep?.error_message

  const relatedSteps = focusedStep ? [focusedStep] : node?.matchedSteps || []

  return (
    <aside
      aria-label="Agent details panel"
      className="overflow-hidden rounded-ds-lg border border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] text-[var(--ds-text-on-dark)] shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark-elevated)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Terminal className="h-4 w-4 shrink-0 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">{displayName}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${getDarkStatusBadge(displayStatus)}`}
            >
              {displayStatus.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{displayRole}</p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close agent details"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="space-y-4 p-4 text-xs">
        {/* Timing & Telemetry Row */}
        <div className="grid grid-cols-3 gap-2 rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-900/60 p-3">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
              Duration
            </span>
            <span className="mt-0.5 block font-mono font-semibold text-slate-100 tabular-nums">
              {durationMs !== null && durationMs !== undefined
                ? durationMs >= 1000
                  ? `${(durationMs / 1000).toFixed(2)}s`
                  : `${Math.round(durationMs)} ms`
                : '—'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
              Started
            </span>
            <span className="mt-0.5 block font-mono text-[11px] text-slate-200 tabular-nums">
              {startedAt
                ? new Date(startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">
              Completed
            </span>
            <span className="mt-0.5 block font-mono text-[11px] text-slate-200 tabular-nums">
              {completedAt
                ? new Date(completedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        </div>

        {/* Error Callout */}
        {errorMessage && (
          <div className="flex items-start gap-2 rounded-ds-md border border-rose-800/80 bg-rose-950/60 p-3 text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <strong className="block text-[11px] font-semibold uppercase tracking-wider text-rose-300">
                Execution Error
              </strong>
              <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Input Summary */}
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Input Summary
          </h4>
          {inputSummary ? (
            <div className="space-y-1 rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/70 p-2.5 font-mono text-[11px]">
              {Object.entries(inputSummary).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-slate-400">{k}:</span>
                  <span className="break-all text-right text-slate-200">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/50 px-3 py-2 text-[11px] text-slate-500">
              No input summary recorded for this step yet.
            </p>
          )}
        </div>

        {/* Output Summary */}
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Output Summary
          </h4>
          {outputSummary ? (
            <div className="space-y-1 rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/70 p-2.5 font-mono text-[11px]">
              {Object.entries(outputSummary).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-slate-400">{k}:</span>
                  <span className="break-all text-right text-emerald-300">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ) : node?.outputSummaryText ? (
            <p className="rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/70 px-3 py-2 font-mono text-[11px] text-emerald-300">
              {node.outputSummaryText}
            </p>
          ) : (
            <p className="rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/50 px-3 py-2 text-[11px] text-slate-500">
              Pending output from workflow checkpoint.
            </p>
          )}
        </div>

        {/* Safe Execution Log */}
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Execution Logs (Sanitized)
          </h4>
          {relatedSteps.length === 0 ? (
            <p className="rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/50 px-3 py-2 text-[11px] text-slate-500">
              Agent has not started in this run yet.
            </p>
          ) : (
            <div className="space-y-1.5 rounded-ds-md border border-[var(--ds-border-dark)] bg-slate-950/80 p-2.5 font-mono text-[11px]">
              {relatedSteps.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-2 border-b border-slate-800/80 pb-1.5 last:border-none last:pb-0"
                >
                  {s.status === 'completed' ? (
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                  ) : s.status === 'awaiting_approval' ? (
                    <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                  ) : (
                    <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-slate-200">
                      <span className="truncate font-semibold">
                        [{s.agent_name}] {s.step_name}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {s.duration_ms ? `${Math.round(s.duration_ms)}ms` : s.status}
                      </span>
                    </div>
                    {s.started_at && (
                      <span className="block text-[10px] text-slate-500">
                        {new Date(s.started_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
