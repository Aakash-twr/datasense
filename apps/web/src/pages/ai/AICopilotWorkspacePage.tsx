import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Database,
  Loader2,
  MessageSquare,
  PanelRight,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { AIInsightsModal } from '@/components/ai/AIInsightsModal'
import { ConversationSidebar } from '@/components/ai/ConversationSidebar'
import { DatasetContextSidebar } from '@/components/ai/DatasetContextSidebar'
import { MessageBubble } from '@/components/ai/MessageBubble'
import { PrivacyDisclosureModal } from '@/components/ai/PrivacyDisclosureModal'
import { Button, Drawer, SkeletonText, StatusBadge } from '@/components/ui'
import { ApiError, apiService } from '@/services/api'
import type {
  AIConversationDetails,
  AIConversationListItem,
  AIInsightResponse,
  AIMessageItem,
  AIStatusResponse,
  CatalogResponse,
  Project,
} from '@/types'

const EXAMPLE_PROMPTS = [
  'What are the top 5 products by total sales?',
  'Show monthly revenue trends over time.',
  'Which customers have placed the most orders?',
  'Find the average order value across categories.',
  'Compare transaction volume by status.',
]

export const AICopilotWorkspacePage: React.FC = () => {
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
  const navigate = useNavigate()

  // Project state
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(routeProjectId || null)

  // AI & Privacy status
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [isPrivacySaving, setIsPrivacySaving] = useState(false)

  // Catalog & Datasets
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([])

  // Conversations
  const [conversations, setConversations] = useState<AIConversationListItem[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<AIConversationDetails | null>(null)
  const [isConversationsLoading, setIsConversationsLoading] = useState(false)
  const [isConversationDetailLoading, setIsConversationDetailLoading] = useState(false)

  // Layout panels & responsive drawers
  const [showContextPanel, setShowContextPanel] = useState(true)
  const [isConversationsDrawerOpen, setIsConversationsDrawerOpen] = useState(false)
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false)

  // Chat input & processing
  const [inputPrompt, setInputPrompt] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Insights Modal
  const [insights, setInsights] = useState<AIInsightResponse[]>([])
  const [isInsightsOpen, setIsInsightsOpen] = useState(false)
  const [isInsightsLoading, setIsInsightsLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 1. Initial Load: Projects & AI Status
  useEffect(() => {
    const init = async () => {
      try {
        const [projRes, statusRes] = await Promise.all([
          apiService.projects.list(),
          apiService.ai.getStatus().catch(() => null),
        ])

        setProjects(projRes.items)
        if (!selectedProjectId && projRes.items.length > 0) {
          setSelectedProjectId(projRes.items[0].id)
        }

        if (statusRes) {
          setAiStatus(statusRes)
          if (!statusRes.privacy_acknowledged) {
            setShowPrivacyModal(true)
          }
        }
      } catch (err) {
        console.error('Failed to initialize AI workspace:', err)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync route projectId
  useEffect(() => {
    if (routeProjectId && routeProjectId !== selectedProjectId) {
      setSelectedProjectId(routeProjectId)
    }
  }, [routeProjectId, selectedProjectId])

  // 2. Load Catalog & Conversations when project changes
  useEffect(() => {
    if (!selectedProjectId) return

    const loadProjectData = async () => {
      setIsConversationsLoading(true)
      try {
        const [catRes, convRes] = await Promise.all([
          apiService.analytics.getCatalog(selectedProjectId).catch(() => null),
          apiService.ai.listConversations(selectedProjectId).catch(() => ({ items: [] })),
        ])

        if (catRes) {
          setCatalog(catRes)
          setSelectedDatasetIds(catRes.datasets.map((d) => d.dataset_id))
        }

        setConversations(convRes.items)

        if (convRes.items.length > 0) {
          setActiveConversationId(convRes.items[0].id)
        } else {
          void handleNewChat(selectedProjectId)
        }
      } catch (err) {
        console.error('Error loading project AI data:', err)
      } finally {
        setIsConversationsLoading(false)
      }
    }

    void loadProjectData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId])

  // 3. Load active conversation details
  useEffect(() => {
    if (!selectedProjectId || !activeConversationId) return

    const loadConversation = async () => {
      setIsConversationDetailLoading(true)
      try {
        const details = await apiService.ai.getConversation(selectedProjectId, activeConversationId)
        setActiveConversation(details)
        if (details.selected_dataset_ids && details.selected_dataset_ids.length > 0) {
          setSelectedDatasetIds(details.selected_dataset_ids)
        }
      } catch (err) {
        console.error('Failed to load conversation details:', err)
      } finally {
        setIsConversationDetailLoading(false)
      }
    }

    void loadConversation()
  }, [selectedProjectId, activeConversationId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [activeConversation?.messages, isSending])

  const selectedDatasetNames = useMemo(() => {
    const map = new Map((catalog?.datasets ?? []).map((d) => [d.dataset_id, d.dataset_name]))
    return selectedDatasetIds.map((id) => map.get(id)).filter(Boolean) as string[]
  }, [catalog, selectedDatasetIds])

  // Handlers
  const handleAcknowledgePrivacy = async () => {
    setIsPrivacySaving(true)
    try {
      await apiService.ai.acknowledgePrivacy()
      setShowPrivacyModal(false)
      if (aiStatus) {
        setAiStatus({ ...aiStatus, privacy_acknowledged: true })
      }
    } catch (err) {
      console.error('Failed to acknowledge privacy notice:', err)
    } finally {
      setIsPrivacySaving(false)
    }
  }

  const handleNewChat = async (targetProjId = selectedProjectId) => {
    if (!targetProjId) return
    try {
      const newConv = await apiService.ai.createConversation(targetProjId, {
        title: 'New Analytics Chat',
        dataset_ids: selectedDatasetIds,
      })
      if (!newConv || !newConv.id) return
      setConversations((prev) => [
        {
          id: newConv.id,
          title: newConv.title,
          selected_dataset_ids: newConv.selected_dataset_ids,
          created_at: newConv.created_at,
          updated_at: newConv.updated_at,
          message_count: 0,
        },
        ...prev,
      ])
      setActiveConversationId(newConv.id)
      setActiveConversation(newConv)
      setChatError(null)
      setIsConversationsDrawerOpen(false)
    } catch (err) {
      console.error('Failed to create new chat:', err)
    }
  }

  const handleDeleteConversation = async (convId: string) => {
    if (!selectedProjectId) return
    try {
      await apiService.ai.deleteConversation(selectedProjectId, convId)
      const remaining = conversations.filter((c) => c.id !== convId)
      setConversations(remaining)
      if (activeConversationId === convId) {
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id)
        } else {
          void handleNewChat()
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }

  const handleToggleDataset = (datasetId: string) => {
    const updated = selectedDatasetIds.includes(datasetId)
      ? selectedDatasetIds.filter((id) => id !== datasetId)
      : [...selectedDatasetIds, datasetId]

    setSelectedDatasetIds(updated)

    if (selectedProjectId && activeConversationId) {
      apiService.ai.updateConversation(selectedProjectId, activeConversationId, {
        dataset_ids: updated,
      })
    }
  }

  const handleSendMessage = async (textToSend = inputPrompt) => {
    const trimmed = textToSend.trim()
    if (!trimmed || isSending || !selectedProjectId || !activeConversationId) return

    setChatError(null)
    setInputPrompt('')
    setIsSending(true)

    const tempUserMsg: AIMessageItem = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }

    if (activeConversation) {
      setActiveConversation({
        ...activeConversation,
        messages: [...activeConversation.messages, tempUserMsg],
      })
    }

    try {
      const assistantMsg = await apiService.ai.sendMessage(
        selectedProjectId,
        activeConversationId,
        {
          message: trimmed,
        },
      )

      if (activeConversation) {
        setActiveConversation({
          ...activeConversation,
          title:
            activeConversation.title === 'New Analytics Chat'
              ? trimmed.slice(0, 35)
              : activeConversation.title,
          messages: [...activeConversation.messages, tempUserMsg, assistantMsg],
        })
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? {
                ...c,
                title: c.title === 'New Analytics Chat' ? trimmed.slice(0, 35) : c.title,
                message_count: c.message_count + 2,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      )
    } catch (err: unknown) {
      setChatError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Failed to generate response',
      )
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendMessage()
    }
  }

  const handleOpenInsights = async () => {
    if (!selectedProjectId) return
    setIsInsightsOpen(true)
    setIsInsightsLoading(true)
    try {
      const res = await apiService.ai.generateInsights(selectedProjectId, {
        dataset_ids: selectedDatasetIds,
      })
      setInsights(res)
    } catch (err) {
      console.error('Failed to generate insights:', err)
    } finally {
      setIsInsightsLoading(false)
    }
  }

  const isPrivacyAck = aiStatus?.privacy_acknowledged ?? false

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs">
      {/* Compact Workspace Top Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Mobile Conversations Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsConversationsDrawerOpen(true)}
            aria-label="Open conversation history"
            title="Conversations"
            className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface2 px-2 py-1 text-xs font-medium text-ds-secondary hover:text-ds-ink lg:hidden"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chats</span>
          </button>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary">
            <Sparkles className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-ds-ink">AI Analytics Copilot</h1>
              {aiStatus?.model && (
                <StatusBadge
                  tone={aiStatus.configured && aiStatus.available ? 'success' : 'warning'}
                  dot
                  className="hidden sm:inline-flex"
                >
                  {aiStatus.model}
                </StatusBadge>
              )}
            </div>
            <p className="truncate text-[11px] text-ds-secondary">
              Natural Language to DuckDB SQL &amp; Conversational Insights
            </p>
          </div>
        </div>

        {/* Project Switcher, Privacy, Context & SQL Studio */}
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="hidden text-[11px] font-medium text-ds-secondary sm:inline">
                Project:
              </span>
              <select
                aria-label="Select AI workspace project"
                value={selectedProjectId || ''}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value)
                  navigate(`/projects/${e.target.value}/ai-analytics`)
                }}
                className="rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1 text-xs font-medium text-ds-ink focus:border-ds-primary focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Unobtrusive Privacy Status Control */}
          <button
            type="button"
            onClick={() => setShowPrivacyModal(true)}
            title="Review Gemini Schema-Only Privacy Notice"
            className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1 text-xs font-medium text-ds-secondary transition-colors hover:border-ds-primary/40 hover:text-ds-ink"
          >
            <ShieldCheck
              className={[
                'h-3.5 w-3.5',
                isPrivacyAck ? 'text-ds-success' : 'text-ds-warning',
              ].join(' ')}
            />
            <span className="hidden md:inline">
              {isPrivacyAck ? 'Schema-Only Privacy' : 'Privacy Notice'}
            </span>
          </button>

          {/* Desktop Right Context Panel Toggle */}
          <button
            type="button"
            onClick={() => setShowContextPanel((v) => !v)}
            aria-label={showContextPanel ? 'Hide Dataset Context' : 'Show Dataset Context'}
            title={showContextPanel ? 'Hide Dataset Context' : 'Show Dataset Context'}
            className={[
              'hidden items-center gap-1.5 rounded-ds-sm border px-2.5 py-1 text-xs font-medium transition-colors xl:inline-flex',
              showContextPanel
                ? 'border-ds-primary/30 bg-ds-primary-soft text-ds-primary'
                : 'border-ds-border bg-ds-surface2 text-ds-secondary hover:text-ds-ink',
            ].join(' ')}
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span>Context</span>
          </button>

          {/* Mobile / Tablet Dataset Context Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsContextDrawerOpen(true)}
            aria-label="Open dataset context"
            className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface2 px-2.5 py-1 text-xs font-medium text-ds-secondary hover:text-ds-ink xl:hidden"
          >
            <Database className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Context ({selectedDatasetIds.length})</span>
          </button>

          {selectedProjectId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/projects/${selectedProjectId}/analytics`)}
              leftIcon={<Terminal className="h-3.5 w-3.5" />}
            >
              SQL Studio
            </Button>
          )}
        </div>
      </header>

      {/* Main Three-Panel Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: Desktop Conversations */}
        <div className="hidden lg:flex">
          <ConversationSidebar
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={(id) => setActiveConversationId(id)}
            onNewChat={() => void handleNewChat()}
            onDelete={handleDeleteConversation}
            isLoading={isConversationsLoading}
          />
        </div>

        {/* Center Panel: Structured Conversation Workspace */}
        <section
          aria-label="AI conversation workspace"
          className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ds-bg"
        >
          {/* Non-intrusive Context Scope Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border-subtle bg-ds-surface px-4 py-1.5 text-[11px] text-ds-secondary">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium text-ds-ink">
                {activeConversation?.title || 'Analytics Session'}
              </span>
              <span className="text-ds-border-strong">·</span>
              <span className="truncate">
                {selectedDatasetNames.length > 0
                  ? `Analyzing: ${selectedDatasetNames.join(', ')}`
                  : 'No datasets selected in scope'}
              </span>
            </div>

            {aiStatus && (!aiStatus.configured || !aiStatus.available) && (
              <span className="font-medium text-ds-warning">
                {aiStatus.message || 'Gemini configuration required'}
              </span>
            )}
          </div>

          {/* Scrollable Conversation Thread */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-4xl space-y-5">
              {isConversationDetailLoading && !activeConversation ? (
                <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
                  <SkeletonText lines={5} />
                </div>
              ) : activeConversation?.messages.length === 0 ? (
                /* Clean Enterprise Welcome State */
                <div className="mx-auto max-w-2xl py-8">
                  <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 shadow-xs">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-ds-ink">
                          What would you like to analyze today?
                        </h2>
                        <p className="text-xs text-ds-secondary">
                          Schema-aware DuckDB SQL drafting with explicit review before execution.
                        </p>
                      </div>
                    </div>

                    <div className="mb-5 grid grid-cols-1 gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface2 p-3 text-[11px] text-ds-secondary sm:grid-cols-3">
                      <div>
                        <strong className="block font-medium text-ds-ink">1. Ask naturally</strong>
                        Reference metrics, filters, or tables in plain English.
                      </div>
                      <div>
                        <strong className="block font-medium text-ds-ink">2. Review SQL</strong>
                        Inspect syntax-highlighted DuckDB SQL &amp; assumptions.
                      </div>
                      <div>
                        <strong className="block font-medium text-ds-ink">3. Approve &amp; run</strong>
                        Queries revalidate on backend and run only when clicked.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-subtle">
                        Suggested Questions
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {EXAMPLE_PROMPTS.map((prompt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => void handleSendMessage(prompt)}
                            className="group flex items-center justify-between gap-2 rounded-ds-md border border-ds-border bg-ds-surface px-3.5 py-2.5 text-left text-xs font-medium text-ds-ink transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft/40"
                          >
                            <span className="leading-snug">{prompt}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ds-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-ds-primary" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                activeConversation?.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    projectId={selectedProjectId || ''}
                    selectedDatasetIds={selectedDatasetIds}
                    onSelectPrompt={(p) => void handleSendMessage(p)}
                  />
                ))
              )}

              {/* Generating Indicator */}
              {isSending && (
                <div className="max-w-4xl rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-2.5 text-xs text-ds-secondary">
                    <Loader2 className="h-4 w-4 animate-spin text-ds-primary" />
                    <span className="font-medium text-ds-ink">
                      Analyzing selected schema and drafting validated DuckDB SQL...
                    </span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {chatError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-ds-md border border-ds-error-border bg-ds-error-soft p-3.5 text-xs text-ds-error"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <strong className="block font-semibold">Request Error</strong>
                    <span className="mt-0.5 block break-words">{chatError}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom Composer */}
          <div className="shrink-0 border-t border-ds-border bg-ds-surface px-4 py-3 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-ds-md border border-ds-border bg-ds-surface2 p-2 transition-colors focus-within:border-ds-primary focus-within:bg-ds-surface focus-within:ring-2 focus-within:ring-ds-primary/15">
                <textarea
                  rows={2}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your data (e.g. 'Show total sales by product category')... [Enter to send]"
                  disabled={isSending}
                  className="w-full resize-none bg-transparent p-1.5 text-xs text-ds-ink placeholder-ds-subtle focus:outline-none sm:text-sm"
                />

                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-ds-border-subtle pt-1.5">
                  <span className="text-[11px] text-ds-subtle">
                    Enter to send · Shift + Enter for newline · {selectedDatasetIds.length} dataset
                    {selectedDatasetIds.length === 1 ? '' : 's'} in scope
                  </span>

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => void handleSendMessage()}
                    disabled={isSending || !inputPrompt.trim()}
                    loading={isSending}
                    rightIcon={!isSending ? <Send className="h-3 w-3" /> : undefined}
                  >
                    Ask AI
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel: Collapsible Desktop Dataset Context */}
        {showContextPanel && (
          <div className="hidden xl:flex">
            <DatasetContextSidebar
              catalog={catalog}
              selectedDatasetIds={selectedDatasetIds}
              onToggleDataset={handleToggleDataset}
              onOpenInsights={() => void handleOpenInsights()}
              onOpenPrivacy={() => setShowPrivacyModal(true)}
              onCollapse={() => setShowContextPanel(false)}
              isInsightsLoading={isInsightsLoading}
              aiModel={aiStatus?.model || 'Gemini Flash'}
              isAiConfigured={aiStatus?.configured ?? true}
            />
          </div>
        )}
      </div>

      {/* Responsive Left Drawer: Conversations */}
      <Drawer
        open={isConversationsDrawerOpen}
        onClose={() => setIsConversationsDrawerOpen(false)}
        side="left"
        title="Conversations"
      >
        <ConversationSidebar
          inDrawer
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={(id) => {
            setActiveConversationId(id)
            setIsConversationsDrawerOpen(false)
          }}
          onNewChat={() => void handleNewChat()}
          onDelete={handleDeleteConversation}
          isLoading={isConversationsLoading}
        />
      </Drawer>

      {/* Responsive Right Drawer: Dataset Context */}
      <Drawer
        open={isContextDrawerOpen}
        onClose={() => setIsContextDrawerOpen(false)}
        side="right"
        title="Dataset Scope & Schema"
      >
        <DatasetContextSidebar
          inDrawer
          catalog={catalog}
          selectedDatasetIds={selectedDatasetIds}
          onToggleDataset={handleToggleDataset}
          onOpenInsights={() => {
            setIsContextDrawerOpen(false)
            void handleOpenInsights()
          }}
          onOpenPrivacy={() => {
            setIsContextDrawerOpen(false)
            setShowPrivacyModal(true)
          }}
          isInsightsLoading={isInsightsLoading}
          aiModel={aiStatus?.model || 'Gemini Flash'}
          isAiConfigured={aiStatus?.configured ?? true}
        />
      </Drawer>

      {/* Privacy Disclosure Modal */}
      <PrivacyDisclosureModal
        isOpen={showPrivacyModal}
        onAcknowledge={() => void handleAcknowledgePrivacy()}
        onClose={() => setShowPrivacyModal(false)}
        canDismiss={isPrivacyAck}
        isAcknowledged={isPrivacyAck}
        isLoading={isPrivacySaving}
      />

      {/* AI Insights Modal */}
      <AIInsightsModal
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        insights={insights}
        isLoading={isInsightsLoading}
        onSelectQuestion={(q) => void handleSendMessage(q)}
      />
    </div>
  )
}
