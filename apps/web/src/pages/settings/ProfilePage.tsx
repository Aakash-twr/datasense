import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Cpu,
  Lock,
  LogOut,
  Shield,
  ShieldCheck,
  Sliders,
  User as UserIcon,
} from 'lucide-react'
import { Button, PageHeader, StatusBadge } from '@/components/ui'
import { useToast } from '@/components/ui/useToast'
import { ApiError, apiService } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { AIStatusResponse, OrganizationWithRole } from '@/types'

type SettingsSection =
  | 'profile'
  | 'security'
  | 'preferences'
  | 'ai'
  | 'privacy'
  | 'workspace'

const ROW_LIMIT_KEY = 'datasense_default_row_limit'
const ONBOARDING_KEY = 'datasense_onboarding_dismissed'

export function ProfilePage() {
  const { section } = useParams<{ section?: string }>()
  const { user, currentOrg, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const { notify } = useToast()

  const validSections: SettingsSection[] = [
    'profile',
    'security',
    'preferences',
    'ai',
    'privacy',
    'workspace',
  ]
  const initialSection: SettingsSection =
    section && validSections.includes(section as SettingsSection)
      ? (section as SettingsSection)
      : 'profile'

  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)

  // Profile form state
  const [name, setName] = useState(user?.name || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  // Preferences state (persisted locally)
  const [defaultRowLimit, setDefaultRowLimit] = useState<string>(() => {
    try {
      return window.localStorage.getItem(ROW_LIMIT_KEY) || '1000'
    } catch {
      return '1000'
    }
  })
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_KEY) !== 'true'
    } catch {
      return true
    }
  })

  // AI & Privacy real backend state
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null)
  const [isLoadingAiStatus, setIsLoadingAiStatus] = useState(false)
  const [isAckSaving, setIsAckSaving] = useState(false)

  // Workspace Settings state
  const [orgDetails, setOrgDetails] = useState<OrganizationWithRole | null>(null)
  const [orgNameInput, setOrgNameInput] = useState(currentOrg?.organization_name || '')
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [workspaceFeedback, setWorkspaceFeedback] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const canManageWorkspace = currentOrg?.role === 'owner' || currentOrg?.role === 'admin'

  useEffect(() => {
    if (user) {
      setName(user.name)
      setAvatarUrl(user.avatar_url || '')
    }
  }, [user])

  useEffect(() => {
    if (currentOrg) {
      setOrgNameInput(currentOrg.organization_name)
    }
  }, [currentOrg])

  useEffect(() => {
    setIsLoadingAiStatus(true)
    apiService.ai
      ?.getStatus()
      .then(setAiStatus)
      .catch(() => {})
      .finally(() => setIsLoadingAiStatus(false))

    if (apiService.organizations?.getCurrent) {
      apiService.organizations
        .getCurrent(currentOrg?.organization_id)
        .then((org) => {
          setOrgDetails(org)
          setOrgNameInput(org.name)
        })
        .catch(() => {})
    }
  }, [currentOrg?.organization_id])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setProfileFeedback({ text: 'Full Name is required.', type: 'error' })
      return
    }
    if (avatarUrl.trim() && !/^https?:\/\//i.test(avatarUrl.trim())) {
      setProfileFeedback({
        text: 'Avatar URL must start with http:// or https://.',
        type: 'error',
      })
      return
    }

    setIsSavingProfile(true)
    setProfileFeedback(null)
    try {
      const updated = await apiService.auth.updateProfile({
        name: name.trim(),
        avatar_url: avatarUrl.trim() || null,
      })
      updateUser(updated)
      setProfileFeedback({ text: 'Profile updated successfully.', type: 'success' })
      notify({ tone: 'success', title: 'Profile updated' })
    } catch (err) {
      setProfileFeedback({
        text: err instanceof ApiError ? err.detail : 'Failed to update profile.',
        type: 'error',
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      window.localStorage.setItem(ROW_LIMIT_KEY, defaultRowLimit)
      window.localStorage.setItem(ONBOARDING_KEY, showOnboardingChecklist ? 'false' : 'true')
      notify({ tone: 'success', title: 'Workspace preferences saved' })
    } catch {
      notify({ tone: 'error', title: 'Could not persist preferences in local storage.' })
    }
  }

  const handleAcknowledgePrivacy = async () => {
    setIsAckSaving(true)
    try {
      await apiService.ai.acknowledgePrivacy()
      setAiStatus((prev) => (prev ? { ...prev, privacy_acknowledged: true } : prev))
      notify({ tone: 'success', title: 'AI Privacy disclosure acknowledged' })
    } catch (err) {
      notify({
        tone: 'error',
        title: err instanceof ApiError ? err.detail : 'Failed to save privacy acknowledgment.',
      })
    } finally {
      setIsAckSaving(false)
    }
  }

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageWorkspace) return
    if (!orgNameInput.trim()) {
      setWorkspaceFeedback({ text: 'Organization name is required.', type: 'error' })
      return
    }

    setIsSavingWorkspace(true)
    setWorkspaceFeedback(null)
    try {
      const updated = await apiService.organizations.updateCurrent(
        { name: orgNameInput.trim() },
        currentOrg?.organization_id,
      )
      setOrgDetails(updated)
      setWorkspaceFeedback({ text: 'Workspace settings saved.', type: 'success' })
      notify({ tone: 'success', title: 'Workspace name updated' })
    } catch (err) {
      setWorkspaceFeedback({
        text: err instanceof ApiError ? err.detail : 'Failed to update workspace settings.',
        type: 'error',
      })
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  const navGroups: {
    group: string
    items: {
      id: SettingsSection
      label: string
      icon: React.ComponentType<{ className?: string }>
    }[]
  }[] = [
    {
      group: 'Personal Settings',
      items: [
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'security', label: 'Account Security', icon: Lock },
        { id: 'preferences', label: 'Preferences', icon: Sliders },
      ],
    },
    {
      group: 'Platform & Governance',
      items: [
        { id: 'ai', label: 'AI Settings', icon: Cpu },
        { id: 'privacy', label: 'Privacy', icon: Shield },
      ],
    },
    {
      group: 'Organization',
      items: [{ id: 'workspace', label: 'Workspace Settings', icon: Building2 }],
    },
  ]

  const initials = (user?.name || user?.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      <PageHeader
        title="Settings & Profile"
        description="Manage personal profile details, account security, workspace configuration, AI status, and privacy controls."
      />

      <div className="grid grid-cols-1 overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs lg:grid-cols-12">
        {/* Left Grouped Navigation */}
        <aside
          aria-label="Settings navigation"
          className="border-b border-ds-border bg-ds-surface2 p-4 lg:col-span-3 lg:border-b-0 lg:border-r"
        >
          <div className="space-y-5">
            {navGroups.map((grp) => (
              <div key={grp.group} className="space-y-1">
                <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-ds-subtle">
                  {grp.group}
                </p>
                <nav className="space-y-0.5">
                  {grp.items.map((item) => {
                    const Icon = item.icon
                    const active = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={[
                          'flex w-full items-center gap-2.5 rounded-ds-sm px-2.5 py-2 text-left text-xs font-medium transition-colors',
                          active
                            ? 'bg-ds-surface text-ds-ink shadow-xs ring-1 ring-ds-border'
                            : 'text-ds-secondary hover:bg-ds-muted/60 hover:text-ds-ink',
                        ].join(' ')}
                      >
                        <Icon
                          className={[
                            'h-4 w-4 shrink-0',
                            active ? 'text-ds-primary' : 'text-ds-subtle',
                          ].join(' ')}
                        />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Section Content */}
        <div className="p-6 lg:col-span-9">
          {activeSection === 'profile' && (
            <section aria-label="Profile settings" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">Profile</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Personal identity details associated with your DataSense account.
                </p>
              </div>

              {profileFeedback && (
                <div
                  role="alert"
                  className={[
                    'flex items-center gap-2 rounded-ds-md border p-3 text-xs',
                    profileFeedback.type === 'success'
                      ? 'border-[var(--ds-success-border)] bg-ds-success-soft text-ds-success'
                      : 'border-[var(--ds-error-border)] bg-ds-error-soft text-ds-error',
                  ].join(' ')}
                >
                  {profileFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{profileFeedback.text}</span>
                </div>
              )}

              {/* Identity Header */}
              <div className="flex items-center gap-4 rounded-ds-md border border-ds-border-subtle bg-ds-surface2 p-4">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user?.name || 'Profile avatar'}
                    className="h-12 w-12 rounded-full border border-ds-border object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-primary-soft text-sm font-semibold text-ds-primary">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ds-ink">
                    {user?.name || 'DataSense Member'}
                  </p>
                  <p className="truncate text-xs text-ds-secondary">{user?.email}</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label
                    htmlFor="profile-full-name"
                    className="block text-xs font-medium text-ds-ink"
                  >
                    Full Name
                  </label>
                  <input
                    id="profile-full-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-email"
                    className="block text-xs font-medium text-ds-ink"
                  >
                    Email Address
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="mt-1.5 block w-full cursor-not-allowed rounded-ds-sm border border-ds-border-subtle bg-ds-surface2 px-3 py-2 text-xs text-ds-secondary"
                  />
                  <p className="mt-1 text-[11px] text-ds-subtle">
                    Managed organization login email.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="profile-avatar-url"
                    className="block text-xs font-medium text-ds-ink"
                  >
                    Avatar URL (Optional)
                  </label>
                  <input
                    id="profile-avatar-url"
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
                  />
                </div>

                <Button type="submit" variant="primary" size="md" loading={isSavingProfile}>
                  Save Changes
                </Button>
              </form>
            </section>
          )}

          {activeSection === 'security' && (
            <section aria-label="Account security" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">Account Security</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Authentication status, account lifecycle metadata, and active session controls.
                </p>
              </div>

              <div className="divide-y divide-ds-border-subtle rounded-ds-md border border-ds-border bg-ds-surface2">
                <div className="flex items-center justify-between p-4 text-xs">
                  <div>
                    <p className="font-semibold text-ds-ink">Account Status</p>
                    <p className="text-ds-secondary">Active multi-tenant membership state</p>
                  </div>
                  <StatusBadge tone={user?.is_active !== false ? 'success' : 'error'} dot>
                    {user?.is_active !== false ? 'Active' : 'Disabled'}
                  </StatusBadge>
                </div>

                <div className="flex items-center justify-between p-4 text-xs">
                  <div>
                    <p className="font-semibold text-ds-ink">Session Protection</p>
                    <p className="text-ds-secondary">
                      In-memory bearer token with HttpOnly rotating refresh cookie
                    </p>
                  </div>
                  <StatusBadge tone="primary">Protected</StatusBadge>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 text-xs">
                  <div>
                    <span className="block text-[11px] text-ds-subtle">Account Created</span>
                    <span className="mt-0.5 block font-mono text-ds-ink tabular-nums">
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-ds-subtle">Profile Last Updated</span>
                    <span className="mt-0.5 block font-mono text-ds-ink tabular-nums">
                      {user?.updated_at ? new Date(user.updated_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-ds-md border border-ds-border p-4 text-xs">
                <div>
                  <p className="font-semibold text-ds-ink">Sign Out</p>
                  <p className="text-ds-secondary">
                    Revoke your active browser session and return to sign-in.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void handleSignOut()}
                  leftIcon={<LogOut className="h-3.5 w-3.5" />}
                >
                  Sign Out
                </Button>
              </div>
            </section>
          )}

          {activeSection === 'preferences' && (
            <section aria-label="User preferences" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">Preferences</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Customize workspace defaults and onboarding behavior stored in this browser.
                </p>
              </div>

              <form onSubmit={handleSavePreferences} className="space-y-4">
                <div>
                  <label
                    htmlFor="pref-row-limit"
                    className="block text-xs font-medium text-ds-ink"
                  >
                    Default SQL Result Limit
                  </label>
                  <select
                    id="pref-row-limit"
                    value={defaultRowLimit}
                    onChange={(e) => setDefaultRowLimit(e.target.value)}
                    className="mt-1.5 block w-full max-w-xs rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
                  >
                    <option value="100">100 rows</option>
                    <option value="500">500 rows</option>
                    <option value="1000">1,000 rows</option>
                    <option value="5000">5,000 rows</option>
                  </select>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-ds-md border border-ds-border bg-ds-surface2 p-3.5 text-xs">
                  <input
                    type="checkbox"
                    checked={showOnboardingChecklist}
                    onChange={(e) => setShowOnboardingChecklist(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                  />
                  <div>
                    <span className="block font-semibold text-ds-ink">
                      Show Quick Start Checklist on Overview
                    </span>
                    <span className="text-ds-secondary">
                      Keep the dismissible DataSense onboarding steps visible on your dashboard.
                    </span>
                  </div>
                </label>

                <Button type="submit" variant="primary" size="md">
                  Save Preferences
                </Button>
              </form>
            </section>
          )}

          {activeSection === 'ai' && (
            <section aria-label="AI settings" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">AI Settings</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Server-managed Google Gemini and LangGraph configuration status.
                </p>
              </div>

              <div className="space-y-3 rounded-ds-md border border-ds-border bg-ds-surface2 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary">LLM Provider</span>
                  <span className="font-semibold text-ds-ink">
                    Google Gemini Developer API (LangChain)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary">Active Model</span>
                  <span className="font-mono font-semibold text-ds-ink">
                    {isLoadingAiStatus ? 'Checking...' : aiStatus?.model || 'Not reported'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary">Service Health</span>
                  <StatusBadge
                    tone={aiStatus?.configured && aiStatus?.available ? 'success' : 'warning'}
                    dot
                  >
                    {aiStatus?.configured && aiStatus?.available
                      ? 'Configured & Available'
                      : 'Configuration Required'}
                  </StatusBadge>
                </div>
                {aiStatus?.message && (
                  <p className="border-t border-ds-border-subtle pt-2 text-[11px] text-ds-secondary">
                    {aiStatus.message}
                  </p>
                )}
              </div>
            </section>
          )}

          {activeSection === 'privacy' && (
            <section aria-label="Privacy controls" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">Privacy</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Schema-only AI isolation guarantees and acknowledgment controls.
                </p>
              </div>

              <div className="space-y-3 rounded-ds-md border border-ds-border bg-ds-surface2 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ds-ink">Copilot Privacy Disclosure</span>
                  <StatusBadge
                    tone={aiStatus?.privacy_acknowledged ? 'success' : 'warning'}
                    dot
                  >
                    {aiStatus?.privacy_acknowledged ? 'Acknowledged' : 'Pending Review'}
                  </StatusBadge>
                </div>
                <p className="leading-relaxed text-ds-secondary">
                  Only table names, column names, canonical data types, and summary counts are sent
                  to Gemini for SQL formulation. Raw dataset rows remain isolated in your DuckDB
                  sandbox unless explicitly opted in per Multi-Agent run.
                </p>

                {aiStatus && !aiStatus.privacy_acknowledged && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={isAckSaving}
                      onClick={() => void handleAcknowledgePrivacy()}
                      leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                    >
                      Acknowledge Privacy Notice
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === 'workspace' && (
            <section aria-label="Workspace settings" className="max-w-xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-ds-ink">Workspace Settings</h2>
                <p className="mt-0.5 text-xs text-ds-secondary">
                  Organization tenant identity, role permissions, and workspace metadata.
                </p>
              </div>

              {workspaceFeedback && (
                <div
                  role="alert"
                  className={[
                    'flex items-center gap-2 rounded-ds-md border p-3 text-xs',
                    workspaceFeedback.type === 'success'
                      ? 'border-[var(--ds-success-border)] bg-ds-success-soft text-ds-success'
                      : 'border-[var(--ds-error-border)] bg-ds-error-soft text-ds-error',
                  ].join(' ')}
                >
                  <span>{workspaceFeedback.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 rounded-ds-md border border-ds-border bg-ds-surface2 p-4 text-xs sm:grid-cols-3">
                <div>
                  <span className="block text-[11px] text-ds-subtle">Workspace Slug</span>
                  <span className="mt-0.5 block font-mono font-medium text-ds-ink">
                    {orgDetails?.slug || currentOrg?.organization_slug || '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-ds-subtle">Your Role</span>
                  <span className="mt-1 inline-flex items-center gap-1 font-semibold text-ds-ink capitalize">
                    <ShieldCheck className="h-3.5 w-3.5 text-ds-primary" />
                    {currentOrg?.role || 'member'}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-ds-subtle">Organization ID</span>
                  <span className="mt-0.5 block truncate font-mono text-ds-secondary">
                    {orgDetails?.id || currentOrg?.organization_id || '—'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveWorkspace} className="space-y-4">
                <div>
                  <label
                    htmlFor="workspace-org-name"
                    className="block text-xs font-medium text-ds-ink"
                  >
                    Organization Workspace Name
                  </label>
                  <input
                    id="workspace-org-name"
                    type="text"
                    disabled={!canManageWorkspace}
                    value={orgNameInput}
                    onChange={(e) => setOrgNameInput(e.target.value)}
                    className="mt-1.5 block w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink focus:border-ds-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-ds-surface2 disabled:text-ds-secondary"
                  />
                  {!canManageWorkspace && (
                    <p className="mt-1 text-[11px] text-ds-subtle">
                      Only organization Owners or Admins can rename the workspace.
                    </p>
                  )}
                </div>

                {canManageWorkspace && (
                  <Button type="submit" variant="primary" size="md" loading={isSavingWorkspace}>
                    Save Workspace
                  </Button>
                )}
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
