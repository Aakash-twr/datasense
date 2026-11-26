import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface DropdownProps {
  trigger: ReactNode | ((open: boolean) => ReactNode)
  children: ReactNode | ((controls: { close: () => void }) => ReactNode)
  align?: 'left' | 'right'
  widthClassName?: string
  ariaLabel?: string
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  widthClassName = 'w-56',
  ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((prev) => !prev)
          }
        }}
        className="cursor-pointer rounded-ds focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
      >
        {typeof trigger === 'function' ? trigger(open) : trigger}
      </div>

      {open && (
        <div
          role="menu"
          className={[
            'absolute z-50 mt-1.5 rounded-ds-lg border border-ds-border bg-ds-surface py-1.5 shadow-popover',
            align === 'right' ? 'right-0' : 'left-0',
            widthClassName,
          ].join(' ')}
        >
          {typeof children === 'function'
            ? children({ close: () => setOpen(false) })
            : children}
        </div>
      )}
    </div>
  )
}

export interface DropdownItemProps {
  onClick?: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}

export function DropdownItem({
  onClick,
  icon,
  danger = false,
  disabled = false,
  children,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        danger
          ? 'text-ds-error hover:bg-ds-error-soft'
          : 'text-ds-ink hover:bg-ds-surface2',
      ].join(' ')}
    >
      {icon && <span className="flex-shrink-0 text-current opacity-80">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  )
}

export function DropdownDivider() {
  return <div role="separator" className="my-1 border-t border-ds-border-subtle" />
}
