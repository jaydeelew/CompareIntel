import type { ReactNode } from 'react'

interface StyledTooltipProps {
  /** Tooltip text shown on hover */
  text: string
  /** Child element(s) to wrap - receives the tooltip on hover */
  children: ReactNode
  /** Optional className for the wrapper */
  className?: string
}

/**
 * Wraps children and shows a styled tooltip on hover, matching the info icon tooltip theme.
 * Use instead of native `title` attribute for consistent tooltip appearance.
 */
export function StyledTooltip({ text, children, className = '' }: StyledTooltipProps) {
  return (
    <span className={`tooltip ${className}`.trim()}>
      {children}
      <span className="tooltip-content" role="tooltip">
        {text}
      </span>
    </span>
  )
}
