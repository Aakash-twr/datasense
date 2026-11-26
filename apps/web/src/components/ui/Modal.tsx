import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.focus()
    }, 0)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKey)
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'w-full rounded-ds-lg border border-ds-border bg-ds-surface shadow-overlay focus:outline-none',
          SIZE_CLASSES[size],
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-ds-border-subtle px-5 py-4">
            <div>
              {title && <h2 className="text-base font-semibold text-ds-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-ds-secondary">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 rounded-b-ds-lg border-t border-ds-border-subtle bg-ds-surface2 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
