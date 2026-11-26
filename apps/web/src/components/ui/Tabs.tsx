import type { ReactNode } from 'react'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
  badge?: string | number
  disabled?: boolean
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  variant?: 'underline' | 'pills'
  className?: string
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  className = '',
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={[
        'flex items-center gap-1',
        variant === 'underline'
          ? 'border-b border-ds-border'
          : 'inline-flex rounded-ds border border-ds-border bg-ds-surface2 p-1',
        className,
      ].join(' ')}
    >
      {items.map((tab) => {
        const active = tab.id === value
        const baseClasses =
          'inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed'

        const variantClasses =
          variant === 'underline'
            ? [
                '-mb-px border-b-2 px-3 py-2',
                active
                  ? 'border-ds-primary text-ds-primary'
                  : 'border-transparent text-ds-secondary hover:text-ds-ink hover:border-ds-border-strong',
              ].join(' ')
            : [
                'rounded-ds-sm px-3 py-1.5',
                active
                  ? 'bg-ds-surface text-ds-ink shadow-xs'
                  : 'text-ds-secondary hover:text-ds-ink',
              ].join(' ')

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`${baseClasses} ${variantClasses}`}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                  active
                    ? 'bg-ds-primary-soft text-ds-primary'
                    : 'bg-ds-muted text-ds-secondary',
                ].join(' ')}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
