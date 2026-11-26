import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  Search,
  ShieldAlert,
  Table as TableIcon,
} from 'lucide-react'
import { SkeletonText } from '@/components/ui'
import type { CatalogDataset } from '@/types'

interface DataExplorerPanelProps {
  catalog: CatalogDataset[]
  selectedDatasetIds: string[]
  onToggleDataset: (datasetId: string) => void
  onSelectAllDatasets: () => void
  onClearDatasetSelection: () => void
  onInsertSql: (sql: string) => void
  isLoading?: boolean
}

export function DataExplorerPanel({
  catalog,
  selectedDatasetIds,
  onToggleDataset,
  onSelectAllDatasets,
  onClearDatasetSelection,
  onInsertSql,
  isLoading = false,
}: DataExplorerPanelProps) {
  const [search, setSearch] = useState('')
  const [expandedDatasets, setExpandedDatasets] = useState<Record<string, boolean>>({})
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})

  const toggleDatasetExpand = (id: string) => {
    setExpandedDatasets((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleTableExpand = (qualifiedName: string) => {
    setExpandedTables((prev) => ({ ...prev, [qualifiedName]: !prev[qualifiedName] }))
  }

  const filteredCatalog = catalog
    .map((ds) => {
      const q = search.toLowerCase()
      const matchesDs =
        ds.dataset_name.toLowerCase().includes(q) || ds.schema_name.toLowerCase().includes(q)
      const filteredTables = ds.tables.filter((tbl) => {
        const matchesTable = tbl.table_name.toLowerCase().includes(q)
        const matchesCol = tbl.columns.some((col) => col.name.toLowerCase().includes(q))
        return matchesTable || matchesCol || matchesDs
      })
      return { ...ds, tables: filteredTables }
    })
    .filter(
      (ds) =>
        ds.tables.length > 0 ||
        ds.dataset_name.toLowerCase().includes(search.toLowerCase()),
    )

  const allSelected = catalog.length > 0 && selectedDatasetIds.length === catalog.length

  return (
    <aside className="flex h-full flex-col border-r border-ds-border bg-ds-surface select-none">
      {/* Explorer Header */}
      <div className="flex items-center justify-between border-b border-ds-border-subtle px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-ds-primary" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ds-ink">
            Database Explorer
          </h2>
        </div>
        <button
          type="button"
          onClick={allSelected ? onClearDatasetSelection : onSelectAllDatasets}
          className="text-[11px] font-medium text-ds-primary hover:underline"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Filter Input */}
      <div className="border-b border-ds-border-subtle p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-ds-subtle" />
          <input
            type="text"
            placeholder="Filter schemas, tables, columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter database explorer"
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface2 py-1.5 pl-8 pr-2.5 text-xs text-ds-ink placeholder:text-ds-subtle focus:border-ds-primary focus:bg-ds-surface focus:outline-none"
          />
        </div>
      </div>

      {/* Schema Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading ? (
          <div className="p-2">
            <SkeletonText lines={5} />
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-ds-secondary">
            {search ? 'No matching tables or columns found.' : 'No ready datasets in this project.'}
          </div>
        ) : (
          filteredCatalog.map((dataset) => {
            const isDatasetSelected = selectedDatasetIds.includes(dataset.dataset_id)
            const isExpanded = expandedDatasets[dataset.dataset_id] ?? true

            return (
              <div
                key={dataset.dataset_id}
                className="rounded-ds border border-ds-border-subtle bg-ds-surface2/60"
              >
                {/* Dataset & Schema Row */}
                <div className="flex items-center justify-between rounded-t-ds px-2 py-1.5 hover:bg-ds-muted/70">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleDatasetExpand(dataset.dataset_id)}
                      aria-label={`Toggle ${dataset.dataset_name}`}
                      className="rounded p-0.5 text-ds-secondary hover:text-ds-ink"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <input
                      type="checkbox"
                      checked={isDatasetSelected}
                      onChange={() => onToggleDataset(dataset.dataset_id)}
                      title="Include dataset in query scope"
                      className="h-3.5 w-3.5 cursor-pointer rounded border-ds-border-strong text-ds-primary focus:ring-ds-primary"
                    />
                    <div
                      onClick={() => toggleDatasetExpand(dataset.dataset_id)}
                      className="min-w-0 cursor-pointer"
                    >
                      <p className="truncate text-xs font-semibold text-ds-ink" title={dataset.dataset_name}>
                        {dataset.dataset_name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-ds-subtle">
                        schema: {dataset.schema_name}
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-ds-surface px-1.5 py-0.5 font-mono text-[10px] uppercase text-ds-secondary border border-ds-border-subtle">
                    {dataset.source_format}
                  </span>
                </div>

                {/* Tables inside dataset */}
                {isExpanded && (
                  <div className="space-y-0.5 border-t border-ds-border-subtle py-1 pl-4 pr-1.5">
                    {dataset.tables.map((table) => {
                      const isTableExpanded = expandedTables[table.qualified_name] ?? true

                      return (
                        <div key={table.qualified_name} className="space-y-0.5">
                          <div className="flex items-center justify-between rounded-ds-sm px-1.5 py-1 hover:bg-ds-primary-soft/70">
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleTableExpand(table.qualified_name)}
                                aria-label={`Toggle ${table.table_name} columns`}
                                className="rounded p-0.5 text-ds-secondary hover:text-ds-ink"
                              >
                                {isTableExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                              </button>
                              <TableIcon className="h-3.5 w-3.5 flex-shrink-0 text-ds-primary" />
                              <button
                                type="button"
                                onClick={() =>
                                  onInsertSql(`SELECT * FROM ${table.qualified_name} LIMIT 100;\n`)
                                }
                                title={`Insert SELECT from ${table.qualified_name}`}
                                className="flex-1 truncate text-left font-mono text-xs font-medium text-ds-ink hover:text-ds-primary"
                              >
                                {table.table_name}
                              </button>
                            </div>
                            <span className="text-[10px] text-ds-subtle tabular-nums">
                              {table.row_count.toLocaleString()}
                            </span>
                          </div>

                          {/* Columns */}
                          {isTableExpanded && (
                            <div className="space-y-0.5 pl-6 pr-1">
                              {table.columns.map((col) => (
                                <button
                                  key={col.name}
                                  type="button"
                                  onClick={() => onInsertSql(col.name)}
                                  title={`Insert column '${col.name}'`}
                                  className="flex w-full items-center justify-between rounded-ds-sm px-1.5 py-0.5 text-left text-[11px] text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink"
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <Columns3 className="h-2.5 w-2.5 flex-shrink-0 text-ds-subtle" />
                                    <span className="truncate font-mono">{col.name}</span>
                                  </span>
                                  <span className="ml-2 flex flex-shrink-0 items-center gap-1">
                                    {col.is_sensitive && (
                                      <span
                                        title={`Sensitive PII: ${col.sensitivity_category || 'PII'}`}
                                        className="text-ds-warning"
                                      >
                                        <ShieldAlert className="h-3 w-3" />
                                      </span>
                                    )}
                                    <span className="font-mono text-[9px] uppercase text-ds-subtle">
                                      {col.canonical_type}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer Hint */}
      <div className="border-t border-ds-border-subtle bg-ds-surface2 px-3 py-2 text-[11px] text-ds-secondary">
        Click a table to insert a starter <code className="font-mono">SELECT</code> or click any column to insert its identifier.
      </div>
    </aside>
  )
}
