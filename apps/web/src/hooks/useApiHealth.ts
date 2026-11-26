import { useState, useEffect, useCallback } from 'react'
import type { ConnectionStatus, HealthResponse } from '@/types'
import { apiService } from '@/services/api'

const POLL_INTERVAL_MS = 30_000

interface UseApiHealthResult {
  status: ConnectionStatus
  health: HealthResponse | null
  error: string | null
  lastChecked: Date | null
  refresh: () => void
}

export function useApiHealth(): UseApiHealthResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const check = useCallback(async () => {
    setStatus('connecting')
    try {
      const data = await apiService.getHealth()
      setHealth(data)
      setStatus('connected')
      setError(null)
    } catch (err) {
      setStatus('disconnected')
      setHealth(null)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLastChecked(new Date())
    }
  }, [])

  useEffect(() => {
    void check()
    const interval = setInterval(() => { void check() }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [check])

  return { status, health, error, lastChecked, refresh: check }
}
