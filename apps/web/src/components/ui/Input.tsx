import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, rightElement, className = '', id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-ds-ink"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 text-ds-subtle">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            className={[
              'w-full rounded-ds border bg-ds-surface py-2 text-[13px] text-ds-ink placeholder:text-ds-subtle',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-ds-primary/20 focus:border-ds-primary',
              'disabled:cursor-not-allowed disabled:bg-ds-surface2 disabled:text-ds-secondary',
              error
                ? 'border-ds-error focus:border-ds-error focus:ring-ds-error/20'
                : 'border-ds-border',
              leftIcon ? 'pl-9' : 'px-3',
              rightElement ? 'pr-9' : 'px-3',
              className,
            ]
              .join(' ')
              .trim()}
            {...props}
          />
          {rightElement && (
            <span className="absolute right-2.5 flex items-center text-ds-secondary">
              {rightElement}
            </span>
          )}
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

Input.displayName = 'Input'
