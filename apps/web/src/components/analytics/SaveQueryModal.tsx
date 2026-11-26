import { FormEvent, useState } from 'react'
import { Button, Modal } from '@/components/ui'

interface SaveQueryModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, description?: string) => Promise<void>
  sqlQuery: string
}

export function SaveQueryModal({
  isOpen,
  onClose,
  onSave,
  sqlQuery,
}: SaveQueryModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please provide a query name.')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(name.trim(), description.trim() || undefined)
      setName('')
      setDescription('')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save query.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Save Analytical Query"
      description="Store a reusable DuckDB SQL statement in this project."
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="save-query-modal-form"
            variant="primary"
            size="sm"
            loading={isSaving}
            disabled={isSaving || !name.trim()}
          >
            Save Query
          </Button>
        </>
      }
    >
      <form id="save-query-modal-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div
            role="alert"
            className="rounded-ds-sm border border-[var(--ds-error-border)] bg-ds-error-soft p-2.5 font-medium text-ds-error"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="save-query-name" className="mb-1 block font-medium text-ds-ink">
            Query Name <span className="text-ds-error">*</span>
          </label>
          <input
            id="save-query-name"
            type="text"
            required
            placeholder="e.g. Monthly Revenue by Category"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
          />
        </div>

        <div>
          <label htmlFor="save-query-description" className="mb-1 block font-medium text-ds-ink">
            Description (Optional)
          </label>
          <textarea
            id="save-query-description"
            rows={2}
            placeholder="Explain the analysis or key metrics computed..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-ds-sm border border-ds-border bg-ds-surface px-3 py-2 text-xs text-ds-ink placeholder-ds-subtle focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/15"
          />
        </div>

        <div>
          <label className="mb-1 block font-medium text-ds-ink">SQL Preview</label>
          <pre className="max-h-24 overflow-auto rounded-ds-sm border border-[var(--ds-border-dark)] bg-[var(--ds-surface-dark)] p-2.5 font-mono text-[11px] text-[var(--ds-text-on-dark)]">
            {sqlQuery}
          </pre>
        </div>
      </form>
    </Modal>
  )
}
