import type { ComponentType } from 'react'

export interface StatCardProps {
  label: string
  value: string | number
  description?: string
  delta?: { value: string; positive?: boolean }
  icon?: ComponentType<{ className?: string }>
  accentTone?: 'primary' | 'teal' | 'neutral'
}

const ACCENT_BG = {
  primary: 'bg-ds-primary-soft text-ds-primary',
  teal: 'bg-ds-teal-soft text-ds-teal',
  neutral: 'bg-ds-muted text-ds-secondary',
}

export function StatCard({
  label,
  value,
  description,
  delta,
  icon: Icon,
  accentTone = 'primary',
}: StatCardProps) {
  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-5 shadow-xs transition-shadow hover:shadow-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tracking-tight text-ds-ink tabular-nums">
              {value}
            </p>
            {delta && (
              <span
                className={[
                  'text-xs font-medium tabular-nums',
                  delta.positive ? 'text-ds-success' : 'text-ds-error',
                ].join(' ')}
              >
                {delta.value}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 truncate text-xs text-ds-secondary">{description}</p>
          )}
        </div>
        {Icon && (
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-ds ${ACCENT_BG[accentTone]}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
