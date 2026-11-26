import type { ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  action?: ReactNode
  compact?: boolean
  className?: string
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
  retryLabel = 'Retry',
  action,
  compact = false,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={[
        'rounded-ds-lg border border-[var(--ds-error-border)] bg-ds-error-soft text-ds-ink',
        compact ? 'px-4 py-3' : 'p-6',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-ds bg-ds-surface border border-[var(--ds-error-border)] text-ds-error">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ds-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ds-secondary">{message}</p>
          {(onRetry || action) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onRetry && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onRetry}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  {retryLabel}
                </Button>
              )}
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
