import type { ConnectionStatus } from '@/types'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'

interface ApiStatusBadgeProps {
  status: ConnectionStatus
  version?: string
}

const STATUS_MAP: Record<
  ConnectionStatus,
  { tone: StatusTone; label: string; pulse?: boolean }
> = {
  connected: { tone: 'success', label: 'API connected' },
  connecting: { tone: 'warning', label: 'Connecting…', pulse: true },
  disconnected: { tone: 'error', label: 'API offline' },
}

export function ApiStatusBadge({ status, version }: ApiStatusBadgeProps) {
  const cfg = STATUS_MAP[status]
  return (
    <StatusBadge tone={cfg.tone} dot pulse={cfg.pulse}>
      <span aria-label={`Backend status: ${cfg.label}`}>
        {cfg.label}
        {status === 'connected' && version && (
          <span className="ml-1 opacity-75">v{version}</span>
        )}
      </span>
    </StatusBadge>
  )
}
