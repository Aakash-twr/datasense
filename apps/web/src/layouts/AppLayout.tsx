import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { HelpModal } from '@/components/common/HelpModal'
import { Sidebar, SidebarNavContent } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { Drawer } from '@/components/ui/Drawer'

const SIDEBAR_COLLAPSED_KEY = 'datasense_sidebar_collapsed'

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const handleToggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        // Ignore storage restrictions
      }
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ds-bg text-ds-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-ds focus:bg-ds-primary focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      {/* Desktop Collapsible Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Mobile Navigation Drawer */}
      <Drawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        side="left"
        widthClassName="w-64"
      >
        <SidebarNavContent
          collapsed={false}
          showCollapseToggle={false}
          onNavigate={() => setMobileMenuOpen(false)}
          onOpenHelp={() => setHelpOpen(true)}
        />
      </Drawer>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 focus:outline-none"
        >
          <Outlet />
        </main>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
