import React, { useState } from 'react'
import { Calendar, MessageSquare, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, SkeletonText } from '@/components/ui'
import type { AIConversationListItem } from '@/types'

interface ConversationSidebarProps {
  conversations: AIConversationListItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  isLoading?: boolean
  inDrawer?: boolean
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  isLoading = false,
  inDrawer = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  )

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays <= 0) return 'Today'
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 7) return `${diffDays}d ago`
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <aside
      aria-label="Conversation history"
      className={[
        'flex h-full flex-col bg-ds-surface2',
        inDrawer ? 'w-full' : 'w-64 shrink-0 border-r border-ds-border',
      ].join(' ')}
    >
      {/* Action & Search Header */}
      <div className="space-y-2.5 border-b border-ds-border p-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onNewChat}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          className="w-full justify-center"
        >
          New Analysis
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ds-subtle" />
          <input
            type="text"
            aria-label="Search conversations"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface py-1.5 pl-8 pr-7 text-xs text-ds-ink placeholder-ds-subtle transition-colors focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Clear conversation search"
              className="absolute right-2 top-1.5 rounded p-0.5 text-ds-subtle hover:bg-ds-muted hover:text-ds-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Section Heading */}
      <div className="flex items-center justify-between border-b border-ds-border-subtle px-3.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
          Conversations
        </span>
        <span className="rounded bg-ds-muted px-1.5 py-0.5 text-[10px] font-medium text-ds-secondary tabular-nums">
          {filtered.length}
        </span>
      </div>

      {/* Conversation List */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-3 p-2">
            <SkeletonText lines={3} />
            <SkeletonText lines={2} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <MessageSquare className="mx-auto mb-2 h-7 w-7 text-ds-subtle" />
            <p className="text-xs font-medium text-ds-ink">
              {searchTerm ? 'No matching conversations' : 'No conversations yet'}
            </p>
            <p className="mt-1 text-[11px] text-ds-secondary">
              {searchTerm
                ? 'Try a different search keyword.'
                : 'Start a new analysis to ask questions about your schema.'}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const isActive = item.id === activeId
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(item.id)
                  }
                }}
                className={[
                  'group relative flex cursor-pointer items-start justify-between rounded-ds-sm border px-2.5 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ds-primary/20',
                  isActive
                    ? 'border-ds-primary/30 bg-ds-primary-soft/70 text-ds-ink shadow-xs'
                    : 'border-transparent text-ds-secondary hover:border-ds-border-subtle hover:bg-ds-surface hover:text-ds-ink',
                ].join(' ')}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      className={[
                        'h-3.5 w-3.5 shrink-0',
                        isActive ? 'text-ds-primary' : 'text-ds-subtle group-hover:text-ds-secondary',
                      ].join(' ')}
                    />
                    <p
                      className={[
                        'truncate text-xs',
                        isActive ? 'font-semibold text-ds-ink' : 'font-medium text-ds-ink',
                      ].join(' ')}
                    >
                      {item.title}
                    </p>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 pl-5 text-[10px] text-ds-subtle tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      <span>{formatDate(item.updated_at)}</span>
                    </span>
                    <span>·</span>
                    <span>{item.message_count} msgs</span>
                  </div>
                </div>

                <button
                  type="button"
                  title="Delete conversation"
                  aria-label={`Delete conversation ${item.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm('Delete this conversation?')) {
                      onDelete(item.id)
                    }
                  }}
                  className="rounded p-1 text-ds-subtle opacity-80 transition-colors hover:bg-ds-error-soft hover:text-ds-error group-hover:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
