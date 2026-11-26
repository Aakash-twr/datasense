import { useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  Building2,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  User as UserIcon,
} from 'lucide-react'
import { ApiStatusBadge } from '@/components/common/ApiStatusBadge'
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/Breadcrumbs'
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown'
import { useApiHealth } from '@/hooks/useApiHealth'
import { useAuthStore } from '@/stores/authStore'

function buildBreadcrumbs(pathname: string, search: string): BreadcrumbItem[] {
  const tab = new URLSearchParams(search).get('tab')

  if (pathname === '/dashboard' || pathname === '/') {
    return [{ label: 'Workspace', href: '/dashboard' }, { label: 'Overview' }]
  }
  if (pathname === '/projects') {
    return [{ label: 'Workspace', href: '/dashboard' }, { label: 'Projects' }]
  }
  if (pathname.startsWith('/projects/')) {
    if (pathname.endsWith('/datasets')) {
      return [
        { label: 'Projects', href: '/projects' },
        { label: 'Data Sources' },
      ]
    }
    if (pathname.endsWith('/analytics')) {
      if (tab === 'history') {
        return [{ label: 'Projects', href: '/projects' }, { label: 'Query History' }]
      }
      if (tab === 'saved') {
        return [{ label: 'Projects', href: '/projects' }, { label: 'Saved Queries' }]
      }
      return [{ label: 'Projects', href: '/projects' }, { label: 'SQL Analytics' }]
    }
    if (pathname.endsWith('/ai-analytics')) {
      return [{ label: 'Projects', href: '/projects' }, { label: 'AI Copilot' }]
    }
    if (pathname.endsWith('/agent-analytics')) {
      return [{ label: 'Projects', href: '/projects' }, { label: 'Multi-Agent Analytics' }]
    }
    return [{ label: 'Projects', href: '/projects' }, { label: 'Project Details' }]
  }
  if (pathname === '/data-sources') {
    return [{ label: 'Workspace', href: '/dashboard' }, { label: 'Data Sources' }]
  }
  if (pathname.startsWith('/datasets/')) {
    return [{ label: 'Data Sources', href: '/data-sources' }, { label: 'Dataset Details' }]
  }
  if (pathname === '/analytics') {
    if (tab === 'history') {
      return [{ label: 'Management', href: '/analytics' }, { label: 'Query History' }]
    }
    if (tab === 'saved') {
      return [{ label: 'Management', href: '/analytics' }, { label: 'Saved Queries' }]
    }
    return [{ label: 'Analytics', href: '/dashboard' }, { label: 'SQL Analytics' }]
  }
  if (pathname === '/ai-analytics') {
    return [{ label: 'Analytics', href: '/dashboard' }, { label: 'AI Copilot' }]
  }
  if (pathname === '/agent-analytics') {
    return [{ label: 'Analytics', href: '/dashboard' }, { label: 'Multi-Agent Analytics' }]
  }
  if (pathname === '/reports') {
    return [{ label: 'Analytics', href: '/dashboard' }, { label: 'Reports' }]
  }
  if (pathname === '/agent-runs') {
    return [{ label: 'Management', href: '/dashboard' }, { label: 'Agent Runs' }]
  }
  if (pathname === '/admin/observability') {
    return [{ label: 'System', href: '/dashboard' }, { label: 'Observability' }]
  }
  if (pathname.startsWith('/settings')) {
    return [{ label: 'System', href: '/dashboard' }, { label: 'Settings' }]
  }

  return [{ label: 'DataSense' }]
}

export interface TopBarProps {
  onOpenMobileMenu: () => void
  onOpenHelp: () => void
}

export function TopBar({ onOpenMobileMenu, onOpenHelp }: TopBarProps) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user, currentOrg, logout } = useAuthStore()
  const { status, health } = useApiHealth()

  const breadcrumbs = buildBreadcrumbs(pathname, search)
  const isAdminOrOwner = currentOrg?.role === 'owner' || currentOrg?.role === 'admin'

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'DS'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-ds-border bg-ds-surface px-4 sm:px-6">
      {/* Left: Mobile Drawer Toggle & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-ds border border-ds-border bg-ds-surface text-ds-secondary transition-colors hover:bg-ds-surface2 hover:text-ds-ink lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <Breadcrumbs items={breadcrumbs} />
      </div>

      {/* Right: Workspace Context, Health Status, User Menu */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
        {currentOrg && (
          <div
            title={`Active workspace: ${currentOrg.organization_name} (${currentOrg.role})`}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-ds border border-ds-border bg-ds-surface2 px-2.5 py-1 text-xs"
          >
            <Building2 className="h-3.5 w-3.5 text-ds-secondary" aria-hidden="true" />
            <span className="max-w-[140px] truncate font-medium text-ds-ink">
              {currentOrg.organization_name}
            </span>
            <span className="rounded bg-ds-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ds-secondary border border-ds-border-subtle">
              {currentOrg.role}
            </span>
          </div>
        )}

        <div className="hidden md:flex">
          <ApiStatusBadge status={status} version={health?.version} />
        </div>

        <Dropdown
          align="right"
          widthClassName="w-60"
          ariaLabel="Open account menu"
          trigger={(open) => (
            <div className="flex items-center gap-2 rounded-ds border border-ds-border bg-ds-surface px-2 py-1 text-left transition-colors hover:bg-ds-surface2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-ds-sm bg-ds-primary-soft text-[11px] font-semibold text-ds-primary">
                {initials}
              </div>
              <span className="hidden max-w-[110px] truncate text-xs font-medium text-ds-ink sm:inline">
                {user?.name || 'Account'}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-ds-secondary transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </div>
          )}
        >
          {({ close }) => (
            <>
              <div className="px-3 py-2 border-b border-ds-border-subtle">
                <p className="truncate text-xs font-semibold text-ds-ink">
                  {user?.name || 'Workspace Member'}
                </p>
                <p className="truncate text-[11px] text-ds-secondary">{user?.email || ''}</p>
              </div>

              <div className="py-1">
                <DropdownItem
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close()
                    navigate('/settings/profile')
                  }}
                >
                  Profile &amp; Settings
                </DropdownItem>

                {isAdminOrOwner && (
                  <DropdownItem
                    icon={<Activity className="h-3.5 w-3.5" />}
                    onClick={() => {
                      close()
                      navigate('/admin/observability')
                    }}
                  >
                    Observability
                  </DropdownItem>
                )}

                <DropdownItem
                  icon={<Settings className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close()
                    navigate('/projects')
                  }}
                >
                  Workspace Projects
                </DropdownItem>

                <DropdownItem
                  icon={<HelpCircle className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close()
                    onOpenHelp()
                  }}
                >
                  Platform Help
                </DropdownItem>
              </div>

              <DropdownDivider />

              <DropdownItem
                danger
                icon={<LogOut className="h-3.5 w-3.5" />}
                onClick={() => {
                  close()
                  void handleLogout()
                }}
              >
                Sign out
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  )
}
