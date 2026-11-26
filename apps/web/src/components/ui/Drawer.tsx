import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  side?: 'left' | 'right'
  widthClassName?: string
  children: ReactNode
}

export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  widthClassName = 'w-80 max-w-[85vw]',
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Navigation drawer'}
      className="fixed inset-0 z-50 flex bg-slate-900/45"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={[
          'relative flex h-full flex-col bg-ds-surface shadow-overlay',
          side === 'left' ? 'mr-auto border-r border-ds-border' : 'ml-auto border-l border-ds-border',
          widthClassName,
        ].join(' ')}
      >
        {title && (
          <div className="flex h-14 items-center justify-between border-b border-ds-border px-4">
            <span className="text-sm font-semibold text-ds-ink">{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
