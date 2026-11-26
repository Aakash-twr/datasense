import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

describe('Premium Split-Screen LoginPage Redesign', () => {
  const loginMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      currentOrg: null,
      login: loginMock,
    })
  })

  const renderLogin = (initialEntry: string | { pathname: string; state?: unknown } = '/login') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<div>Register Page Route</div>} />
          <Route path="/dashboard" element={<div>Dashboard Workspace</div>} />
        </Routes>
      </MemoryRouter>,
    )

  it('renders split-screen brand panel, DataSense logos, illustrative workspace preview, and centered form', () => {
    renderLogin()

    // Left panel branding
    expect(screen.getByText('One workspace. Every dataset. Clearer insights.')).toBeInTheDocument()
    expect(screen.getByText('Intelligent analytics. Built for better decisions.')).toBeInTheDocument()
    expect(screen.getAllByAltText('DataSense').length).toBeGreaterThanOrEqual(2)

    // Right panel form headings & fields
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to continue to your workspace.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Secure access to your analytics workspace.')).toBeInTheDocument()

    // Registration link works without non-functional forgot-password link
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument()
  })

  it('performs inline email and password validation with accessible attributes', async () => {
    renderLogin()

    // Invalid email format
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email address/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('handles loading state, prevents duplicate submissions, and displays API authentication errors', async () => {
    let rejectLogin!: (reason?: unknown) => void
    loginMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLogin = reject
        }),
    )

    renderLogin('/login?expired=1')

    // Expired session indicator appears when ?expired=1
    expect(
      screen.getByText(/Your session expired\. Sign in again to continue/i),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: 'analyst@acme.com' },
    })
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'wrong-pass-123' },
    })

    const submitBtn = screen.getByRole('button', { name: 'Sign in' })
    fireEvent.click(submitBtn)

    // Loading state disables duplicate submit
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Signing in/i })).toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /Signing in/i }))
    expect(loginMock).toHaveBeenCalledTimes(1)

    // API failure renders accessible inline alert
    rejectLogin(new ApiError(401, 'Invalid email or password.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  it('navigates cleanly to /dashboard after successful sign in', async () => {
    loginMock.mockResolvedValueOnce(undefined)

    renderLogin()

    fireEvent.change(screen.getByLabelText(/Email address/i), {
      target: { value: 'analyst@acme.com' },
    })
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'valid-secret-pw' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: 'analyst@acme.com',
        password: 'valid-secret-pw',
      })
      expect(screen.getByText('Dashboard Workspace')).toBeInTheDocument()
    })
  })
})
