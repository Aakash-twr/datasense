import React from 'react'
import { ChevronRight, HelpCircle, Info, Sparkles, User } from 'lucide-react'
import { SqlDraftCard } from '@/components/ai/SqlDraftCard'
import { StatusBadge } from '@/components/ui'
import type { AIMessageItem, AIResponseType } from '@/types'

interface MessageBubbleProps {
  message: AIMessageItem
  projectId: string
  selectedDatasetIds: string[]
  onSelectPrompt: (prompt: string) => void
}

const RESPONSE_TYPE_LABEL: Record<AIResponseType, { label: string; tone: 'primary' | 'warning' | 'neutral' | 'success' }> = {
  sql_query: { label: 'SQL Analysis', tone: 'primary' },
  clarification: { label: 'Clarification', tone: 'warning' },
  explanation: { label: 'Explanation', tone: 'neutral' },
  conversational: { label: 'Response', tone: 'neutral' },
  unsupported: { label: 'Scope Notice', tone: 'warning' },
}

/**
 * Formats inline markdown (`**bold**`, `` `code` ``) and subtle numeric highlights
 * without splitting plain sentences into disjoint block tags.
 */
function renderInlineContent(text: string): React.ReactNode[] {
  const inlineRegex = /(\*\*[^*]+\*\*|`[^`]+`|\$?\b\d[\d,]*(?:\.\d+)?%?(?:\s?(?:USD|EUR|GBP|ms|rows?))?\b)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  inlineRegex.lastIndex = 0
  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`${match.index}-b`} className="font-semibold text-ds-ink">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`${match.index}-c`}
          className="rounded border border-ds-border-subtle bg-ds-surface2 px-1 py-0.5 font-mono text-[12px] text-ds-ink"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      parts.push(
        <span key={`${match.index}-n`} className="font-mono font-medium text-ds-ink tabular-nums">
          {token}
        </span>,
      )
    }

    lastIndex = inlineRegex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

/**
 * Renders structured assistant prose with headings, short paragraphs, and scannable lists.
 */
function StructuredResponseContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let listItems: { ordered: boolean; text: string }[] = []

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return
    const isOrdered = listItems[0].ordered
    const ListTag = isOrdered ? 'ol' : 'ul'
    blocks.push(
      <ListTag
        key={`${keyPrefix}-list`}
        className={[
          'space-y-1 pl-5 text-sm leading-relaxed text-ds-ink',
          isOrdered ? 'list-decimal' : 'list-disc',
        ].join(' ')}
      >
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInlineContent(item.text)}</li>
        ))}
      </ListTag>,
    )
    listItems = []
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (!line) {
      flushList(`empty-${idx}`)
      return
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushList(`h-${idx}`)
      const level = headingMatch[1].length
      const headingText = headingMatch[2]
      blocks.push(
        <h4
          key={`h-${idx}`}
          className={
            level === 1
              ? 'pt-1 text-sm font-semibold text-ds-ink'
              : 'pt-0.5 text-[13px] font-semibold text-ds-ink'
          }
        >
          {renderInlineContent(headingText)}
        </h4>,
      )
      return
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) {
        flushList(`switch-${idx}`)
      }
      listItems.push({ ordered: false, text: bulletMatch[1] })
      return
    }

    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/)
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) {
        flushList(`switch-${idx}`)
      }
      listItems.push({ ordered: true, text: orderedMatch[1] })
      return
    }

    flushList(`p-${idx}`)
    blocks.push(
      <p key={`p-${idx}`} className="text-sm leading-relaxed text-ds-ink">
        {renderInlineContent(line)}
      </p>,
    )
  })

  flushList('end')

  return <div className="space-y-2">{blocks}</div>
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  projectId,
  selectedDatasetIds,
  onSelectPrompt,
}) => {
  const isUser = message.role === 'user'
  const meta = message.structured_metadata
  const assumptions =
    meta?.assumptions || (message as unknown as { assumptions?: string[] }).assumptions || []
  const suggestedFollowUps =
    meta?.suggested_follow_up_questions ||
    (message as unknown as { suggested_follow_up_questions?: string[] })
      .suggested_follow_up_questions ||
    []

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-2xl items-start gap-2.5">
          <div className="rounded-ds-md border border-ds-primary/25 bg-ds-primary-soft/75 px-3.5 py-2.5 text-ds-ink shadow-xs">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
            <div className="mt-1 text-right text-[10px] text-ds-secondary tabular-nums">
              {formatTime(message.created_at)}
            </div>
          </div>
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ds-sm border border-ds-border bg-ds-surface text-ds-secondary">
            <User className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    )
  }

  const badgeMeta =
    meta?.response_type && RESPONSE_TYPE_LABEL[meta.response_type]
      ? RESPONSE_TYPE_LABEL[meta.response_type]
      : RESPONSE_TYPE_LABEL.conversational

  return (
    <article className="w-full max-w-4xl space-y-2.5">
      <div className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs">
        {/* Document Header Strip */}
        <div className="flex items-center justify-between border-b border-ds-border-subtle bg-ds-surface2 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-ds-primary-soft text-ds-primary">
              <Sparkles className="h-3 w-3" />
            </div>
            <span className="text-xs font-semibold text-ds-ink">DataSense Copilot</span>
            <StatusBadge tone={badgeMeta.tone}>{badgeMeta.label}</StatusBadge>
          </div>
          <span className="text-[11px] text-ds-subtle tabular-nums">
            {formatTime(message.created_at)}
          </span>
        </div>

        {/* Document Body */}
        <div className="space-y-3.5 p-4">
          <StructuredResponseContent content={message.content} />

          {/* Clarification Callout */}
          {meta?.requires_clarification && meta.clarification_question && (
            <div className="flex items-start gap-2.5 rounded-ds-md border border-ds-warning-border bg-ds-warning-soft p-3 text-xs text-ds-ink">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-ds-warning" />
              <div className="flex-1 space-y-1">
                <strong className="block font-semibold text-ds-ink">Clarification Needed:</strong>
                <p className="leading-relaxed text-ds-secondary">{meta.clarification_question}</p>
              </div>
            </div>
          )}

          {/* Analytical Assumptions */}
          {assumptions.length > 0 && (
            <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface2 px-3.5 py-2.5 text-xs">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-ds-ink">
                <Info className="h-3.5 w-3.5 text-ds-secondary" />
                <span>Assumptions</span>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ds-secondary">
                {assumptions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Embedded SQL Draft Card */}
          {message.generated_sql && (
            <SqlDraftCard
              sql={message.generated_sql}
              explanation={message.sql_explanation}
              validationStatus={message.sql_validation_status}
              visualizationRecommendation={meta?.visualization_recommendation}
              projectId={projectId}
              selectedDatasetIds={selectedDatasetIds}
            />
          )}
        </div>
      </div>

      {/* Follow-up Question Suggestions */}
      {suggestedFollowUps.length > 0 && (
        <div className="space-y-1.5 pl-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-subtle">
            Suggested Follow-ups
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedFollowUps.map((question, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectPrompt(question)}
                className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1.5 text-xs font-medium text-ds-secondary transition-colors hover:border-ds-primary/40 hover:bg-ds-primary-soft/50 hover:text-ds-primary"
              >
                <span>{question}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-ds-subtle" />
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
