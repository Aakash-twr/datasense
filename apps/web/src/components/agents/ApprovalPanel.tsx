import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Database,
  Lock,
  Play,
  ShieldCheck,
  Table as TableIcon,
  XCircle,
} from 'lucide-react'
import { Button, ConfirmDialog, StatusBadge } from '@/components/ui'
import type { AgentRunItem } from '@/types'

interface ApprovalPanelProps {
  run: AgentRunItem
  isSubmitting: boolean
  onApprove: (approvedIndices: number[], comment?: string) => void
  onReject: (reason?: string) => void
  onCancel: () => void
}

export const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  run,
  isSubmitting,
  onApprove,
  onReject,
  onCancel,
}) => {
  const queries = useMemo(() => run.approval_payload?.queries ?? [], [run.approval_payload])
  const [selectedIndices, setSelectedIndices] = useState<number[]>(() =>
    queries.map((q) => q.query_index),
  )
  const [comment, setComment] = useState('')
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false)

  useEffect(() => {
    setSelectedIndices((run.approval_payload?.queries || []).map((q) => q.query_index))
    setConfirmApproveOpen(false)
  }, [run.id, run.approval_payload])

  if (run.status !== 'awaiting_approval' || !run.approval_payload) {
    return null
  }

  const toggleIndex = (idx: number) => {
    setSelectedIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    )
  }

  const completedStepsCount = run.steps.filter((s) => s.status === 'completed').length
  const totalEstimatedSteps = Math.max(run.steps.length + 3, 5)
  const progressPercent = Math.min(85, Math.max(25, Math.round((completedStepsCount / totalEstimatedSteps) * 100)))

  const allTablesAccessed = Array.from(
    new Set(queries.flatMap((q) => q.tables_referenced || [])),
  )
  const versionEntries = Object.keys(run.dataset_version_snapshot || {}).length

  const handleConfirmApproval = () => {
    setConfirmApproveOpen(false)
    onApprove(selectedIndices, comment.trim() || undefined)
  }

  return (
    <>
      <section
        aria-label="Workflow SQL execution approval gate"
        className="overflow-hidden rounded-ds-lg border border-[var(--ds-warning-border)] bg-ds-surface shadow-sm"
      >
        {/* Top Waiting-for-Approval Header & Progress */}
        <div className="border-b border-[var(--ds-warning-border)] bg-ds-warning-soft/75 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-md bg-ds-warning-soft text-ds-warning ring-1 ring-[var(--ds-warning-border)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-ds-ink">
                    Human-in-the-Loop SQL Execution Approval Required
                  </h2>
                  <StatusBadge tone="warning" dot>
                    Waiting for approval
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Review the proposed analysis plan and validated DuckDB SQL drafts. Approval is
                  cryptographically bound to this exact SQL plan and dataset version snapshot.
                </p>
              </div>
            </div>

            {run.approval_hash && (
              <span className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1 font-mono text-[11px] text-ds-secondary">
                <Lock className="h-3 w-3 text-ds-subtle" />
                <span>Hash: {run.approval_hash.slice(0, 12)}</span>
              </span>
            )}
          </div>

          {/* Workflow Progress Indicator */}
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-ds-secondary">
              <span className="font-medium text-ds-ink">
                Workflow paused before execution engine ({completedStepsCount} preparation step
                {completedStepsCount === 1 ? '' : 's'} completed)
              </span>
              <span className="font-mono font-medium tabular-nums">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ds-border">
              <div
                className="h-full rounded-full bg-ds-warning transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Proposed Analysis Plan Summary Bar */}
        <div className="grid grid-cols-2 gap-3 border-b border-ds-border bg-ds-surface2 px-5 py-3 text-xs sm:grid-cols-4">
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ds-subtle">
              Workflow Mode
            </span>
            <span className="mt-0.5 block font-mono font-semibold text-ds-ink">
              {run.workflow_type}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ds-subtle">
              SQL Executions Selected
            </span>
            <span className="mt-0.5 block font-semibold text-ds-ink tabular-nums">
              {selectedIndices.length} of {queries.length} quer{queries.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ds-subtle">
              Tables Accessed
            </span>
            <span className="mt-0.5 block truncate font-mono text-ds-ink">
              {allTablesAccessed.length > 0 ? allTablesAccessed.join(', ') : 'Project Catalog'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ds-subtle">
              Version Lock
            </span>
            <span className="mt-0.5 block font-medium text-ds-ink tabular-nums">
              {versionEntries} dataset snapshot{versionEntries === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Proposed Analysis Goal + Query Drafts */}
        <div className="space-y-4 p-5">
          <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface2 px-3.5 py-2.5 text-xs">
            <span className="font-semibold text-ds-ink">Proposed Analysis Plan: </span>
            <span className="text-ds-secondary">{run.user_request}</span>
          </div>

          {queries.length > 1 && (
            <div className="flex items-center gap-2 rounded-ds-md border border-[var(--ds-warning-border)] bg-ds-warning-soft px-3 py-2 text-xs text-ds-ink">
              <AlertTriangle className="h-4 w-4 shrink-0 text-ds-warning" />
              <span>
                Approving will execute <strong>{selectedIndices.length}</strong> sequential
                read-only SQL queries against your sandboxed DuckDB engine.
              </span>
            </div>
          )}

          {/* SQL Queries Checklist */}
          <div className="space-y-3">
            {queries.map((q) => {
              const isChecked = selectedIndices.includes(q.query_index)
              const isValidStatus =
                q.validation_status === 'valid' || q.validation_status === 'repaired'

              return (
                <div
                  key={q.query_index}
                  className={[
                    'rounded-ds-md border p-3.5 transition-colors',
                    isChecked
                      ? 'border-ds-primary/35 bg-ds-surface ring-1 ring-ds-primary/10'
                      : 'border-ds-border bg-ds-surface2 opacity-75',
                  ].join(' ')}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleIndex(q.query_index)}
                        className="h-4 w-4 rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                      />
                      <span className="text-xs font-semibold text-ds-ink">
                        #{q.query_index + 1}: {q.title}
                      </span>
                    </label>

                    <StatusBadge
                      tone={isValidStatus ? 'success' : 'error'}
                      icon={<CheckCircle2 className="h-3 w-3" />}
                    >
                      {q.validation_status} (SQLGlot)
                    </StatusBadge>
                  </div>

                  <p className="mb-2.5 text-xs text-ds-secondary">{q.purpose}</p>

                  <div className="mb-2.5 flex flex-wrap items-center gap-3 text-[11px] text-ds-secondary">
                    <span className="inline-flex items-center gap-1">
                      <Database className="h-3 w-3 text-ds-subtle" />
                      <span>Datasets: {q.datasets_involved.join(', ') || 'Project Scope'}</span>
                    </span>
                    {q.tables_referenced.length > 0 && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <TableIcon className="h-3 w-3 text-ds-subtle" />
                        <span>{q.tables_referenced.join(', ')}</span>
                      </span>
                    )}
                  </div>

                  <pre className="overflow-x-auto rounded-ds-sm border border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ds-text-on-dark)]">
                    <code>{q.sql}</code>
                  </pre>
                </div>
              )
            })}
          </div>

          {/* Review Note & Explicit Decision Controls */}
          <div className="flex flex-col justify-between gap-3 border-t border-ds-border pt-3.5 sm:flex-row sm:items-center">
            <input
              type="text"
              aria-label="Approval or rejection note"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional review comment (stored with workflow audit log)..."
              className="flex-1 rounded-ds-sm border border-ds-border bg-ds-surface2 px-3 py-1.5 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
            />

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={onCancel}
                leftIcon={<Ban className="h-3.5 w-3.5" />}
              >
                Cancel Workflow
              </Button>

              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={isSubmitting}
                onClick={() => onReject(comment.trim() || undefined)}
                leftIcon={<XCircle className="h-3.5 w-3.5" />}
              >
                Reject Plan
              </Button>

              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting || selectedIndices.length === 0}
                loading={isSubmitting}
                onClick={() => setConfirmApproveOpen(true)}
                leftIcon={<Play className="h-3.5 w-3.5 fill-current" />}
              >
                Approve &amp; Run ({selectedIndices.length})
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmApproveOpen}
        title="Confirm SQL Execution Approval"
        description={`Execute ${selectedIndices.length} validated DuckDB SQL ${
          selectedIndices.length === 1 ? 'query' : 'queries'
        } across ${
          allTablesAccessed.length > 0 ? allTablesAccessed.join(', ') : 'selected datasets'
        }? Approval binds to hash ${run.approval_hash?.slice(0, 12) || 'current'}.`}
        confirmLabel="Confirm & Execute"
        cancelLabel="Review Queries"
        variant="primary"
        loading={isSubmitting}
        onConfirm={handleConfirmApproval}
        onCancel={() => setConfirmApproveOpen(false)}
      />
    </>
  )
}
