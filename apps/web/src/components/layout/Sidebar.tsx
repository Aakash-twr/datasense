import type { ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  Bookmark,
  Bot,
  Code2,
  Cpu,
  Database,
  FileText,
  FolderKanban,
  HelpCircle,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuthStore } from '@/stores/authStore'

type SidebarNavEntry =
  | {
      id: string
      kind: 'link'
      label: string
      href: string
      icon: ComponentType<{ className?: string }>
    }
  | {
      id: string
      kind: 'action'
      label: string
      icon: ComponentType<{ className?: string }>
      onSelect: 'help'
    }

interface SidebarSection {
  title: string
  items: SidebarNavEntry[]
}

function isRouteActive(id: string, pathname: string, search: string): boolean {
  const tab = new URLSearchParams(search).get('tab')

  switch (id) {
    case 'overview':
      return pathname === '/dashboard' || pathname === '/'
    case 'projects':
      return (
        pathname === '/projects' ||
        (pathname.startsWith('/projects/') &&
          !pathname.endsWith('/datasets') &&
          !pathname.endsWith('/analytics') &&
          !pathname.endsWith('/ai-analytics') &&
          !pathname.endsWith('/agent-analytics'))
      )
    case 'data-sources':
      return (
        pathname === '/data-sources' ||
        pathname.startsWith('/datasets/') ||
        pathname.endsWith('/datasets')
      )
    case 'sql-analytics':
      return (
        (pathname === '/analytics' || pathname.endsWith('/analytics')) &&
        tab !== 'history' &&
        tab !== 'saved'
      )
    case 'ai-copilot':
      return pathname === '/ai-analytics' || pathname.endsWith('/ai-analytics')
    case 'multi-agent':
      return pathname === '/agent-analytics' || pathname.endsWith('/agent-analytics')
    case 'reports':
      return pathname === '/reports' || pathname.startsWith('/reports/')
    case 'query-history':
      return (
        (pathname === '/analytics' || pathname.endsWith('/analytics')) && tab === 'history'
      )
    case 'saved-queries':
      return (
        (pathname === '/analytics' || pathname.endsWith('/analytics')) && tab === 'saved'
      )
    case 'agent-runs':
      return pathname === '/agent-runs' || pathname.startsWith('/agent-runs/')
    case 'observability':
      return pathname === '/admin/observability'
    case 'settings':
      return pathname.startsWith('/settings')
    default:
      return false
  }
}

export interface SidebarNavContentProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
  onOpenHelp: () => void
  onNavigate?: () => void
  showCollapseToggle?: boolean
}

export function SidebarNavContent({
  collapsed = false,
  onToggleCollapse,
  onOpenHelp,
  onNavigate,
  showCollapseToggle = true,
}: SidebarNavContentProps) {
  const { pathname, search } = useLocation()
  const { currentOrg } = useAuthStore()
  const isAdminOrOwner = currentOrg?.role === 'owner' || currentOrg?.role === 'admin'

  const sections: SidebarSection[] = [
    {
      title: 'Workspace',
      items: [
        { id: 'overview', kind: 'link', label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
        { id: 'projects', kind: 'link', label: 'Projects', href: '/projects', icon: FolderKanban },
        { id: 'data-sources', kind: 'link', label: 'Data Sources', href: '/data-sources', icon: Database },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { id: 'sql-analytics', kind: 'link', label: 'SQL Analytics', href: '/analytics', icon: Code2 },
        { id: 'ai-copilot', kind: 'link', label: 'AI Copilot', href: '/ai-analytics', icon: Sparkles },
        { id: 'multi-agent', kind: 'link', label: 'Multi-Agent Analytics', href: '/agent-analytics', icon: Cpu },
        { id: 'reports', kind: 'link', label: 'Reports', href: '/reports', icon: FileText },
      ],
    },
    {
      title: 'Management',
      items: [
        { id: 'query-history', kind: 'link', label: 'Query History', href: '/analytics?tab=history', icon: History },
        { id: 'saved-queries', kind: 'link', label: 'Saved Queries', href: '/analytics?tab=saved', icon: Bookmark },
        { id: 'agent-runs', kind: 'link', label: 'Agent Runs', href: '/agent-runs', icon: Bot },
      ],
    },
    {
      title: 'System',
      items: [
        ...(isAdminOrOwner
          ? [
              {
                id: 'observability',
                kind: 'link' as const,
                label: 'Observability',
                href: '/admin/observability',
                icon: Activity,
              },
            ]
          : []),
        { id: 'settings', kind: 'link', label: 'Settings', href: '/settings/profile', icon: Settings },
        { id: 'help', kind: 'action', label: 'Help', icon: HelpCircle, onSelect: 'help' },
      ],
    },
  ]

  return (
    <div className="flex h-full flex-col bg-ds-surface">
      {/* Brand Header */}
      <div
        className={[
          'flex h-14 flex-shrink-0 items-center border-b border-ds-border',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        ].join(' ')}
      >
        <Link
          to="/dashboard"
          onClick={onNavigate}
          aria-label="DataSense Home"
          className="flex min-w-0 items-center gap-2 rounded-ds-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary"
        >
          {collapsed ? (
            <BrandLogo variant="mark" className="h-8 w-8 rounded-ds-sm" />
          ) : (
            <div className="min-w-0 space-y-0.5">
              <BrandLogo variant="wordmark" className="h-6 w-auto max-w-[144px]" />
              <span className="block truncate pl-0.5 text-[10px] font-medium leading-none text-ds-secondary">
                {currentOrg?.organization_name || 'Analytics Suite'}
              </span>
            </div>
          )}
        </Link>

        {showCollapseToggle && onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="rounded-ds-sm p-1.5 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Expand control when collapsed */}
      {showCollapseToggle && onToggleCollapse && collapsed && (
        <div className="flex justify-center border-b border-ds-border-subtle py-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="rounded-ds-sm p-1.5 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <nav
        aria-label="Primary navigation"
        className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 space-y-5"
      >
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed ? (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ds-subtle">
                {section.title}
              </p>
            ) : (
              <div className="mx-auto my-2 h-px w-6 bg-ds-border-subtle" aria-hidden="true" />
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.kind === 'link' && isRouteActive(item.id, pathname, search)
                const Icon = item.icon

                const commonClasses = [
                  'group relative flex items-center rounded-ds text-[13px] font-medium transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-2.5 py-2',
                  active
                    ? 'bg-ds-primary-soft text-ds-primary font-semibold'
                    : 'text-ds-secondary hover:bg-ds-muted hover:text-ds-ink',
                ].join(' ')

                const tooltip = collapsed ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none fixed z-50 ml-14 rounded-ds-sm bg-ds-dark px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-overlay transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 whitespace-nowrap"
                  >
                    {item.label}
                  </span>
                ) : null

                if (item.kind === 'link') {
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        onClick={onNavigate}
                        aria-label={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={commonClasses}
                      >
                        {active && !collapsed && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-ds-primary"
                          />
                        )}
                        <Icon
                          className={`h-4 w-4 flex-shrink-0 ${
                            active ? 'text-ds-primary' : 'text-ds-secondary group-hover:text-ds-ink'
                          }`}
                          aria-hidden="true"
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {tooltip}
                      </Link>
                    </li>
                  )
                }

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate?.()
                        if (item.onSelect === 'help') {
                          onOpenHelp()
                        }
                      }}
                      aria-label={collapsed ? item.label : undefined}
                      className={`w-full ${commonClasses}`}
                    >
                      <Icon
                        className="h-4 w-4 flex-shrink-0 text-ds-secondary group-hover:text-ds-ink"
                        aria-hidden="true"
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {tooltip}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}

export interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenHelp: () => void
}

export function Sidebar({ collapsed, onToggleCollapse, onOpenHelp }: SidebarProps) {
  return (
    <aside
      className={[
        'hidden lg:flex flex-shrink-0 flex-col border-r border-ds-border bg-ds-surface transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-60',
      ].join(' ')}
    >
      <SidebarNavContent
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onOpenHelp={onOpenHelp}
        showCollapseToggle={true}
      />
    </aside>
  )
}
