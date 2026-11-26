import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Button } from '@/components/ui'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export function RegisterPage() {
  const navigate = useNavigate()
  const { register, isAuthenticated } = useAuthStore()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !email.trim() || !password || !orgName.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    setIsSubmitting(true)
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        organization_name: orgName.trim(),
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || 'Registration failed. Please check your information.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ds-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto inline-flex items-center justify-center rounded-ds-lg px-2 py-1">
            <BrandLogo variant="wordmark" className="h-11 w-auto" alt="DataSense Analytics" />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ds-ink">
            Create your account
          </h1>
          <p className="mt-1 text-xs text-ds-secondary">
            Start analyzing your datasets with Gemini &amp; DuckDB
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="flex items-center gap-2.5 rounded-ds-md border border-[var(--ds-error-border)] bg-ds-error-soft p-3.5 text-xs text-ds-error"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-7 shadow-xs">
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-ds-ink">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-ds-ink">
                Work email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
              />
            </div>

            <div>
              <label htmlFor="orgName" className="block text-xs font-medium text-ds-ink">
                Organization / Team name
              </label>
              <input
                id="orgName"
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corp"
                className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-ds-ink">
                Password{' '}
                <span className="font-normal text-ds-subtle">(min 8 characters)</span>
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 pr-10 text-sm text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-ds-subtle transition-colors hover:text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className="mt-1 w-full justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating organization…</span>
                </>
              ) : (
                'Create Account & Workspace'
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-ds-border-subtle pt-5 text-center text-xs text-ds-secondary">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-ds-primary hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
