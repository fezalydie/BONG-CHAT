import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render-time crashes anywhere below it so a broken page shows a
 * recoverable message instead of a blank white screen.
 *
 * Note: this does not catch async failures (rejected promises); those are
 * handled where the request is made.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the details available for debugging; the UI stays friendly.
    console.error('Unhandled UI error', error, info.componentStack)
  }

  private handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface w-full max-w-md p-6 text-center" role="alert">
          <div className="text-lg font-semibold">Something went wrong</div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {error.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={this.handleRetry}>
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
            <button className="btn-ghost" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
