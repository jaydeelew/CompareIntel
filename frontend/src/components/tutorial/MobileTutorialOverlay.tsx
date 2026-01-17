import React, { useEffect, useRef, useState, useCallback } from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'

import { TUTORIAL_STEPS_CONFIG } from './tutorialSteps'
import './MobileTutorialOverlay.css'

interface MobileTutorialOverlayProps {
  step: TutorialStep | null
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
}

interface TooltipPosition {
  top: number
  left: number
  arrowDirection: 'up' | 'down' | 'left' | 'right'
  arrowOffset: number // Percentage from left/top for arrow positioning
  useFullscreen: boolean
}

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
  centerX: number
  centerY: number
}

// Mobile-specific step configurations (can override desktop positions)
const MOBILE_STEP_OVERRIDES: Partial<
  Record<TutorialStep, { targetSelector?: string; position?: 'top' | 'bottom' }>
> = {
  // On mobile, some steps might need different selectors or positions
  'expand-provider': {
    position: 'bottom', // Show tooltip below the provider on mobile for better visibility
  },
  'select-models': {
    position: 'top',
  },
  'enter-prompt': {
    position: 'bottom', // Show below textarea so user can see what they're typing
  },
  'enter-prompt-2': {
    position: 'bottom', // Show below textarea so user can see what they're typing
  },
  'follow-up': {
    position: 'top', // Show above the follow-up button so user can see comparison results below
  },
  'view-follow-up-results': {
    position: 'bottom', // Use fullscreen-style for results viewing
  },
}

const TUTORIAL_STEP_ORDER: TutorialStep[] = [
  'expand-provider',
  'select-models',
  'enter-prompt',
  'submit-comparison',
  'follow-up',
  'enter-prompt-2',
  'submit-comparison-2',
  'view-follow-up-results',
  'history-dropdown',
  'save-selection',
]

// Steps that target the textarea - tooltip must always be below to not cover input
const TEXTAREA_STEPS: TutorialStep[] = ['enter-prompt', 'enter-prompt-2']
// Dropdown steps should keep tooltip above to avoid covering menus
const DROPDOWN_STEPS: TutorialStep[] = ['history-dropdown', 'save-selection']

export const MobileTutorialOverlay: React.FC<MobileTutorialOverlayProps> = ({
  step,
  onComplete,
  onSkip,
  isStepCompleted = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [backdropRect, setBackdropRect] = useState<TargetRect | null>(null)
  const [dropdownRect, setDropdownRect] = useState<TargetRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isTargetOffScreen, setIsTargetOffScreen] = useState<'up' | 'down' | null>(null)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  const tooltipEstimatedHeight = 220

  // Reset dropdown opened flag when step changes
  useEffect(() => {
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
    }
  }, [step])

  // Find target element for current step
  useEffect(() => {
    if (!step) {
      setTargetElement(null)
      setTargetRect(null)
      setBackdropRect(null)
      setDropdownRect(null)
      setIsVisible(false)
      // Cleanup
      document.querySelectorAll('.mobile-tutorial-highlight').forEach(el => {
        el.classList.remove('mobile-tutorial-highlight')
      })
      return
    }

    const config = TUTORIAL_STEPS_CONFIG[step]
    if (!config) return

    const findElement = (): boolean => {
      let element: HTMLElement | null = null

      // Special handling for certain steps
      if (step === 'expand-provider' || step === 'select-models') {
        const googleDropdown = document.querySelector(
          '.provider-dropdown[data-provider-name="Google"]'
        ) as HTMLElement
        if (googleDropdown) {
          element =
            step === 'expand-provider'
              ? (googleDropdown.querySelector('.provider-header') as HTMLElement)
              : googleDropdown
        }
      } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
        element = document.querySelector('.textarea-container') as HTMLElement
        if (!element) {
          const textarea = document.querySelector(
            '[data-testid="comparison-input-textarea"]'
          ) as HTMLElement
          if (textarea) {
            element = textarea.closest('.textarea-container') as HTMLElement
          }
        }
      } else if (step === 'view-follow-up-results') {
        element = document.querySelector('.results-section') as HTMLElement
      } else {
        element = document.querySelector(config.targetSelector) as HTMLElement
      }

      if (element && (element.offsetParent !== null || element.offsetWidth > 0)) {
        setTargetElement(element)
        setIsVisible(true)
        return true
      }
      return false
    }

    if (!findElement()) {
      let attempts = 0
      const maxAttempts = 15
      const tryFind = () => {
        attempts++
        if (findElement()) return
        if (attempts < maxAttempts) {
          setTimeout(tryFind, 300)
        } else {
          setIsVisible(true) // Show tooltip anyway
        }
      }
      setTimeout(tryFind, 300)
    }
  }, [step])

  // Calculate target rect and tooltip position
  const calculatePositions = useCallback(() => {
    if (!targetElement || !step) return

    const rect = targetElement.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 12 // Padding from screen edges
    const tooltipRect = overlayRef.current?.getBoundingClientRect()
    const tooltipHeight = tooltipRect?.height ?? tooltipEstimatedHeight
    const tooltipWidth = tooltipRect?.width ?? Math.min(340, viewportWidth - 24)
    const arrowSize = 10

    const newTargetRect: TargetRect = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    }
    setTargetRect(newTargetRect)

    if (step === 'follow-up') {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      if (resultsSection) {
        const resultsRect = resultsSection.getBoundingClientRect()
        setBackdropRect({
          top: resultsRect.top,
          left: resultsRect.left,
          width: resultsRect.width,
          height: resultsRect.height,
          centerX: resultsRect.left + resultsRect.width / 2,
          centerY: resultsRect.top + resultsRect.height / 2,
        })
      } else {
        setBackdropRect(null)
      }
    } else {
      setBackdropRect(null)
    }

    if (DROPDOWN_STEPS.includes(step)) {
      const dropdownElement =
        step === 'history-dropdown'
          ? (document.querySelector('.history-inline-list') as HTMLElement)
          : (document.querySelector('.saved-selections-dropdown') as HTMLElement)
      if (dropdownElement) {
        const dropdownBounds = dropdownElement.getBoundingClientRect()
        setDropdownRect({
          top: dropdownBounds.top,
          left: dropdownBounds.left,
          width: dropdownBounds.width,
          height: dropdownBounds.height,
          centerX: dropdownBounds.left + dropdownBounds.width / 2,
          centerY: dropdownBounds.top + dropdownBounds.height / 2,
        })
      } else {
        setDropdownRect(null)
      }
    } else {
      setDropdownRect(null)
    }

    // Check if target is off-screen
    if (rect.bottom < 0) {
      setIsTargetOffScreen('up')
    } else if (rect.top > viewportHeight) {
      setIsTargetOffScreen('down')
    } else {
      setIsTargetOffScreen(null)
    }

    // Get mobile override for position preference
    const mobileOverride = MOBILE_STEP_OVERRIDES[step]
    const preferredPosition = mobileOverride?.position || 'bottom'

    // Calculate tooltip position with smart placement
    let tooltipTop = 0
    let tooltipLeft = 0
    let arrowDirection: 'up' | 'down' | 'left' | 'right' = 'up'
    let arrowOffset = 50 // Default to center

    // Special handling for view-follow-up-results: position at top so results are visible
    // This step should show a compact tooltip at the top of the screen
    const topFixedSteps: TutorialStep[] = ['view-follow-up-results']
    if (topFixedSteps.includes(step)) {
      setTooltipPosition({
        top: padding,
        left: (viewportWidth - tooltipWidth) / 2,
        arrowDirection: 'down',
        arrowOffset: 50,
        useFullscreen: false, // Part of TooltipPosition interface
      })
      return
    }

    // Determine vertical position (above or below target)
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom

    if (preferredPosition === 'bottom' && spaceBelow >= tooltipHeight + padding + arrowSize) {
      // Position below target
      tooltipTop = rect.bottom + arrowSize + 8
      arrowDirection = 'up'
    } else if (preferredPosition === 'top' && spaceAbove >= tooltipHeight + padding + arrowSize) {
      // Position above target
      tooltipTop = rect.top - tooltipHeight - arrowSize - 8
      arrowDirection = 'down'
    } else if (spaceBelow >= spaceAbove && spaceBelow >= 100) {
      // More space below
      tooltipTop = rect.bottom + arrowSize + 8
      arrowDirection = 'up'
    } else if (spaceAbove >= 100) {
      // More space above
      tooltipTop = rect.top - tooltipHeight - arrowSize - 8
      arrowDirection = 'down'
    } else {
      // Very tight space - position at center of screen
      tooltipTop = (viewportHeight - tooltipHeight) / 2
      arrowDirection = rect.centerY > viewportHeight / 2 ? 'down' : 'up'
    }

    // Ensure tooltip stays within viewport vertically
    tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding))

    // For enter-prompt steps: ALWAYS position below the textarea to avoid any overlap
    // This ensures the user can always see the textarea while reading the instructions
    if (TEXTAREA_STEPS.includes(step)) {
      // Always position below textarea for these steps
      tooltipTop = rect.bottom + arrowSize + 8
      arrowDirection = 'up'

      // Re-apply viewport constraint for below positioning
      tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding))
    }

    // For dropdown steps: ALWAYS position above the button so menus stay visible below
    if (DROPDOWN_STEPS.includes(step)) {
      tooltipTop = rect.top - tooltipHeight - arrowSize - 8
      arrowDirection = 'down'
      // Keep tooltip within viewport
      tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding))
    }

    // Calculate horizontal position - try to center on target
    tooltipLeft = newTargetRect.centerX - tooltipWidth / 2

    // Ensure tooltip stays within viewport horizontally
    if (tooltipLeft < padding) {
      tooltipLeft = padding
    } else if (tooltipLeft + tooltipWidth > viewportWidth - padding) {
      tooltipLeft = viewportWidth - tooltipWidth - padding
    }

    // Calculate arrow offset to point at target center
    // Arrow offset is percentage from left edge of tooltip
    const targetCenterInTooltip = newTargetRect.centerX - tooltipLeft
    arrowOffset = Math.max(15, Math.min(85, (targetCenterInTooltip / tooltipWidth) * 100))

    setTooltipPosition({
      top: tooltipTop,
      left: tooltipLeft,
      arrowDirection,
      arrowOffset,
      useFullscreen: false,
    })
  }, [targetElement, step])

  // Update positions on mount, scroll, resize
  useEffect(() => {
    if (!targetElement || !step) return

    calculatePositions()

    // Scroll target into view if needed
    const scrollTargetIntoView = () => {
      const rect = targetElement.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      if (TEXTAREA_STEPS.includes(step)) {
        // For enter-prompt steps, ensure textarea is fully visible above the tooltip
        // The tooltip appears below the textarea, so we need to ensure no overlap
        const padding = 12
        const arrowSize = 10
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = tooltipEstimatedHeight + tooltipSpacing

        // Calculate where tooltip bottom would be if positioned below textarea
        const tooltipBottom = rect.bottom + totalTooltipHeight

        // If tooltip would extend beyond viewport, scroll to position textarea higher
        // This ensures both textarea and tooltip are visible without overlap
        if (tooltipBottom > viewportHeight - padding) {
          // Calculate ideal position: textarea bottom should be high enough that tooltip fits below
          const idealTextareaBottom = viewportHeight - padding - totalTooltipHeight
          const currentTextareaBottom = rect.bottom
          const scrollAdjustment = currentTextareaBottom - idealTextareaBottom

          if (scrollAdjustment > 0) {
            // Scroll down (increase scroll position) to move textarea up in viewport
            // This positions textarea higher, leaving room below for tooltip
            const scrollTarget = window.pageYOffset + scrollAdjustment
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' })
          }
        } else if (rect.top < padding) {
          // Textarea too close to top, scroll down to give it padding
          const scrollAdjustment = padding - rect.top
          const scrollTarget = window.pageYOffset + scrollAdjustment
          window.scrollTo({ top: scrollTarget, behavior: 'smooth' })
        }
      } else if (step === 'select-models') {
        // For step 2, tooltip appears above the provider card
        // Ensure there is enough space above for the tooltip on initial scroll
        const arrowSize = 10
        const measuredTooltipHeight =
          overlayRef.current?.getBoundingClientRect().height ?? tooltipEstimatedHeight
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = measuredTooltipHeight + tooltipSpacing
        const topMargin = Math.max(8, Math.round(viewportHeight * 0.02))
        const maxTargetTop = Math.round(viewportHeight * 0.4)

        const tooltipTop = rect.top - totalTooltipHeight
        if (tooltipTop < topMargin) {
          const idealTargetTop = topMargin + totalTooltipHeight
          const scrollAdjustment = rect.top - idealTargetTop

          if (scrollAdjustment < 0) {
            const scrollTarget = window.pageYOffset + scrollAdjustment
            window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
          }
        } else if (rect.top > maxTargetTop) {
          // If we have room above, scroll down a bit so more models are visible
          const scrollAdjustment = rect.top - maxTargetTop
          const scrollTarget = window.pageYOffset + scrollAdjustment
          window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
        }
      } else if (step === 'follow-up') {
        // For follow-up step, tooltip appears above the button
        // Ensure tooltip has enough space above while keeping results visible below
        const arrowSize = 10
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = tooltipEstimatedHeight + tooltipSpacing
        const topMargin = 80 // Desired margin from top of viewport for tooltip

        // Calculate where tooltip top would be if positioned above button
        const tooltipTop = rect.top - totalTooltipHeight

        // If tooltip would go off-screen at the top, scroll to position button lower
        if (tooltipTop < topMargin) {
          // Calculate ideal position: button top should be low enough that tooltip fits above
          const idealButtonTop = topMargin + totalTooltipHeight
          const currentButtonTop = rect.top
          const scrollAdjustment = currentButtonTop - idealButtonTop

          if (scrollAdjustment < 0) {
            // Scroll up (decrease scroll position) to move button down in viewport
            // This positions button lower, leaving room above for tooltip
            const scrollTarget = window.pageYOffset + scrollAdjustment
            window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
          }
        } else if (rect.top < topMargin + totalTooltipHeight) {
          // Button too close to top, ensure we have enough space for tooltip above
          const scrollAdjustment = topMargin + totalTooltipHeight - rect.top
          const scrollTarget = window.pageYOffset - scrollAdjustment
          window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
        } else {
          // If there is room above, push the target higher to reveal more results
          const maxTargetTop = Math.round(viewportHeight * 0.4)
          if (rect.top > maxTargetTop) {
            const scrollAdjustment = rect.top - maxTargetTop
            const scrollTarget = window.pageYOffset + scrollAdjustment
            window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
          }
        }
      } else if (DROPDOWN_STEPS.includes(step)) {
        // For dropdown steps, keep tooltip above the button so menus are unobstructed
        const arrowSize = 10
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = tooltipEstimatedHeight + tooltipSpacing
        const topMargin = 80

        const tooltipTop = rect.top - totalTooltipHeight
        if (tooltipTop < topMargin) {
          const idealButtonTop = topMargin + totalTooltipHeight
          const currentButtonTop = rect.top
          const scrollAdjustment = currentButtonTop - idealButtonTop

          if (scrollAdjustment < 0) {
            const scrollTarget = window.pageYOffset + scrollAdjustment
            window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
          }
        } else if (rect.top < topMargin + totalTooltipHeight) {
          const scrollAdjustment = topMargin + totalTooltipHeight - rect.top
          const scrollTarget = window.pageYOffset - scrollAdjustment
          window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
        }
      } else {
        // For other steps, use standard scroll logic
        const margin = 150 // Extra space for tooltip

        if (rect.top < margin) {
          // Target is above viewport
          const scrollTarget = window.pageYOffset + rect.top - margin
          window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
        } else if (rect.bottom > viewportHeight - margin) {
          // Target is below viewport
          const scrollTarget = window.pageYOffset + rect.bottom - viewportHeight + margin
          window.scrollTo({ top: scrollTarget, behavior: 'smooth' })
        }
      }
    }

    setTimeout(scrollTargetIntoView, 100)

    const handleUpdate = () => {
      calculatePositions()
    }

    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    // Recalculate periodically to handle DOM changes
    const interval = setInterval(handleUpdate, 200)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
      clearInterval(interval)
    }
  }, [targetElement, step, calculatePositions])

  // Add highlight class to target element
  useEffect(() => {
    if (!targetElement || !step) return

    // Skip highlight for certain steps
    const skipHighlightSteps: TutorialStep[] = ['enter-prompt-2']
    if (skipHighlightSteps.includes(step)) return

    // Apply highlight
    targetElement.classList.add('mobile-tutorial-highlight')

    // For provider steps, highlight the whole dropdown
    if (step === 'expand-provider' || step === 'select-models') {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        googleDropdown.classList.add('mobile-tutorial-highlight')
      }
    }

    // For follow-up step, highlight the full results section
    const resultsSection =
      step === 'follow-up' ? (document.querySelector('.results-section') as HTMLElement) : null
    if (resultsSection) {
      resultsSection.classList.add('mobile-tutorial-highlight')
    }

    // For dropdown steps, highlight the dropdown list so it stays bright
    if (step === 'history-dropdown') {
      const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
      if (historyDropdown) {
        historyDropdown.classList.add('mobile-tutorial-highlight')
      }
    }
    if (step === 'save-selection') {
      const savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement
      if (savedSelectionsDropdown) {
        savedSelectionsDropdown.classList.add('mobile-tutorial-highlight')
      }
    }

    return () => {
      targetElement.classList.remove('mobile-tutorial-highlight')
      // Clean up all highlights
      document.querySelectorAll('.mobile-tutorial-highlight').forEach(el => {
        el.classList.remove('mobile-tutorial-highlight')
      })
    }
  }, [targetElement, step])

  // Handle dropdown steps - track when dropdown is opened
  useEffect(() => {
    if (step !== 'history-dropdown' && step !== 'save-selection') return

    const checkDropdown = () => {
      if (step === 'history-dropdown') {
        const historyDropdown = document.querySelector('.history-inline-list')
        if (historyDropdown) {
          dropdownWasOpenedRef.current = true
        }
      } else if (step === 'save-selection') {
        const savedSelectionsDropdown = document.querySelector('.saved-selections-dropdown')
        if (savedSelectionsDropdown) {
          dropdownWasOpenedRef.current = true
        }
      }
    }

    checkDropdown()
    const interval = setInterval(checkDropdown, 100)

    return () => clearInterval(interval)
  }, [step])

  if (!step || !isVisible) {
    return null
  }

  const config = TUTORIAL_STEPS_CONFIG[step]
  const stepIndex = TUTORIAL_STEP_ORDER.indexOf(step)
  const totalSteps = TUTORIAL_STEP_ORDER.length

  // Determine if current step requires an action (show tap indicator)
  const actionSteps: TutorialStep[] = [
    'expand-provider',
    'select-models',
    'submit-comparison',
    'follow-up',
    'submit-comparison-2',
    'history-dropdown',
    'save-selection',
  ]
  const isActionStep = actionSteps.includes(step)

  // Determine button text based on step
  const getButtonText = (): string => {
    if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      return 'Done with input'
    }
    if (step === 'view-follow-up-results') {
      return 'Got it!'
    }
    if (step === 'history-dropdown' || step === 'save-selection') {
      return 'Done'
    }
    return ''
  }

  const showButton =
    step === 'enter-prompt' ||
    step === 'enter-prompt-2' ||
    step === 'view-follow-up-results' ||
    step === 'history-dropdown' ||
    step === 'save-selection'

  const isButtonDisabled = (): boolean => {
    if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      return !isStepCompleted
    }
    if (step === 'history-dropdown' || step === 'save-selection') {
      return !dropdownWasOpenedRef.current
    }
    return false
  }

  const buttonText = getButtonText()

  // Render scroll indicator if target is off-screen
  if (isTargetOffScreen) {
    return (
      <div
        className={`mobile-tutorial-scroll-indicator scroll-${isTargetOffScreen}`}
        onClick={() => {
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }}
      >
        <span className="mobile-tutorial-scroll-icon">
          {isTargetOffScreen === 'up' ? '↑' : '↓'}
        </span>
        <span>Tap to scroll to next step</span>
      </div>
    )
  }

  // Calculate cutout for backdrop
  // For view-follow-up-results, don't show a dimmed backdrop - let the user see the results
  const noBackdropSteps: TutorialStep[] = ['view-follow-up-results']
  const showBackdrop = !noBackdropSteps.includes(step)

  const cutoutTarget = dropdownRect ?? backdropRect ?? targetRect

  const cutoutStyle =
    cutoutTarget && showBackdrop
      ? {
          position: 'fixed' as const,
          top: `${cutoutTarget.top - 8}px`,
          left: `${cutoutTarget.left - 8}px`,
          width: `${cutoutTarget.width + 16}px`,
          height: `${cutoutTarget.height + 16}px`,
          borderRadius: step === 'enter-prompt' || step === 'enter-prompt-2' ? '32px' : '16px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
          zIndex: 9998,
          pointerEvents: 'none' as const,
        }
      : undefined

  return (
    <>
      {/* Backdrop with cutout - skip for steps where user needs to see full content */}
      {showBackdrop &&
        (cutoutStyle ? (
          <div className="mobile-tutorial-backdrop-cutout" style={cutoutStyle} />
        ) : (
          <div className="mobile-tutorial-backdrop" />
        ))}

      {/* Tooltip */}
      {tooltipPosition && (
        <div
          ref={overlayRef}
          className={`mobile-tutorial-tooltip ${tooltipPosition.useFullscreen ? 'mobile-tutorial-fullscreen-tooltip' : ''}`}
          style={
            tooltipPosition.useFullscreen
              ? undefined
              : {
                  top: `${tooltipPosition.top}px`,
                  left: `${tooltipPosition.left}px`,
                }
          }
        >
          <div className="mobile-tutorial-tooltip-content">
            <div className="mobile-tutorial-tooltip-header">
              <span className="mobile-tutorial-step-indicator">
                Step {stepIndex + 1} of {totalSteps}
              </span>
              <button
                className="mobile-tutorial-close-button"
                onClick={onSkip}
                aria-label="Skip tutorial"
              >
                ×
              </button>
            </div>

            <h3 className="mobile-tutorial-tooltip-title">{config.title}</h3>
            <p className="mobile-tutorial-tooltip-description">{config.description}</p>

            {/* Tap indicator for action steps */}
            {isActionStep && !showButton && (
              <div className="mobile-tutorial-tap-indicator">
                <span className="mobile-tutorial-tap-icon">👆</span>
                <span>Tap the highlighted area</span>
              </div>
            )}

            {/* Action button */}
            {showButton && (
              <div className="mobile-tutorial-tooltip-actions">
                <button
                  className="mobile-tutorial-button mobile-tutorial-button-primary"
                  onClick={onComplete}
                  disabled={isButtonDisabled()}
                >
                  {buttonText}
                </button>
              </div>
            )}

            {/* Progress dots */}
            <div className="mobile-tutorial-progress">
              {TUTORIAL_STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  className={`mobile-tutorial-progress-dot ${i < stepIndex ? 'completed' : ''} ${i === stepIndex ? 'current' : ''}`}
                />
              ))}
            </div>

            {/* Arrow - positioned dynamically, hidden for steps without specific targets */}
            {!tooltipPosition.useFullscreen && step !== 'view-follow-up-results' && (
              <div
                className={`mobile-tutorial-arrow mobile-tutorial-arrow-${tooltipPosition.arrowDirection}`}
                style={{
                  left:
                    tooltipPosition.arrowDirection === 'up' ||
                    tooltipPosition.arrowDirection === 'down'
                      ? `${tooltipPosition.arrowOffset}%`
                      : undefined,
                  top:
                    tooltipPosition.arrowDirection === 'left' ||
                    tooltipPosition.arrowDirection === 'right'
                      ? `${tooltipPosition.arrowOffset}%`
                      : undefined,
                  transform:
                    tooltipPosition.arrowDirection === 'up' ||
                    tooltipPosition.arrowDirection === 'down'
                      ? 'translateX(-50%)'
                      : 'translateY(-50%)',
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
