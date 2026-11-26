import { useCallback, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { ToastContext, type ToastMessage, type ToastTone } from './useToast'

const ICON_MAP = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'border-ds-border bg-ds-surface text-ds-primary',
  success: 'border-[var(--ds-success-border)] bg-ds-surface text-ds-success',
  warning: 'border-[var(--ds-warning-border)] bg-ds-surface text-ds-warning',
  error: 'border-[var(--ds-error-border)] bg-ds-surface text-ds-error',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback(
    (toast: Omit<ToastMessage, 'id'>, durationMs = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }])
      if (durationMs > 0) {
        window.setTimeout(() => {
          dismiss(id)
        }, durationMs)
      }
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((item) => {
          const Icon = ICON_MAP[item.tone]
          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-ds-lg border p-3.5 shadow-overlay ${TONE_CLASSES[item.tone]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ds-ink">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-ds-secondary">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="rounded-ds-sm p-0.5 text-ds-subtle hover:bg-ds-muted hover:text-ds-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
