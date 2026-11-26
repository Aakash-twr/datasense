import type { ReactNode } from 'react'

export type StatusTone = 'neutral' | 'primary' | 'teal' | 'success' | 'warning' | 'error'

export interface StatusBadgeProps {
  tone?: StatusTone
  dot?: boolean
  pulse?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<StatusTone, { wrapper: string; dot: string }> = {
  neutral: {
    wrapper: 'bg-ds-muted text-ds-secondary border-ds-border',
    dot: 'bg-ds-subtle',
  },
  primary: {
    wrapper: 'bg-ds-primary-soft text-ds-primary border-[var(--ds-accent-primary-border)]',
    dot: 'bg-ds-primary',
  },
  teal: {
    wrapper: 'bg-ds-teal-soft text-ds-teal border-[var(--ds-accent-secondary-border)]',
    dot: 'bg-ds-teal',
  },
  success: {
    wrapper: 'bg-ds-success-soft text-ds-success border-[var(--ds-success-border)]',
    dot: 'bg-ds-success',
  },
  warning: {
    wrapper: 'bg-ds-warning-soft text-ds-warning border-[var(--ds-warning-border)]',
    dot: 'bg-ds-warning',
  },
  error: {
    wrapper: 'bg-ds-error-soft text-ds-error border-[var(--ds-error-border)]',
    dot: 'bg-ds-error',
  },
}

export function StatusBadge({
  tone = 'neutral',
  dot = false,
  pulse = false,
  icon,
  children,
  className = '',
}: StatusBadgeProps) {
  const style = TONE_CLASSES[tone]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        style.wrapper,
        className,
      ].join(' ')}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${style.dot} ${pulse ? 'animate-pulse' : ''}`}
        />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  )
}
