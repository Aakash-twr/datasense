import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuthStore } from '@/stores/authStore'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-ds-bg">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo variant="mark" className="h-12 w-12 rounded-ds-lg" alt="DataSense" />
          <div className="flex items-center gap-2 text-xs font-medium text-ds-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ds-primary" aria-hidden="true" />
            <span>Restoring session…</span>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
