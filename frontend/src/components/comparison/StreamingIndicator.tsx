import React from 'react'

import { LoadingSpinner } from '../shared'

/**
 * StreamingIndicator component props
 */
export interface StreamingIndicatorProps {
  /** Number of models being processed */
  modelCount: number
  /** Whether currently loading */
  isLoading: boolean
  /** Callback to cancel the operation */
  onCancel?: () => void
  /** Custom className */
  className?: string
}

/**
 * StreamingIndicator component for showing loading state during model comparison
 *
 * @example
 * ```tsx
 * <StreamingIndicator
 *   modelCount={3}
 *   isLoading={true}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  modelCount,
  isLoading,
  onCancel,
  className = '',
}) => {
  if (!isLoading) {
    return null
  }

  const message =
    modelCount === 1
      ? 'Processing response from 1 AI model...'
      : `Processing responses from ${modelCount} AI models...`

  return (
    <div className={`loading-section ${className}`.trim()}>
      <div className="loading-content">
        <LoadingSpinner size="medium" modern={true} />
        <p>{message}</p>
      </div>
      {onCancel && (
        <button onClick={onCancel} className="cancel-button" aria-label="Stop comparison">
          <span className="cancel-x">✕</span>
          <span className="cancel-text">Cancel</span>
        </button>
      )}
    </div>
  )
}

StreamingIndicator.displayName = 'StreamingIndicator'
