import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/stores/authStore'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() =>
  import('@/pages/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })),
)
const DataSourcesPage = lazy(() =>
  import('@/pages/datasets/DataSourcesPage').then((m) => ({ default: m.DataSourcesPage })),
)
const DatasetDetailPage = lazy(() =>
  import('@/pages/datasets/DatasetDetailPage').then((m) => ({ default: m.DatasetDetailPage })),
)
const ProfilePage = lazy(() =>
  import('@/pages/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const AnalyticsWorkspacePage = lazy(() =>
  import('@/pages/analytics/AnalyticsWorkspacePage').then((m) => ({
    default: m.AnalyticsWorkspacePage,
  })),
)
const AICopilotWorkspacePage = lazy(() =>
  import('@/pages/ai/AICopilotWorkspacePage').then((m) => ({
    default: m.AICopilotWorkspacePage,
  })),
)
const MultiAgentWorkspacePage = lazy(() =>
  import('@/pages/agents/MultiAgentWorkspacePage').then((m) => ({
    default: m.MultiAgentWorkspacePage,
  })),
)
const ReportsPage = lazy(() =>
  import('@/pages/agents/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const AgentRunsPage = lazy(() =>
  import('@/pages/agents/AgentRunsPage').then((m) => ({ default: m.AgentRunsPage })),
)
const ObservabilityPage = lazy(() =>
  import('@/pages/admin/ObservabilityPage').then((m) => ({ default: m.ObservabilityPage })),
)

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center p-8 text-xs text-gray-500">
      Loading workspace view…
    </div>
  )
}

export default function App() {
  const { initAuth } = useAuthStore()

  useEffect(() => {
    void initAuth()
  }, [initAuth])

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected SaaS Application Shell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
              <Route path="/settings/profile" element={<ProfilePage />} />
              <Route path="/settings/:section" element={<ProfilePage />} />
              <Route path="/data-sources" element={<DataSourcesPage />} />
              <Route path="/datasets/:datasetId" element={<DatasetDetailPage />} />
              <Route path="/projects/:projectId/datasets" element={<DataSourcesPage />} />
              <Route path="/projects/:projectId/analytics" element={<AnalyticsWorkspacePage />} />
              <Route path="/analytics" element={<AnalyticsWorkspacePage />} />
              <Route path="/projects/:projectId/ai-analytics" element={<AICopilotWorkspacePage />} />
              <Route path="/ai-analytics" element={<AICopilotWorkspacePage />} />
              <Route path="/projects/:projectId/agent-analytics" element={<MultiAgentWorkspacePage />} />
              <Route path="/agent-analytics" element={<MultiAgentWorkspacePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:reportId" element={<ReportsPage />} />
              <Route path="/agent-runs" element={<AgentRunsPage />} />
              <Route path="/admin/observability" element={<ObservabilityPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  )
}
