import { useEffect, useState } from 'react'
import {
  Cpu,
  Database,
  FileText,
  FolderKanban,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Button } from '@/components/ui'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

const GUIDE_TOPICS = [
  {
    id: 'projects',
    title: 'Projects',
    summary: 'Workspace containers for datasets, analytical SQL queries, AI sessions, and reports.',
    detail:
      'Create separate projects per business domain or team. Each project isolates its DuckDB catalog, query history, saved queries, and multi-agent audit trail inside your organization.',
    icon: FolderKanban,
  },
  {
    id: 'uploads',
    title: 'Dataset Uploads & Ingestion',
    summary: 'CSV, Excel (multi-sheet), JSON, and Parquet ingestion with automatic schema profiling.',
    detail:
      'Uploaded files are converted to normalized Apache Parquet storage, profiled for missing values, distributions, and PII flags, and tracked by dataset version snapshots.',
    icon: Upload,
  },
  {
    id: 'sql',
    title: 'SQL Analytics & Deterministic SQL Safety',
    summary: 'DuckDB SQL IDE with SQLGlot AST validation, Query History, and Saved Queries.',
    detail:
      'All SQL Studio, AI Copilot, and Agent SQL proposals are AST-validated with SQLGlot to enforce single read-only SELECT statements with strict row limits and execution timeouts.',
    icon: Terminal,
  },
  {
    id: 'copilot',
    title: 'AI Copilot (Schema-Only)',
    summary: 'Natural-language to SQL drafting powered by Google Gemini & LangChain.',
    detail:
      'Only schema metadata (table names, column names, and canonical types) is shared to draft SQL. Raw rows stay in your DuckDB runtime, and generated SQL runs only when you explicitly click Run Query.',
    icon: Sparkles,
  },
  {
    id: 'agents',
    title: 'Multi-Agent Analytics',
    summary: 'Human-in-the-Loop LangGraph workflows across Discovery, Quality, Stats & Insights.',
    detail:
      'Coordinated specialist agents inspect schemas, audit data quality, propose validated SQL plans, pause at an explicit approval gate before execution, compute statistics, and synthesize findings.',
    icon: Cpu,
  },
  {
    id: 'reports',
    title: 'Reports & Export',
    summary: 'Executive business intelligence documents backed by verified workflow evidence.',
    detail:
      'Save completed workflow outputs to the organization Report Library with Executive Summary, Key Findings, Statistical Analysis, Data Quality observations, Charts, Recommendations, and Markdown export.',
    icon: FileText,
  },
  {
    id: 'governance',
    title: 'Roles & Governance',
    summary: 'Role-based permissions across Owner, Admin, Analyst, and Viewer memberships.',
    detail:
      'Viewers have read-only access to projects, datasets, and reports. Analysts and Admins can ingest datasets, run queries, save queries, and approve or launch AI workflows.',
    icon: ShieldCheck,
  },
]

export function HelpModal({ open, onClose }: HelpModalProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const filteredTopics = GUIDE_TOPICS.filter((topic) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      topic.title.toLowerCase().includes(q) ||
      topic.summary.toLowerCase().includes(q) ||
      topic.detail.toLowerCase().includes(q)
    )
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="datasense-help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ds-border bg-ds-surface2 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="mark" className="h-9 w-9 shrink-0 rounded-ds-md" />
            <div>
              <h2 id="datasense-help-title" className="text-sm font-semibold text-ds-ink">
                DataSense Platform Guide
              </h2>
              <p className="text-xs text-ds-secondary">
                Documentation for Projects, Datasets, SQL Studio, AI Copilot, Agents &amp; Reports
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help dialog"
            className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-ds-border-subtle px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-ds-subtle" />
            <input
              type="text"
              aria-label="Search documentation"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search platform guides..."
              className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-3 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-6 text-xs">
          {filteredTopics.length === 0 ? (
            <div className="py-8 text-center text-ds-secondary">
              <Database className="mx-auto mb-2 h-7 w-7 text-ds-subtle" />
              No guide topics match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredTopics.map((topic) => {
              const Icon = topic.icon
              return (
                <div
                  key={topic.id}
                  className="flex gap-3 rounded-ds-md border border-ds-border bg-ds-surface2 p-3.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-sm border border-ds-border bg-ds-surface text-ds-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-ds-ink">{topic.title}</p>
                    <p className="font-medium text-ds-secondary">{topic.summary}</p>
                    <p className="leading-relaxed text-ds-subtle">{topic.detail}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex justify-end border-t border-ds-border bg-ds-surface2 px-6 py-3.5">
          <Button type="button" variant="primary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}
