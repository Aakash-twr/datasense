import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Cpu, FileText, FolderPlus, Sparkles, Upload, X } from 'lucide-react'
import { StatusBadge } from '@/components/ui'

const STORAGE_KEY = 'datasense_onboarding_dismissed'

interface OnboardingGuideProps {
  projectCount: number
  datasetCount: number
  agentRunCount: number
}

export function OnboardingGuide({
  projectCount,
  datasetCount,
  agentRunCount,
}: OnboardingGuideProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (dismissed) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Ignore storage quota errors
    }
  }

  const steps = [
    {
      title: '1. Create a Project',
      description: 'Organize datasets, SQL history, AI threads, and reports per domain.',
      href: '/projects',
      done: projectCount > 0,
      icon: FolderPlus,
    },
    {
      title: '2. Upload Structured Data',
      description: 'Import CSV, Excel, JSON, or Parquet with automated profiling and PII scan.',
      href: '/data-sources',
      done: datasetCount > 0,
      icon: Upload,
    },
    {
      title: '3. Explore with SQL or Copilot',
      description: 'Query safely in DuckDB SQL Studio or ask questions via Gemini AI Copilot.',
      href: '/ai-analytics',
      done: false,
      icon: Sparkles,
    },
    {
      title: '4. Multi-Agent & Reports',
      description: 'Approve multi-agent workflows and publish executive BI reports.',
      href: '/agent-analytics',
      done: agentRunCount > 0,
      icon: agentRunCount > 0 ? FileText : Cpu,
    },
  ]

  return (
    <section
      aria-label="Workspace Onboarding Checklist"
      className="rounded-ds-lg border border-ds-primary/25 bg-ds-primary-soft/45 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ds-ink">Quick Start Checklist</h2>
          <p className="mt-0.5 text-xs text-ds-secondary">
            Follow these steps to ingest data, validate SQL insights, and publish reports.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss onboarding checklist"
          className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-surface hover:text-ds-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <Link
            key={step.title}
            to={step.href}
            className="flex flex-col justify-between rounded-ds-md border border-ds-border bg-ds-surface p-3.5 transition-shadow hover:border-ds-primary/35 hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-7 w-7 items-center justify-center rounded-ds-sm bg-ds-primary-soft text-ds-primary">
                  <step.icon className="h-3.5 w-3.5" />
                </div>
                {step.done && (
                  <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                    Done
                  </StatusBadge>
                )}
              </div>
              <p className="mt-2.5 text-xs font-semibold text-ds-ink">{step.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-ds-secondary">{step.description}</p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-ds-primary">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
