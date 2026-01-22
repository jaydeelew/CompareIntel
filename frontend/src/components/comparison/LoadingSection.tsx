/**
 * LoadingSection Component
 *
 * Displays the loading animation while AI models are processing responses.
 * Shows the number of models being processed and provides a cancel button.
 *
 * Extracted from App.tsx to improve code organization.
 * Created: January 21, 2026
 */

interface LoadingSectionProps {
  /** Number of models currently being processed */
  selectedModelsCount: number
  /** Callback to cancel the current comparison */
  onCancel: () => void
}

export function LoadingSection({ selectedModelsCount, onCancel }: LoadingSectionProps) {
  return (
    <div className="loading-section">
      <div className="loading-content">
        <p>
          Processing{' '}
          {selectedModelsCount === 1
            ? 'response from 1 AI model'
            : `responses from ${selectedModelsCount} AI models`}
          ...
        </p>
        <div className="comparison-animation">
          <svg
            width="200"
            height="80"
            viewBox="0 0 200 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Left arrow - single path combining shaft and head */}
            <g className="arrow-left">
              <path d="M 5 34 L 90 34 L 90 28 L 99.5 40 L 90 52 L 90 46 L 5 46 Z" fill="#3b82f6" />
            </g>
            {/* Right arrow - single path combining shaft and head */}
            <g className="arrow-right">
              <path
                d="M 195 34 L 110 34 L 110 28 L 100.5 40 L 110 52 L 110 46 L 195 46 Z"
                fill="#87CEEB"
              />
            </g>
            {/* Spark effect flowing from meeting point - 12 particles in circular formation */}
            <g className="spark-effect">
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
              <circle className="spark-particle" cx="100" cy="40" r="2" fill="#ff9500" />
            </g>
          </svg>
        </div>
        <button onClick={onCancel} className="cancel-button" aria-label="Stop comparison">
          <span className="cancel-x">✕</span>
          <span className="cancel-text">Cancel</span>
        </button>
      </div>
    </div>
  )
}
