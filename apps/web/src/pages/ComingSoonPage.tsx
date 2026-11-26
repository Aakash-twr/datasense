import { Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '@/components/ui'

interface ComingSoonPageProps {
  title: string
  phase: string
  description: string
}

export function ComingSoonPage({ title, phase, description }: ComingSoonPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-ds-lg bg-ds-primary-soft text-ds-primary">
        <Clock className="h-6 w-6" aria-hidden="true" />
      </div>
      <StatusBadge tone="primary">Coming in {phase}</StatusBadge>
      <h1 className="mt-3 text-xl font-semibold text-ds-ink">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-ds-secondary">{description}</p>
      <Link to="/dashboard" className="btn-secondary mt-6 text-xs">
        ← Back to Overview
      </Link>
    </div>
  )
}
