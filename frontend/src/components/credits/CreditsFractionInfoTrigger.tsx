import { useEffect, useState } from 'react'

import { useResponsive } from '../../hooks'
import { CreditsFractionInfoModal } from '../comparison/CreditsFractionInfoModal'

import { CREDITS_FRACTION_TOOLTIP } from './creditsTooltipCopy'

import './CreditsFractionInfoTrigger.css'

const CREDITS_FRACTION_INFO_ICON = (
  <svg
    className="credits-info-icon"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
)

export interface CreditsFractionInfoTriggerProps {
  tooltipPlacement?: 'above' | 'below'
  className?: string
}

/**
 * Desktop: hover tooltip (composer credits pattern). Mobile: no tooltip — tap opens
 * CreditsFractionInfoModal, same idea as Advanced Settings param info.
 */
export function CreditsFractionInfoTrigger({
  tooltipPlacement = 'above',
  className = '',
}: CreditsFractionInfoTriggerProps) {
  const { isMobileLayout } = useResponsive()
  const [fractionInfoOpen, setFractionInfoOpen] = useState(false)

  useEffect(() => {
    if (!isMobileLayout) setFractionInfoOpen(false)
  }, [isMobileLayout])

  if (isMobileLayout) {
    return (
      <>
        <button
          type="button"
          className={`advanced-settings-info-btn credits-fraction-info-trigger--mobile ${className}`.trim()}
          aria-label="Credits balance format"
          onClick={() => setFractionInfoOpen(true)}
        >
          {CREDITS_FRACTION_INFO_ICON}
        </button>
        <CreditsFractionInfoModal
          isOpen={fractionInfoOpen}
          onClose={() => setFractionInfoOpen(false)}
        />
      </>
    )
  }

  return (
    <button
      type="button"
      className={`credits-info-trigger credits-fraction-info-trigger${
        tooltipPlacement === 'below' ? ' credits-fraction-info-trigger--below' : ''
      } ${className}`.trim()}
      aria-label="Credits balance format"
    >
      <span className="credits-info-tooltip" role="tooltip">
        {CREDITS_FRACTION_TOOLTIP}
      </span>
      {CREDITS_FRACTION_INFO_ICON}
    </button>
  )
}
