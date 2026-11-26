import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('DataSense UI ErrorBoundary caught error:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="mx-auto my-12 max-w-lg rounded-ds-lg border border-[var(--ds-error-border)] bg-ds-surface p-6 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-md bg-ds-error-soft text-ds-error">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-ds-ink">Something went wrong</h2>
              <p className="mt-1 text-xs text-ds-secondary">{this.state.message}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={this.handleReset} className="btn-primary text-xs">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => window.location.assign('/dashboard')}
                  className="btn-secondary text-xs"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
