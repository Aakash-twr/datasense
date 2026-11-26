import React, { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Loader2, UploadCloud } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { ApiError, apiService } from '@/services/api'

interface UploadVersionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  datasetId: string
  datasetName: string
}

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.json', '.parquet']
const MAX_SIZE_MB = 25

export function UploadVersionModal({
  isOpen,
  onClose,
  onSuccess,
  datasetId,
  datasetName,
}: UploadVersionModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelection = (selectedFile: File) => {
    setError(null)
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file format '${ext}'. Allowed: CSV, XLSX, JSON, Parquet.`)
      return
    }

    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File size exceeds the ${MAX_SIZE_MB} MB limit.`)
      return
    }

    setFile(selectedFile)
  }

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const job = await apiService.datasets.getJob(jobId)
        setProgress(job.progress_percentage)
        setStatusMsg(job.status_message || 'Processing new version...')

        if (job.status === 'completed') {
          clearInterval(interval)
          setIsUploading(false)
          setIsComplete(true)
          onSuccess()
        } else if (job.status === 'failed') {
          clearInterval(interval)
          setIsUploading(false)
          setError(job.error_message || 'Version processing failed.')
        }
      } catch {
        clearInterval(interval)
        setIsUploading(false)
        setError('Failed to poll ingestion status.')
      }
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file.')
      return
    }

    setIsUploading(true)
    setError(null)
    setProgress(15)
    setStatusMsg('Uploading version to server...')

    try {
      const resp = await apiService.datasets.uploadVersion(datasetId, file)
      setStatusMsg('File uploaded. Ingesting new version...')
      setProgress(25)
      pollJob(resp.job_id)
    } catch (err) {
      setIsUploading(false)
      if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError('Failed to upload version.')
      }
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={isUploading ? () => {} : onClose}
      title="Upload New Version"
      description={`For ${datasetName}`}
      size="sm"
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-ds-sm border border-[var(--ds-error-border)] bg-ds-error-soft p-3 text-xs text-ds-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isComplete ? (
          <div className="py-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ds-success-soft text-ds-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h4 className="mt-3 text-sm font-semibold text-ds-ink">New Version Ready!</h4>
            <p className="mt-1 text-xs text-ds-secondary">
              The dataset active version has been updated.
            </p>
            <div className="mt-5">
              <Button type="button" variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : isUploading ? (
          <div className="py-5 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ds-primary-soft text-ds-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <h4 className="mt-3 text-xs font-semibold text-ds-ink">{statusMsg}</h4>
            <div className="mx-auto mt-3 w-56 overflow-hidden rounded-full bg-ds-muted">
              <div
                className="h-1.5 rounded-full bg-ds-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="mt-1.5 block text-xs font-medium text-ds-subtle tabular-nums">
              {progress}% completed
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragging(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (e.dataTransfer.files?.[0]) handleFileSelection(e.dataTransfer.files[0])
              }}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'flex cursor-pointer flex-col items-center justify-center rounded-ds-md border-2 border-dashed p-6 text-center transition-colors',
                isDragging
                  ? 'border-ds-primary bg-ds-primary-soft/50'
                  : 'border-ds-border hover:border-ds-border-strong hover:bg-ds-surface2',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.json,.parquet"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelection(e.target.files[0])
                }}
              />
              {file ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-ds-sm bg-ds-primary-soft text-ds-primary">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-ds-ink">{file.name}</p>
                    <p className="text-xs text-ds-secondary tabular-nums">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ds-muted text-ds-secondary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ds-ink">Select new version file</p>
                  <p className="mt-1 text-xs text-ds-subtle">
                    CSV, Excel (.xlsx), JSON, Parquet up to 25 MB
                  </p>
                </>
              )}
            </div>

            <p className="text-xs text-ds-secondary">
              Note: Previous versions remain intact. Only successfully ingested versions become active.
            </p>

            <div className="flex justify-end gap-2 border-t border-ds-border-subtle pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!file}
                leftIcon={<UploadCloud className="h-3.5 w-3.5" />}
              >
                Upload Version
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
