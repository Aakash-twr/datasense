import React, { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  Button,
  ErrorState,
  Input,
  Modal,
  Select,
  StatusBadge,
} from '@/components/ui'
import { apiService, ApiError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Project } from '@/types'

interface UploadDatasetModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (datasetId: string) => void
  projects: Project[]
  selectedProjectId?: string
}

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.json', '.parquet']
const MAX_SIZE_MB = 25

const INGESTION_STAGES = [
  { key: 'validating', label: 'Validating & storing source file' },
  { key: 'parsing', label: 'Parsing schema & columns' },
  { key: 'normalizing', label: 'Normalizing Parquet table' },
  { key: 'profiling', label: 'Computing statistics & PII scan' },
] as const

type UploadPhase = 'idle' | 'uploading' | 'ingesting' | 'completed'

export function UploadDatasetModal({
  isOpen,
  onClose,
  onSuccess,
  projects,
  selectedProjectId,
}: UploadDatasetModalProps) {
  const { currentOrg } = useAuthStore()

  const [projectId, setProjectId] = useState<string>(
    selectedProjectId || projects[0]?.id || '',
  )
  const [file, setFile] = useState<File | null>(null)
  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [transferProgress, setTransferProgress] = useState<number>(0)
  const [ingestionProgress, setIngestionProgress] = useState<number>(0)
  const [currentStage, setCurrentStage] = useState<string>('validating')
  const [stageMessage, setStageMessage] = useState<string>('')
  const [completedDatasetId, setCompletedDatasetId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep selectedProjectId synchronized when modal opens
  useEffect(() => {
    if (isOpen) {
      setProjectId(selectedProjectId || projects[0]?.id || '')
    }
  }, [isOpen, selectedProjectId, projects])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  const resetForm = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setFile(null)
    setDatasetName('')
    setDescription('')
    setError(null)
    setPhase('idle')
    setTransferProgress(0)
    setIngestionProgress(0)
    setCurrentStage('validating')
    setStageMessage('')
    setCompletedDatasetId(null)
  }

  const handleClose = () => {
    if (phase === 'uploading' || phase === 'ingesting') return
    resetForm()
    onClose()
  }

  const handleFileSelection = (selectedFile: File) => {
    setError(null)
    const ext = '.' + (selectedFile.name.split('.').pop()?.toLowerCase() || '')
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file format '${ext}'. Allowed: CSV, XLSX, JSON, Parquet.`)
      return
    }
    if (selectedFile.size === 0) {
      setError('Selected file is empty (0 bytes).')
      return
    }
    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File size exceeds the ${MAX_SIZE_MB} MB limit.`)
      return
    }

    setFile(selectedFile)
    if (!datasetName) {
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '')
      setDatasetName(baseName)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0])
    }
  }

  const pollJobStatus = (jobId: string, datasetId: string) => {
    setPhase('ingesting')
    const checkStatus = async () => {
      try {
        const job = await apiService.datasets.getJob(jobId, currentOrg?.organization_id)
        setIngestionProgress(job.progress_percentage)
        if (job.current_stage) setCurrentStage(job.current_stage)
        setStageMessage(job.status_message || 'Running ingestion pipeline...')

        if (job.status === 'completed') {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
          setIngestionProgress(100)
          setPhase('completed')
          setCompletedDatasetId(datasetId)
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
          setPhase('idle')
          setError(job.error_message || 'Dataset ingestion failed.')
        }
      } catch {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
        setPhase('idle')
        setError('Failed to poll ingestion job status.')
      }
    }

    void checkStatus()
    pollTimerRef.current = setInterval(() => {
      void checkStatus()
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a dataset file to upload.')
      return
    }
    if (!projectId) {
      setError('Please select a target project.')
      return
    }

    setError(null)
    setPhase('uploading')
    setTransferProgress(0)
    setIngestionProgress(0)
    setStageMessage('Uploading file bytes to backend storage...')

    try {
      const resp = apiService.datasets.uploadWithProgress
        ? await apiService.datasets.uploadWithProgress(projectId, file, {
            name: datasetName.trim(),
            description: description.trim() || undefined,
            orgId: currentOrg?.organization_id,
            onProgress: (pct) => setTransferProgress(pct),
          })
        : await apiService.datasets.upload(
            projectId,
            file,
            datasetName.trim(),
            description.trim(),
            currentOrg?.organization_id,
          )

      setTransferProgress(100)
      setStageMessage('Upload complete. Tracking server ingestion...')
      pollJobStatus(resp.job_id, resp.dataset_id)
    } catch (err) {
      setPhase('idle')
      if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError('Failed to upload file. Please try again.')
      }
    }
  }

  const stageIdx = INGESTION_STAGES.findIndex((s) => s.key === currentStage)
  const isBusy = phase === 'uploading' || phase === 'ingesting'

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Upload Dataset"
      description="Import CSV, XLSX, JSON, or Parquet files into isolated Parquet storage."
      size="md"
    >
      {error && (
        <div className="mb-4">
          <ErrorState title="Upload Issue" message={error} compact />
        </div>
      )}

      {phase === 'completed' && completedDatasetId ? (
        <div className="py-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ds-success-soft text-ds-success border border-[var(--ds-success-border)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-ds-ink">Dataset Ingestion Complete</h4>
            <p className="mt-1 text-xs text-ds-secondary">
              Schema inferred, Parquet normalized, and column profiling completed.
            </p>
          </div>
          <div className="pt-3 flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                resetForm()
                onClose()
              }}
            >
              Close
            </Button>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              Upload Another
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const targetId = completedDatasetId
                resetForm()
                onSuccess(targetId)
              }}
            >
              View Dataset
            </Button>
          </div>
        </div>
      ) : isBusy ? (
        <div className="py-4 space-y-5">
          <div className="flex items-center gap-3 rounded-ds-lg border border-ds-border bg-ds-surface2 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ds bg-ds-primary-soft text-ds-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-ds-ink">
                  {phase === 'uploading' ? 'Uploading source file' : stageMessage}
                </p>
                <StatusBadge tone="primary">
                  {phase === 'uploading' ? `${transferProgress}%` : `${ingestionProgress}%`}
                </StatusBadge>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ds-muted">
                <div
                  className="h-full rounded-full bg-ds-primary transition-all duration-300"
                  style={{
                    width: `${phase === 'uploading' ? transferProgress : ingestionProgress}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Honest Ingestion Stage Checklist */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ds-secondary">
              Pipeline Stages
            </p>
            <ul className="space-y-1.5 text-xs">
              {INGESTION_STAGES.map((stage, idx) => {
                const done =
                  phase === 'ingesting' && (stageIdx > idx || currentStage === 'completed')
                const active = phase === 'ingesting' && stageIdx === idx
                return (
                  <li
                    key={stage.key}
                    className={`flex items-center gap-2 rounded-ds px-2.5 py-1.5 ${
                      active
                        ? 'bg-ds-primary-soft text-ds-primary font-medium'
                        : done
                          ? 'text-ds-success'
                          : 'text-ds-secondary'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        done ? 'bg-ds-success' : active ? 'bg-ds-primary animate-pulse' : 'bg-ds-border-strong'
                      }`}
                    />
                    <span>{stage.label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            id="project-select"
            label="Target Project *"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
            options={[
              { value: '', label: 'Select a project', disabled: true },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          {/* Drag-and-drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Select dataset file or drag and drop"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-ds-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary ${
              isDragging
                ? 'border-ds-primary bg-ds-primary-soft'
                : file
                  ? 'border-[var(--ds-accent-primary-border)] bg-ds-surface2'
                  : 'border-ds-border hover:border-ds-border-strong hover:bg-ds-surface2'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.json,.parquet"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelection(e.target.files[0])
                }
              }}
            />
            {file ? (
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ds bg-ds-primary-soft text-ds-primary">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-semibold text-ds-ink">{file.name}</p>
                    <p className="text-[11px] text-ds-secondary tabular-nums">
                      {file.size >= 1024 * 1024
                        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                        : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setFile(null)
                  }}
                  aria-label="Remove selected file"
                  className="rounded-ds-sm p-1 text-ds-secondary hover:bg-ds-muted hover:text-ds-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-ds border border-ds-border bg-ds-surface text-ds-secondary shadow-xs">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="mt-2.5 text-xs font-semibold text-ds-ink">
                  Click to browse or drag and drop file here
                </p>
                <p className="mt-1 text-[11px] text-ds-secondary">
                  Supports CSV, Excel (.xlsx), JSON, Parquet up to {MAX_SIZE_MB} MB
                </p>
              </>
            )}
          </div>

          <Input
            id="dataset-name"
            label="Dataset Name *"
            required
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="e.g. Q4 Sales Orders"
          />

          <div className="space-y-1.5">
            <label htmlFor="dataset-desc" className="block text-xs font-medium text-ds-ink">
              Description (optional)
            </label>
            <textarea
              id="dataset-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what this dataset contains"
              className="w-full rounded-ds border border-ds-border bg-ds-surface px-3 py-2 text-[13px] text-ds-ink placeholder:text-ds-subtle focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/20"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-ds-border-subtle pt-4">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!file || !projectId}
              leftIcon={<UploadCloud className="h-4 w-4" />}
            >
              Start Ingestion
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
