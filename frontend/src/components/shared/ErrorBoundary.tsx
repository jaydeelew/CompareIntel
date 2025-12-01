import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showErrorDetails?: boolean // Allow controlling error details visibility for testing
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component to catch React errors and display fallback UI
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div
          className="error-boundary-fallback"
          style={{
            padding: '2rem',
            margin: '1rem',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '0.5rem',
            color: '#c33',
          }}
        >
          <h2 style={{ margin: '0 0 1rem 0' }}>⚠️ Something went wrong</h2>
          <p style={{ margin: '0 0 1rem 0' }}>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          {this.props.showErrorDetails !== false && import.meta.env.DEV && this.state.error && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Error details (development only)
              </summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '1rem',
                  backgroundColor: '#f8f8f8',
                  border: '1px solid #ddd',
                  borderRadius: '0.25rem',
                  overflow: 'auto',
                  fontSize: '0.875rem',
                }}
              >
                {this.state.error.toString()}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#c33',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
