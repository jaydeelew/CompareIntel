import React from 'react'

/**
 * LoadingSpinner component props
 */
export interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'small' | 'medium' | 'large'
  /** Custom className */
  className?: string
  /** Loading message to display */
  message?: string
  /** Whether to show the modern spinner animation */
  modern?: boolean
}

/**
 * Reusable LoadingSpinner component
 *
 * @example
 * ```tsx
 * <LoadingSpinner size="medium" message="Loading..." />
 * ```
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  className = '',
  message,
  modern = true,
}) => {
  const spinnerClassName = modern ? 'modern-spinner' : 'spinner'
  const sizeClass = `spinner-${size}`

  const combinedClassName = [spinnerClassName, sizeClass, className].filter(Boolean).join(' ')

  if (message) {
    return (
      <div className="loading-spinner-container">
        <div className={combinedClassName} role="status" aria-label="Loading">
          <span className="sr-only">Loading...</span>
        </div>
        {message && <p className="loading-spinner-message">{message}</p>}
      </div>
    )
  }

  return (
    <div className={combinedClassName} role="status" aria-label="Loading">
      <span className="sr-only">Loading...</span>
    </div>
  )
}

LoadingSpinner.displayName = 'LoadingSpinner'

/**
 * FullPageLoadingSpinner component for page-level loading states
 */
export const FullPageLoadingSpinner: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="full-page-loading">
      <LoadingSpinner size="large" modern={true} message={message} />
    </div>
  )
}

FullPageLoadingSpinner.displayName = 'FullPageLoadingSpinner'
