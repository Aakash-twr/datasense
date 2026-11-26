import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  options?: SelectOption[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, options, children, className = '', id, ...props }, ref) => {
    const generatedId = useId()
    const selectId = id ?? generatedId

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-ds-ink">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? 'true' : undefined}
            className={[
              'w-full appearance-none rounded-ds border bg-ds-surface py-2 pl-3 pr-8 text-[13px] text-ds-ink',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-ds-primary/20 focus:border-ds-primary',
              'disabled:cursor-not-allowed disabled:bg-ds-surface2 disabled:text-ds-secondary',
              error
                ? 'border-ds-error focus:border-ds-error focus:ring-ds-error/20'
                : 'border-ds-border',
              className,
            ]
              .join(' ')
              .trim()}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-secondary"
            aria-hidden="true"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-ds-error">
            {error}
          </p>
        ) : (
          hint && <p className="text-xs text-ds-secondary">{hint}</p>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'
