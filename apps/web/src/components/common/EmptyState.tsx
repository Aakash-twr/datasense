import type { ComponentType, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  icon: Icon = AlertCircle,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-ds-lg border border-dashed border-ds-border-strong bg-ds-surface2 px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs">
        <Icon className="h-5 w-5 text-ds-secondary" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-ds-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-xs text-ds-secondary">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
