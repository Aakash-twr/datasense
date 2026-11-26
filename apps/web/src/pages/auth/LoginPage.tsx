import React, { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { LoginWorkspaceIllustration } from '@/components/auth/LoginWorkspaceIllustration'
import { BrandLogo } from '@/components/common/BrandLogo'
import { ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { login, isAuthenticated } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    const from =
      (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/dashboard'
    return <Navigate to={from} replace />
  }

  const sessionExpired =
    searchParams.get('expired') === '1' ||
    Boolean((location.state as { sessionExpired?: boolean } | null)?.sessionExpired)

  const validateFields = (): boolean => {
    const trimmedEmail = email.trim()
    let valid = true

    if (!trimmedEmail && !password) {
      setError('Please fill in both email and password.')
      setEmailError('Email address is required.')
      setPasswordError('Password is required.')
      return false
    }

    if (!trimmedEmail) {
      setEmailError('Email address is required.')
      valid = false
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError('Enter a valid email address.')
      valid = false
    } else {
      setEmailError(null)
    }

    if (!password) {
      setPasswordError('Password is required.')
      valid = false
    } else {
      setPasswordError(null)
    }

    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    setError(null)
    if (!validateFields()) {
      return
    }

    setIsSubmitting(true)
    try {
      await login({ email: email.trim(), password })
      const from =
        (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/dashboard'
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || 'Invalid email or password.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#F7F9FC] lg:flex-row">
      {/* Mobile Compact Brand Header (<lg) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#E2E8F0] bg-white/90 px-5 py-3.5 backdrop-blur-md lg:hidden">
        <BrandLogo variant="wordmark" className="h-6 w-auto" alt="DataSense" />
        <span className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#64748B]">
          Analytics Workspace
        </span>
      </header>

      {/* Left Panel: Architectural Brand & Product Showcase (45% Desktop) */}
      <section
        aria-label="DataSense platform overview"
        className="relative hidden overflow-hidden bg-gradient-to-br from-[#0D192B] via-[#14243D] to-[#172A45] px-10 py-9 text-white lg:flex lg:w-[45%] lg:flex-col lg:justify-between xl:px-14 xl:py-11"
      >
        {/* Architectural coordinate grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.075] [background-image:linear-gradient(to_right,rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_85%_75%_at_50%_45%,black_35%,transparent_100%)]"
        />

        {/* Soft atmospheric cobalt + analytical teal radial spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_56%,rgba(53,106,230,0.22),rgba(21,154,149,0.09)_42%,transparent_72%)]"
        />

        {/* Top Brand Row */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white shadow-[0_6px_18px_rgba(2,6,23,0.45)] ring-1 ring-white/25">
              <BrandLogo
                variant="mark"
                className="h-full w-full scale-[1.52] object-contain"
                alt="DataSense"
              />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[18px] font-semibold tracking-[-0.02em] text-white">
                DataSense
              </span>
              <span className="hidden text-xs font-medium text-slate-400 xl:inline">
                Analytics Cloud
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#159A95]" />
            Multi-Agent SQL
          </span>
        </div>

        {/* Center Headline & Layered Studio Preview */}
        <div className="relative z-10 my-8 max-w-[520px] space-y-7">
          <div className="space-y-3">
            <h2 className="text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-white xl:text-[36px]">
              Turn data into{' '}
              <span className="bg-gradient-to-r from-[#93C5FD] to-[#5EEAD4] bg-clip-text text-transparent">
                decisions.
              </span>
            </h2>
            <p className="max-w-md text-[15px] leading-relaxed text-slate-300/90">
              One workspace. Every dataset. Clearer insights.
            </p>
          </div>

          <LoginWorkspaceIllustration />
        </div>

        {/* Bottom Supporting Identity */}
        <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
          <p className="text-xs font-medium text-slate-300/90">
            Intelligent analytics. Built for better decisions.
          </p>
          <div className="hidden items-center gap-2 text-[11px] font-medium text-slate-400 xl:flex">
            <span>DuckDB</span>
            <span className="text-slate-600">/</span>
            <span>AI Copilot</span>
            <span className="text-slate-600">/</span>
            <span>Workflows</span>
          </div>
        </div>
      </section>

      {/* Right Panel: Elevated Centered Login Surface (55% Desktop) */}
      <main className="relative flex flex-1 items-center justify-center bg-[#F7F9FC] px-4 py-10 sm:px-8 lg:w-[55%]">
        {/* Subtle daylight radial wash + hairline dot texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_50%_0%,rgba(53,106,230,0.065),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_65%_at_50%_50%,black_25%,transparent_100%)]"
        />

        <div className="relative z-10 w-full max-w-[420px] space-y-5">
          <p className="sr-only">Sign in to DataSense</p>

          {/* Session Expired Notice */}
          {sessionExpired && !error && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3 text-xs text-[#92400E] shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D99A2B]" aria-hidden="true" />
              <span>Your session expired. Sign in again to continue to your workspace.</span>
            </div>
          )}

          {/* Authentication Error Alert */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-xs text-[#D84C59] shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-medium leading-snug">{error}</span>
            </div>
          )}

          {/* Elevated Form Card */}
          <div className="relative overflow-hidden rounded-2xl border border-[#E2E8F0]/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(20,36,61,0.09)]">
            {/* Subtle Cobalt-to-Teal Hairline Accent */}
            <div
              aria-hidden="true"
              className="h-[3px] w-full bg-gradient-to-r from-[#356AE6] via-[#159A95] to-[#356AE6]/70"
            />

            <div className="p-7 sm:p-9">
              <div className="mb-7">
                <div className="mb-5 hidden lg:block">
                  <BrandLogo variant="wordmark" className="h-7 w-auto" alt="DataSense" />
                </div>
                <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-[#172033]">
                  Welcome back
                </h1>
                <p className="mt-1.5 text-[13px] text-[#64748B]">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-[#172033]">
                    Email address
                  </label>
                  <div className="group relative mt-1.5">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8] transition-colors group-focus-within:text-[#356AE6]"
                    />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={emailError ? 'email-error' : undefined}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (emailError) setEmailError(null)
                        if (error) setError(null)
                      }}
                      placeholder="you@company.com"
                      className={[
                        'block h-11 w-full rounded-[10px] border bg-[#F8FAFC]/70 pl-10 pr-3.5 text-sm text-[#172033] placeholder-[#94A3B8] transition-all duration-150 focus:bg-white focus:outline-none focus:ring-4',
                        emailError
                          ? 'border-[#D84C59] focus:border-[#D84C59] focus:ring-[#D84C59]/12'
                          : 'border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#356AE6] focus:ring-[#356AE6]/10',
                      ].join(' ')}
                    />
                  </div>
                  {emailError && (
                    <p id="email-error" className="mt-1.5 text-[11px] font-medium text-[#D84C59]">
                      {emailError}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-[#172033]">
                    Password
                  </label>
                  <div className="group relative mt-1.5">
                    <KeyRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8] transition-colors group-focus-within:text-[#356AE6]"
                    />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby={passwordError ? 'password-error' : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (passwordError) setPasswordError(null)
                        if (error) setError(null)
                      }}
                      placeholder="••••••••"
                      className={[
                        'block h-11 w-full rounded-[10px] border bg-[#F8FAFC]/70 pl-10 pr-11 text-sm text-[#172033] placeholder-[#94A3B8] transition-all duration-150 focus:bg-white focus:outline-none focus:ring-4',
                        passwordError
                          ? 'border-[#D84C59] focus:border-[#D84C59] focus:ring-[#D84C59]/12'
                          : 'border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#356AE6] focus:ring-[#356AE6]/10',
                      ].join(' ')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-slate-100 hover:text-[#172033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#356AE6]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p
                      id="password-error"
                      className="mt-1.5 text-[11px] font-medium text-[#D84C59]"
                    >
                      {passwordError}
                    </p>
                  )}
                </div>

                {/* Primary Submit CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-b from-[#3B71EE] to-[#2E60D8] px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(20,36,61,0.18)] transition-all duration-150 hover:from-[#3367E3] hover:to-[#2754C4] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_16px_rgba(53,106,230,0.28)] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#356AE6] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign in</span>
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Registration Link */}
              <div className="mt-7 border-t border-[#EDF2F7] pt-5 text-center text-xs text-[#64748B]">
                New to DataSense?{' '}
                <Link
                  to="/register"
                  className="font-semibold text-[#356AE6] transition-colors hover:text-[#2956C4] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#356AE6]"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>

          {/* Unobtrusive Security Footnote */}
          <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-[#64748B]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#159A95]" aria-hidden="true" />
            <span>Secure access to your analytics workspace.</span>
          </p>
        </div>
      </main>
    </div>
  )
}
