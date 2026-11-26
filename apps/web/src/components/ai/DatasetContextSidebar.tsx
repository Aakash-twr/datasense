import React, { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Database,
  PanelRightClose,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react'
import { Button, StatusBadge } from '@/components/ui'
import type { CatalogDataset, CatalogResponse } from '@/types'

interface DatasetContextSidebarProps {
  catalog: CatalogResponse | null
  selectedDatasetIds: string[]
  onToggleDataset: (datasetId: string) => void
  onOpenInsights: () => void
  onOpenPrivacy?: () => void
  onCollapse?: () => void
  isInsightsLoading?: boolean
  aiModel?: string
  isAiConfigured?: boolean
  inDrawer?: boolean
}

export const DatasetContextSidebar: React.FC<DatasetContextSidebarProps> = ({
  catalog,
  selectedDatasetIds,
  onToggleDataset,
  onOpenInsights,
  onOpenPrivacy,
  onCollapse,
  isInsightsLoading = false,
  aiModel = 'Gemini',
  isAiConfigured = true,
  inDrawer = false,
}) => {
  const [expandedDatasets, setExpandedDatasets] = useState<Record<string, boolean>>({})
  const [filterTerm, setFilterTerm] = useState('')

  const toggleExpand = (id: string) => {
    setExpandedDatasets((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const allDatasets = useMemo(() => catalog?.datasets ?? [], [catalog])
  const activeDatasets = useMemo(
    () => allDatasets.filter((d) => selectedDatasetIds.includes(d.dataset_id)),
    [allDatasets, selectedDatasetIds],
  )

  const totalTables = activeDatasets.reduce((acc, d) => acc + d.tables.length, 0)
  const totalColumns = activeDatasets.reduce(
    (acc, d) => acc + d.tables.reduce((tAcc, t) => tAcc + t.columns.length, 0),
    0,
  )

  const filteredDatasets = useMemo(() => {
    const q = filterTerm.trim().toLowerCase()
    if (!q) return allDatasets
    return allDatasets.filter(
      (ds) =>
        ds.dataset_name.toLowerCase().includes(q) ||
        ds.tables.some(
          (tbl) =>
            tbl.table_name.toLowerCase().includes(q) ||
            tbl.columns.some((col) => col.name.toLowerCase().includes(q)),
        ),
    )
  }, [allDatasets, filterTerm])

  return (
    <aside
      aria-label="Dataset context"
      className={[
        'flex h-full flex-col bg-ds-surface',
        inDrawer ? 'w-full' : 'w-80 shrink-0 border-l border-ds-border',
      ].join(' ')}
    >
      {/* Header */}
      <div className="space-y-3 border-b border-ds-border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-ds-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ds-ink">
              Dataset Scope
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <StatusBadge tone={isAiConfigured ? 'success' : 'warning'} dot>
              {aiModel}
            </StatusBadge>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                title="Collapse Dataset Context"
                aria-label="Collapse Dataset Context"
                className="rounded-ds-sm p-1 text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Insights Action */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenInsights}
          disabled={isInsightsLoading || selectedDatasetIds.length === 0}
          leftIcon={<Sparkles className="h-3.5 w-3.5 text-ds-primary" />}
          className="w-full justify-center"
        >
          {isInsightsLoading ? 'Analyzing...' : 'Generate AI Insights'}
        </Button>

        {/* Scope & Privacy Summary */}
        <div className="space-y-1.5 rounded-ds-md border border-ds-border bg-ds-surface2 p-2.5 text-[11px]">
          <div className="flex items-center justify-between font-medium text-ds-ink">
            <span>Context Status</span>
            <span className="font-mono text-[11px] tabular-nums text-ds-secondary">
              {totalTables} tables · {totalColumns} cols
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-ds-secondary">
            <span>
              {activeDatasets.length} of {allDatasets.length} dataset
              {allDatasets.length === 1 ? '' : 's'} active
            </span>
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="inline-flex items-center gap-1 font-medium text-ds-primary hover:underline"
              >
                <ShieldCheck className="h-3 w-3" />
                <span>Schema-only</span>
              </button>
            )}
          </div>
        </div>

        {allDatasets.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ds-subtle" />
            <input
              type="text"
              aria-label="Filter datasets and columns"
              placeholder="Filter tables or columns..."
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-2.5 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Dataset Schema Tree */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-ds-subtle">
          Available Datasets
        </p>

        {filteredDatasets.length === 0 ? (
          <div className="py-8 text-center text-xs text-ds-secondary">
            {allDatasets.length === 0
              ? 'No datasets found in project'
              : 'No tables or columns match filter'}
          </div>
        ) : (
          filteredDatasets.map((ds: CatalogDataset) => {
            const isSelected = selectedDatasetIds.includes(ds.dataset_id)
            const isExpanded = expandedDatasets[ds.dataset_id] ?? isSelected

            return (
              <div
                key={ds.dataset_id}
                className={[
                  'rounded-ds-md border transition-colors',
                  isSelected
                    ? 'border-ds-primary/30 bg-ds-primary-soft/25'
                    : 'border-ds-border bg-ds-surface',
                ].join(' ')}
              >
                {/* Dataset Row */}
                <div className="flex items-center justify-between px-2.5 py-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleDataset(ds.dataset_id)}
                      className="h-3.5 w-3.5 rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                    />
                    <span className="truncate text-xs font-semibold text-ds-ink">
                      {ds.dataset_name}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => toggleExpand(ds.dataset_id)}
                    aria-label={isExpanded ? `Collapse ${ds.dataset_name}` : `Expand ${ds.dataset_name}`}
                    className="rounded p-1 text-ds-subtle hover:bg-ds-muted hover:text-ds-ink"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded Tables & Columns */}
                {isExpanded && (
                  <div className="space-y-2.5 border-t border-ds-border-subtle bg-ds-surface px-2.5 py-2.5">
                    {ds.tables.map((tbl) => (
                      <div key={tbl.table_name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-ds-ink">
                          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                            <TableIcon className="h-3 w-3 shrink-0 text-ds-secondary" />
                            <span className="truncate font-mono">{tbl.table_name}</span>
                          </span>
                          <span className="shrink-0 text-[10px] text-ds-subtle tabular-nums">
                            {tbl.row_count.toLocaleString()} rows
                          </span>
                        </div>

                        {/* Columns + Types List */}
                        <div className="space-y-1 pl-4">
                          {tbl.columns.map((col) => (
                            <div
                              key={col.name}
                              title={`${col.name}: ${col.data_type} (${col.canonical_type})${
                                col.is_nullable ? ' · nullable' : ''
                              }`}
                              className="flex items-center justify-between gap-2 rounded bg-ds-surface2 px-2 py-0.5 text-[11px]"
                            >
                              <span className="inline-flex min-w-0 items-center gap-1 font-mono text-ds-ink">
                                <span className="truncate">{col.name}</span>
                                {col.is_sensitive && (
                                  <Shield
                                    className="h-3 w-3 shrink-0 text-ds-warning"
                                    aria-label="Sensitive column"
                                  />
                                )}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] uppercase text-ds-subtle">
                                {col.canonical_type || col.data_type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
