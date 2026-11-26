import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Printer,
} from 'lucide-react'
import { VisualizationGallery } from '@/components/agents/VisualizationGallery'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Button } from '@/components/ui'
import type { AgentRunResultsResponse, AgentVisualizationSpec } from '@/types'

interface ReportViewerProps {
  report: NonNullable<AgentRunResultsResponse['report']>
  markdown?: string | null
  charts?: AgentVisualizationSpec[]
  projectId?: string
  agentRunId?: string | null
  onSaveReport?: () => Promise<void>
  isSaving?: boolean
  alreadySaved?: boolean
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  report,
  markdown,
  charts = [],
  projectId,
  agentRunId,
  onSaveReport,
  isSaving = false,
  alreadySaved = false,
}) => {
  const [copied, setCopied] = useState(false)

  const exportText =
    markdown || `# ${report.title}\n\n## Executive Summary\n${report.executive_summary}\n`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failures
    }
  }

  const handleDownloadMarkdown = () => {
    const blob = new Blob([exportText], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  const renderSection = (title: string, items: string[]) => {
    if (!items || items.length === 0) return null
    return (
      <section className="space-y-2 border-t border-ds-border-subtle pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">{title}</h4>
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-ds-secondary">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <article
      aria-label="Workflow executive report"
      className="overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface shadow-xs print:border-none print:shadow-none"
    >
      {/* Document Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface2 px-6 py-4 print:bg-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary print:hidden">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ds-ink">{report.title}</h3>
            {report.datasets_analyzed && report.datasets_analyzed.length > 0 && (
              <p className="truncate text-[11px] text-ds-secondary">
                Scope: {report.datasets_analyzed.join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {projectId && agentRunId && (
            <Link
              to={`/projects/${projectId}/agent-analytics?runId=${agentRunId}`}
              className="btn-secondary text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>View Workflow</span>
            </Link>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            leftIcon={<Printer className="h-3.5 w-3.5" />}
          >
            Print
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleCopy()}
            leftIcon={
              copied ? (
                <Check className="h-3.5 w-3.5 text-ds-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )
            }
          >
            {copied ? 'Copied' : 'Copy Markdown'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownloadMarkdown}
            leftIcon={<Download className="h-3.5 w-3.5" />}
          >
            Export .md
          </Button>

          {!onSaveReport && (
            <Link to="/reports" className="btn-secondary text-xs">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>All Reports</span>
            </Link>
          )}

          {onSaveReport && (
            <>
              <Link to="/reports" className="btn-secondary text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Reports</span>
              </Link>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSaving || alreadySaved}
                loading={isSaving}
                onClick={() => void onSaveReport()}
                leftIcon={<BookmarkPlus className="h-3.5 w-3.5" />}
              >
                {alreadySaved ? 'Saved to Reports' : 'Save Report'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Document Content */}
      <div className="space-y-5 p-6">
        <div className="rounded-ds-md border border-ds-primary/25 bg-ds-primary-soft/45 p-4">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ds-primary">
            Executive Summary
          </h4>
          <p className="text-xs leading-relaxed text-ds-ink">{report.executive_summary}</p>
        </div>

        {renderSection('Datasets Analyzed', report.datasets_analyzed)}
        {renderSection('Analytical Objectives', report.analytical_objectives)}
        {renderSection('Key Findings', report.key_findings)}
        {renderSection('Statistical Analysis', report.statistical_analysis)}
        {renderSection('Data Quality', report.data_quality_observations)}
        {renderSection('Trends and Comparisons', report.trends_and_comparisons)}

        {charts.length > 0 && (
          <section className="space-y-3 border-t border-ds-border-subtle pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">Charts</h4>
            <VisualizationGallery charts={charts} />
          </section>
        )}

        {renderSection('Recommended Visualizations', report.recommended_visualizations)}
        {renderSection('Recommendations', report.business_recommendations)}
        {renderSection('Limitations', report.limitations)}

        {report.supporting_evidence && report.supporting_evidence.length > 0 && (
          <section className="space-y-2 border-t border-ds-border-subtle pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
              Evidence References
            </h4>
            <div className="space-y-1.5">
              {report.supporting_evidence.map((ev, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-ds-sm bg-ds-surface2 px-2.5 py-1.5 text-[11px] text-ds-secondary"
                >
                  <code className="rounded bg-ds-muted px-1.5 py-0.5 font-mono text-[10px] text-ds-ink">
                    {ev.evidence_reference}
                  </code>
                  <span>{ev.description}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="flex items-center justify-between border-t border-ds-border-subtle pt-4 text-[11px] text-ds-subtle">
          <div className="flex items-center gap-2">
            <BrandLogo variant="wordmark" className="h-4 w-auto" alt="DataSense" />
            <span>Executive Intelligence Brief</span>
          </div>
          <span>Evidence-Verified Multi-Agent Output</span>
        </footer>
      </div>
    </article>
  )
}
