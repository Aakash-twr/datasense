import { useCallback, type KeyboardEvent } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react'

interface SqlEditorPanelProps {
  value: string
  onChange: (val: string) => void
  onExecute: () => void
  onValidate: () => void
  onOpenSaveModal: () => void
  onClear: () => void
  isExecuting: boolean
  isValidating: boolean
  validationError?: string | null
  validationSuccess?: boolean
  rowLimit: number
  onChangeRowLimit: (limit: number) => void
  editorHeight?: number
}

export function SqlEditorPanel({
  value,
  onChange,
  onExecute,
  onValidate,
  onOpenSaveModal,
  onClear,
  isExecuting,
  isValidating,
  validationError,
  validationSuccess,
  rowLimit,
  onChangeRowLimit,
  editorHeight = 250,
}: SqlEditorPanelProps) {
  const handleFormat = useCallback(() => {
    if (!value.trim()) return
    const formatted = value.replace(
      /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|ON|AS|AND|OR|NOT|IN|BETWEEN|LIKE|IS NULL|IS NOT NULL|UNION|WITH|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b/gi,
      (match) => match.toUpperCase(),
    )
    onChange(formatted)
  }, [value, onChange])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!isExecuting) {
          onExecute()
        }
      }
    },
    [isExecuting, onExecute],
  )

  return (
    <div
      className="flex flex-col bg-ds-surface border-b border-ds-border"
      onKeyDown={handleKeyDown}
    >
      {/* Compact IDE Action Toolbar (always visible) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border bg-ds-surface2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onExecute}
            disabled={isExecuting || !value.trim()}
            className="inline-flex items-center gap-1.5 rounded-ds-sm bg-ds-primary px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-ds-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            title="Execute query (Cmd+Enter / Ctrl+Enter)"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Run Query</span>
                <kbd className="hidden sm:inline-block ml-1 rounded bg-white/15 px-1 text-[10px] font-mono text-white">
                  ⌘↵
                </kbd>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onValidate}
            disabled={isValidating || !value.trim()}
            className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1.5 text-xs font-medium text-ds-ink transition-colors hover:bg-ds-muted disabled:cursor-not-allowed disabled:opacity-50"
            title="Validate SQL with SQLGlot"
          >
            {isValidating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ds-primary" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-ds-success" />
            )}
            <span className="hidden sm:inline">Validate</span>
          </button>

          <button
            type="button"
            onClick={onOpenSaveModal}
            disabled={!value.trim()}
            className="inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1.5 text-xs font-medium text-ds-ink transition-colors hover:bg-ds-muted disabled:cursor-not-allowed disabled:opacity-50"
            title="Save query for future use"
          >
            <Bookmark className="h-3.5 w-3.5 text-ds-warning" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            type="button"
            onClick={handleFormat}
            disabled={!value.trim()}
            className="inline-flex items-center gap-1 rounded-ds-sm border border-ds-border bg-ds-surface px-2.5 py-1.5 text-xs font-medium text-ds-secondary transition-colors hover:bg-ds-muted hover:text-ds-ink disabled:opacity-50"
            title="Format SQL keywords"
          >
            <Sparkles className="h-3 w-3" />
            <span>Format</span>
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={!value.trim()}
            className="rounded-ds-sm p-1.5 text-ds-secondary transition-colors hover:bg-ds-error-soft hover:text-ds-error disabled:opacity-40"
            title="Clear editor"
            aria-label="Clear SQL editor"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-ds-secondary">
          <span className="hidden md:inline text-[11px]">Limit:</span>
          <select
            aria-label="Row execution limit"
            value={rowLimit}
            onChange={(e) => onChangeRowLimit(Number(e.target.value))}
            className="rounded-ds-sm border border-ds-border bg-ds-surface px-2 py-1 text-xs text-ds-ink focus:border-ds-primary focus:outline-none"
          >
            <option value={100}>100 rows</option>
            <option value={500}>500 rows</option>
            <option value={1000}>1,000 rows</option>
            <option value={2000}>2,000 rows</option>
          </select>
        </div>
      </div>

      {/* Specialized Dark SQL CodeMirror 6 Surface (Chat2DB-inspired) */}
      <div
        className="w-full overflow-auto bg-[var(--ds-surface-dark)] text-xs font-mono"
        style={{ height: `${editorHeight}px` }}
      >
        <CodeMirror
          value={value}
          theme="dark"
          height={`${editorHeight}px`}
          extensions={[sql()]}
          onChange={onChange}
          placeholder="-- Write read-only DuckDB SQL here (e.g. SELECT * FROM schema.table LIMIT 50;)"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: false,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: false,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: false,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>

      {/* SQL Validation / Execution Feedback Banner */}
      {(validationError || validationSuccess) && (
        <div
          role={validationError ? 'alert' : 'status'}
          className={`flex items-center gap-2 border-t px-3 py-2 text-xs ${
            validationError
              ? 'border-[var(--ds-error-border)] bg-ds-error-soft text-ds-error'
              : 'border-[var(--ds-success-border)] bg-ds-success-soft text-ds-success'
          }`}
        >
          {validationError ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate font-medium">{validationError}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium">
                SQL syntax &amp; safety checks passed (SQLGlot read-only verified).
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
