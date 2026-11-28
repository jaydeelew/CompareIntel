export interface FavoriteButtonProps {
  modelName: string
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}

export function FavoriteButton({
  modelName,
  selected,
  onToggle,
  disabled = false,
}: FavoriteButtonProps) {
  return (
    <button
      type="button"
      className={`favorite-button${selected ? ' favorite-button--selected' : ''}`}
      data-testid="favorite-button"
      aria-pressed={selected}
      aria-label={selected ? `Clear favorite ${modelName}` : `Pick ${modelName} as your favorite`}
      disabled={disabled}
      onClick={onToggle}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={selected ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8 6.8 19.4l1-5.9L3.5 9.4l5.9-.8L12 3.2z" />
      </svg>
    </button>
  )
}
