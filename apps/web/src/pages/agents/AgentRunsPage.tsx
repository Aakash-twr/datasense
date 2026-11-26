import React, { useEffect, useState } from 'react'
import { Bot, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import {
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui'
import { apiService } from '@/services/api'
import type { AgentRunItem } from '@/types'

function statusTone(
  status: string,
): 'success' | 'warning' | 'primary' | 'error' | 'neutral' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'awaiting_approval':
      return 'warning'
    case 'running':
    case 'planning':
      return 'primary'
    case 'failed':
    case 'rejected':
      return 'error'
    default:
      return 'neutral'
  }
}

export const AgentRunsPage: React.FC = () => {
  const [runs, setRuns] = useState<AgentRunItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await apiService.agents.listOrgRuns({ page_size: 50 })
        setRuns(res.items)
      } catch (err) {
        console.error('Failed to load org agent runs:', err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="mx-auto max-w-[var(--ds-content-max-width)] space-y-6 pb-10">
      <PageHeader
        title="Agent Runs"
        description="Audit trail of all LangGraph multi-agent workflows, human approvals, and execution telemetry."
        actions={
          <Link to="/agent-analytics" className="btn-primary text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Launch Workflow</span>
          </Link>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-ds-primary" />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No Agent Runs Recorded"
          description="Start a multi-agent workflow from the Multi-Agent Analytics Workspace to inspect live execution timelines and checkpoints here."
          action={
            <Link to="/agent-analytics" className="btn-primary text-xs">
              Open Multi-Agent Workspace
            </Link>
          }
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Request</TableHeaderCell>
                <TableHeaderCell>Workflow</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>LLM / SQL</TableHeaderCell>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell className="text-right">Action</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody className="text-xs">
              {runs.map((run) => (
                <TableRow key={run.id} interactive>
                  <TableCell className="max-w-sm truncate font-medium text-ds-ink">
                    {run.user_request}
                  </TableCell>
                  <TableCell className="font-mono text-ds-secondary">{run.workflow_type}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(run.status)} dot>
                      {run.status.replace('_', ' ')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-mono text-ds-secondary tabular-nums">
                    {run.llm_calls_count} LLM · {run.sql_queries_count} SQL
                  </TableCell>
                  <TableCell className="font-mono text-ds-subtle tabular-nums">
                    {new Date(run.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/projects/${run.project_id}/agent-analytics?runId=${run.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-ds-primary hover:underline"
                    >
                      <span>Open</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  )
}
