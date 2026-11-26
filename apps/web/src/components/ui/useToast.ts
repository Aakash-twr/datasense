import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

export interface ToastContextValue {
  notify: (toast: Omit<ToastMessage, 'id'>, durationMs?: number) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      notify: () => {},
      dismiss: () => {},
    }
  }
  return ctx
}
