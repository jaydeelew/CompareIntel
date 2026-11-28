import { useExpandFromOrigin, usePrefersReducedMotion } from '../../hooks/useExpandFromOrigin'

const LOGO_SRC = '/brand/logo.svg'

export interface VerdictButtonProps {
  open: boolean
  onToggle: () => void
}

/**
 * CompareIntel logo in the results actions row. Opening scales the mark
 * outward from the button (same 0.7s cubic-bezier and elevated stacking as
 * the hero capability tile, without rotateY). The panel fades in after that
 * move. `prefers-reduced-motion` skips the transform.
 */
export function VerdictButton({ open, onToggle }: VerdictButtonProps) {
  const reducedMotion = usePrefersReducedMotion()
  const { stackElevated } = useExpandFromOrigin(open)
  const className = [
    'verdict-logo-button',
    open ? 'verdict-logo-button--expanded' : '',
    stackElevated ? 'verdict-logo-button--elevated' : '',
    reducedMotion ? 'verdict-logo-button--instant' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      data-testid="verdict-button"
      aria-expanded={open}
      aria-controls="verdict-panel"
      aria-label={open ? 'Close verdict' : 'Open verdict'}
      onClick={onToggle}
    >
      <img src={LOGO_SRC} alt="" className="verdict-logo-mark" width={22} height={22} />
    </button>
  )
}
