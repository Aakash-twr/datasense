import React, { useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui'
import type { AgentRunStepItem } from '@/types'

interface AgentTimelineProps {
  steps: AgentRunStepItem[]
  runStatus: string
  currentStep?: string | null
  selectedStepId?: string | null
  onSelectStep?: (step: AgentRunStepItem) => void
}

function getStepTone(status: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'approved':
      return 'success'
    case 'running':
    case 'planning':
      return 'primary'
    case 'awaiting_approval':
      return 'warning'
    case 'failed':
    case 'rejected':
      return 'error'
    default:
      return 'neutral'
  }
}

function getStepStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'approved':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-ds-success" />
    case 'running':
    case 'planning':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ds-primary" />
    case 'awaiting_approval':
      return <ShieldAlert className="h-4 w-4 shrink-0 text-ds-warning" />
    case 'failed':
    case 'rejected':
      return <XCircle className="h-4 w-4 shrink-0 text-ds-error" />
    case 'skipped':
      return <MinusCircle className="h-4 w-4 shrink-0 text-ds-subtle" />
    default:
      return <Clock className="h-4 w-4 shrink-0 text-ds-subtle" />
  }
}

export const AgentTimeline: React.FC<AgentTimelineProps> = ({
  steps,
  runStatus,
  currentStep,
  selectedStepId,
  onSelectStep,
}) => {
  const orderedSteps = useMemo(
    () => [...steps].sort((a, b) => a.sequence_order - b.sequence_order),
    [steps],
  )

  return (
    <section
      aria-label="Workflow execution timeline"
      className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-ds-border bg-ds-surface2 px-4 py-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
            Agent Execution Timeline
          </h3>
          {currentStep && (
            <p className="mt-0.5 text-[11px] text-ds-secondary">Current: {currentStep}</p>
          )}
        </div>
        <StatusBadge tone={getStepTone(runStatus)} dot>
          {runStatus.replace(/_/g, ' ')}
        </StatusBadge>
      </div>

      {orderedSteps.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center text-xs text-ds-secondary">
          {runStatus === 'planning' || runStatus === 'running' ? (
            <>
              <Loader2 className="mb-2 h-5 w-5 animate-spin text-ds-primary" />
              <span>Orchestrating LangGraph agents...</span>
            </>
          ) : (
            <>
              <AlertTriangle className="mb-2 h-5 w-5 text-ds-subtle" />
              <span>No execution steps recorded yet.</span>
            </>
          )}
        </div>
      ) : (
        <ol className="divide-y divide-ds-border-subtle">
          {orderedSteps.map((step) => {
            const isSelected = selectedStepId === step.id
            const timestamp = step.completed_at || step.started_at
            const outputEntries = step.output_summary
              ? Object.entries(step.output_summary).filter(
                  ([k]) => !/secret|token|key|prompt|raw_row/i.test(k),
                )
              : []

            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelectStep?.(step)}
                  className={[
                    'flex w-full items-start gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-ds-surface2',
                    isSelected ? 'bg-ds-primary-soft/45' : '',
                  ].join(' ')}
                >
                  <div className="mt-0.5">{getStepStatusIcon(step.status)}</div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-ds-ink">{step.agent_name}</span>
                        <span className="mx-1.5 text-ds-subtle">·</span>
                        <span className="text-ds-secondary">{step.step_name}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone={getStepTone(step.status)}>
                          {step.status.replace(/_/g, ' ')}
                        </StatusBadge>
                        {step.duration_ms !== null && step.duration_ms !== undefined && (
                          <span className="font-mono text-[10px] text-ds-subtle tabular-nums">
                            {step.duration_ms >= 1000
                              ? `${(step.duration_ms / 1000).toFixed(2)}s`
                              : `${Math.round(step.duration_ms)}ms`}
                          </span>
                        )}
                      </div>
                    </div>

                    {timestamp && (
                      <p className="font-mono text-[10px] text-ds-subtle tabular-nums">
                        {new Date(timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </p>
                    )}

                    {outputEntries.length > 0 && (
                      <p className="truncate text-[11px] text-ds-secondary">
                        {outputEntries
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
                          )
                          .join(' · ')}
                      </p>
                    )}

                    {step.error_message && (
                      <p className="text-[11px] text-ds-error">{step.error_message}</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
