import React from 'react'
import { CheckCircle2, Lock, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui'

interface PrivacyDisclosureModalProps {
  isOpen: boolean
  onAcknowledge: () => void
  onClose?: () => void
  canDismiss?: boolean
  isAcknowledged?: boolean
  isLoading?: boolean
}

export const PrivacyDisclosureModal: React.FC<PrivacyDisclosureModalProps> = ({
  isOpen,
  onAcknowledge,
  onClose,
  canDismiss = false,
  isAcknowledged = false,
  isLoading = false,
}) => {
  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-overlay">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ds-border bg-ds-surface2 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className="text-base font-semibold text-ds-ink">
                AI Analytics Copilot Privacy Notice
              </h2>
              <p className="mt-0.5 text-xs text-ds-secondary">
                Google Gemini API Data Handling &amp; Schema Isolation
              </p>
            </div>
          </div>

          {canDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close privacy notice"
              className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-4 p-6 text-sm leading-relaxed text-ds-secondary">
          <p>
            DataSense uses Google&apos;s Gemini model via Google AI Studio to interpret your
            questions and draft analytical DuckDB SQL queries.
          </p>

          <div className="space-y-2.5 rounded-ds-md border border-ds-border bg-ds-surface2 p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ds-success" />
              <span className="text-ds-ink">
                <strong>Only schema metadata is sent:</strong> Table names, column names, canonical
                data types, and safe summary counts are sent to formulate SQL.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ds-primary" />
              <span className="text-ds-ink">
                <strong>Raw data is strictly protected:</strong> Raw CSV/Excel/Parquet records,
                personal identifying information (PII), and row contents are <em>never</em>{' '}
                transmitted to Gemini.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ds-success" />
              <span className="text-ds-ink">
                <strong>Deterministic execution:</strong> Gemini only generates proposed SQL drafts.
                Queries are executed locally in DuckDB only after your explicit review and click.
              </span>
            </div>
          </div>

          <p className="text-xs text-ds-subtle">
            By proceeding, you acknowledge that natural language prompts and schema identifiers are
            processed by Google Gemini in accordance with Google&apos;s API service terms.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-ds-border bg-ds-surface2 px-6 py-3.5">
          {canDismiss && onClose && (
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
          {(!isAcknowledged || !canDismiss) && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onAcknowledge}
              loading={isLoading}
              leftIcon={<ShieldCheck className="h-4 w-4" />}
            >
              I Understand &amp; Agree
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
