interface DoneSelectingCardProps {
  onDone: () => void
  onClose: () => void
}

/**
 * DoneSelectingCard - Floating card that appears when models need to be confirmed
 * Shows a checkmark button to confirm selection
 */
export function DoneSelectingCard({ onDone, onClose }: DoneSelectingCardProps) {
  return (
    <div className="done-selecting-card">
      <div className="done-selecting-content">
        <button
          type="button"
          onClick={onClose}
          className="done-selecting-close-button"
          aria-label="Close done selecting card"
        >
          x
        </button>
        <h3>Done Selecting?</h3>
        <button
          type="button"
          onClick={onDone}
          className="done-selecting-button"
          aria-label="Done selecting models"
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L8 20L2 16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
