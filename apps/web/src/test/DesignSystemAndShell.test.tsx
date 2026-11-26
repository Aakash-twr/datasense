import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import {
  Button,
  Input,
  Select,
  Dropdown,
  DropdownItem,
  Modal,
  Drawer,
  Tabs,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  StatusBadge,
  PageHeader,
  Breadcrumbs,
  StatCard,
  Skeleton,
  ErrorState,
  ConfirmDialog,
  ToastProvider,
  useToast,
} from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    status: 'connected' as const,
    health: {
      status: 'ok',
      service: 'datasense-api',
      version: '0.7.0',
      environment: 'development',
      timestamp: new Date().toISOString(),
      python_version: '3.13.2',
    },
    error: null,
    lastChecked: new Date(),
    refresh: vi.fn(),
  }),
}))

function ToastTrigger() {
  const { notify } = useToast()
  return (
    <Button onClick={() => notify({ tone: 'success', title: 'Saved changes' })}>
      Notify
    </Button>
  )
}

describe('Stage 1 Design System & Reusable Components', () => {
  it('renders buttons, inputs, selects, tabs, table, status badge, skeletons, and KPI cards', () => {
    const onTabChange = vi.fn()
    render(
      <MemoryRouter>
        <div>
          <PageHeader
            title="Workspace Overview"
            description="Monitor datasets and workflows"
            breadcrumbs={[{ label: 'Workspace', href: '/dashboard' }, { label: 'Overview' }]}
            badge={<StatusBadge tone="success" dot>Active</StatusBadge>}
            actions={<Button variant="primary">Create</Button>}
          />
          <Input label="Dataset Name" placeholder="sales.csv" />
          <Select
            label="Source Format"
            options={[{ value: 'csv', label: 'CSV' }, { value: 'parquet', label: 'Parquet' }]}
          />
          <Tabs
            items={[{ id: 'a', label: 'Results', badge: 3 }, { id: 'b', label: 'History' }]}
            value="a"
            onChange={onTabChange}
          />
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Table</TableHeaderCell>
                  <TableHeaderCell>Rows</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow interactive>
                  <TableCell>orders</TableCell>
                  <TableCell>1,200</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <StatCard label="Projects" value={4} delta={{ value: '+12%', positive: true }} />
          <Skeleton className="h-4 w-24" />
          <ErrorState title="Query Error" message="Syntax issue" onRetry={() => {}} />
        </div>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Workspace Overview' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByLabelText('Dataset Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Source Format')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
    expect(screen.getByText('+12%')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Syntax issue')

    fireEvent.click(screen.getByRole('tab', { name: /History/i }))
    expect(onTabChange).toHaveBeenCalledWith('b')
  })

  it('supports Dropdown, Modal, Drawer, ConfirmDialog, Breadcrumbs, and Toast notifications', () => {
    const onConfirm = vi.fn()
    render(
      <MemoryRouter>
        <ToastProvider>
          <Breadcrumbs items={[{ label: 'Analytics', href: '/analytics' }, { label: 'SQL' }]} />
          <Dropdown trigger={<span>Menu</span>}>
            <DropdownItem onClick={() => {}}>Action One</DropdownItem>
          </Dropdown>
          <Modal open={true} onClose={() => {}} title="Inspect Schema">
            <p>Modal body</p>
          </Modal>
          <Drawer open={true} onClose={() => {}} title="Details Drawer">
            <p>Drawer body</p>
          </Drawer>
          <ConfirmDialog
            open={true}
            title="Archive Project"
            description="Proceed?"
            onConfirm={onConfirm}
            onCancel={() => {}}
          />
          <ToastTrigger />
        </ToastProvider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Menu'))
    expect(screen.getByRole('menuitem', { name: 'Action One' })).toBeInTheDocument()
    expect(screen.getByText('Modal body')).toBeInTheDocument()
    expect(screen.getByText('Drawer body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Notify' }))
    expect(screen.getByText('Saved changes')).toBeInTheDocument()
  })
})

describe('Stage 1 Application Shell (Sidebar, TopBar, Mobile Drawer)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: 'u-1',
        name: 'Alice Analyst',
        email: 'alice@example.com',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      currentOrg: {
        organization_id: 'org-1',
        organization_name: 'Acme Enterprise',
        organization_slug: 'acme',
        role: 'owner',
      },
      logout: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders grouped sidebar sections, active states, breadcrumbs, and collapsible sidebar', () => {
    render(
      <MemoryRouter initialEntries={['/analytics?tab=history']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/analytics" element={<div>Analytics Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const primaryNav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(primaryNav).getByText('Workspace')).toBeInTheDocument()
    expect(within(primaryNav).getByText('Analytics')).toBeInTheDocument()
    expect(within(primaryNav).getByText('Management')).toBeInTheDocument()
    expect(within(primaryNav).getByText('System')).toBeInTheDocument()

    const historyLink = within(primaryNav).getByRole('link', { name: 'Query History' })
    expect(historyLink).toHaveAttribute('aria-current', 'page')

    // Breadcrumb reflects Management > Query History
    const breadcrumbNav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(breadcrumbNav).toHaveTextContent('Management')
    expect(breadcrumbNav).toHaveTextContent('Query History')

    // Org context & no decorative Search button
    expect(screen.getAllByText('Acme Enterprise').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: /Search \(coming soon\)/i })).not.toBeInTheDocument()

    // Collapse & expand sidebar
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(window.localStorage.getItem('datasense_sidebar_collapsed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()

    // Profile dropdown menu opens and offers Settings / Help / Sign out
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }))
    expect(screen.getByRole('menuitem', { name: /Profile & Settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Platform Help/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toBeInTheDocument()
  })

  it('opens HelpModal from Sidebar System -> Help button and supports mobile drawer', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('DataSense Platform Guide')
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(screen.getByRole('dialog', { name: 'Navigation drawer' })).toBeInTheDocument()
  })
})
