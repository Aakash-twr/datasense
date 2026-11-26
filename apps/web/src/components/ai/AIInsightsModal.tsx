import React from 'react'
import { Database, MessageSquare, Sparkles, Tag, X } from 'lucide-react'
import { Button, SkeletonCard, StatusBadge } from '@/components/ui'
import type { AIInsightItem, AIInsightResponse } from '@/types'

interface AIInsightsModalProps {
  isOpen: boolean
  onClose: () => void
  insights: AIInsightResponse[]
  isLoading: boolean
  onSelectQuestion: (question: string) => void
}

export const AIInsightsModal: React.FC<AIInsightsModalProps> = ({
  isOpen,
  onClose,
  insights,
  isLoading,
  onSelectQuestion,
}) => {
  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="insights-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-overlay">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ds-border bg-ds-surface2 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 id="insights-modal-title" className="text-base font-semibold text-ds-ink">
                AI Dataset Insights
              </h2>
              <p className="text-xs text-ds-secondary">
                Automated analytical angles derived from schema metadata and column profiles
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Dataset Insights"
            className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <p className="text-center text-xs text-ds-secondary">
                Analyzing schema metadata &amp; generating analytical suggestions...
              </p>
            </div>
          ) : insights.length === 0 ? (
            <div className="py-12 text-center text-ds-secondary">
              <Database className="mx-auto mb-2 h-8 w-8 text-ds-subtle" />
              <p className="text-xs font-medium text-ds-ink">
                No insights available for the selected datasets.
              </p>
            </div>
          ) : (
            insights.map((group) => (
              <div key={group.dataset_id} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-ds-border-subtle pb-2">
                  <Database className="h-4 w-4 text-ds-secondary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
                    {group.dataset_name}
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {group.insights.map((item: AIInsightItem, idx: number) => (
                    <div
                      key={idx}
                      className="flex flex-col justify-between rounded-ds-md border border-ds-border bg-ds-surface p-4 transition-colors hover:border-ds-primary/40"
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <StatusBadge tone="primary" icon={<Tag className="h-2.5 w-2.5" />}>
                            {item.category}
                          </StatusBadge>
                        </div>
                        <h4 className="mb-1 text-sm font-semibold text-ds-ink">{item.title}</h4>
                        <p className="mb-3 text-xs leading-relaxed text-ds-secondary">
                          {item.description}
                        </p>
                      </div>

                      <div className="border-t border-ds-border-subtle pt-3">
                        <p className="mb-2.5 text-xs font-medium italic text-ds-ink">
                          &ldquo;{item.suggested_question}&rdquo;
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onSelectQuestion(item.suggested_question)
                            onClose()
                          }}
                          leftIcon={<MessageSquare className="h-3.5 w-3.5" />}
                          className="w-full justify-center"
                        >
                          Explore with AI
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-ds-border bg-ds-surface2 px-6 py-3.5">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
