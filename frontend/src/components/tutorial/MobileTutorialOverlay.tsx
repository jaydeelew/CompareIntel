import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

import { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
import type { TutorialStep } from '../../hooks/useTutorial'

import './MobileTutorialOverlay.css'

interface MobileTutorialOverlayProps {
  step: TutorialStep | null
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
  isLoading?: boolean
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

// Mobile-specific step configurations (can override desktop positions and descriptions)
const MOBILE_STEP_OVERRIDES: Partial<
  Record<
    TutorialStep,
    { targetSelector?: string; position?: 'top' | 'bottom'; description?: string }
  >
> = {
  // On mobile, some steps might need different selectors or positions
  'expand-provider': {
    position: 'bottom', // Show tooltip below the provider on mobile for better visibility
  },
  'select-models': {
    position: 'top',
  },
  'enter-prompt': {
    position: 'top', // Show above textarea initially on mobile
  },
  'enter-prompt-2': {
    position: 'top', // Show above textarea initially on mobile
  },
  'follow-up': {
    position: 'top', // Show above the follow-up button so user can see comparison results below
    description:
      'Review the results by clicking the Gemini tabs below, then click the "Follow up" button to continue the conversation.',
  },
  'view-follow-up-results': {
    position: 'top', // Show above the results section with pointer arrow
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

// Steps that target the textarea - tooltip appears above on mobile
const TEXTAREA_STEPS: TutorialStep[] = ['enter-prompt', 'enter-prompt-2']
// Dropdown steps should keep tooltip above to avoid covering menus
const DROPDOWN_STEPS: TutorialStep[] = ['history-dropdown', 'save-selection']

export const MobileTutorialOverlay: React.FC<MobileTutorialOverlayProps> = ({
  step,
  onComplete,
  onSkip,
  isStepCompleted = false,
  isLoading = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [backdropRect, setBackdropRect] = useState<TargetRect | null>(null)
  const [dropdownRect, setDropdownRect] = useState<TargetRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isTargetOffScreen, setIsTargetOffScreen] = useState<'up' | 'down' | null>(null)
  const [loadingStreamingRect, setLoadingStreamingRect] = useState<TargetRect | null>(null)
  // Track when an automatic step transition is in progress to suppress scroll indicator
  const [isStepTransitioning, setIsStepTransitioning] = useState(false)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  // State for save-selection step so Done button re-renders when user clicks (ref doesn't trigger re-renders)
  const [saveSelectionDropdownOpened, setSaveSelectionDropdownOpened] = useState(false)
  // Portal root for rendering tutorial UI - ensures position: fixed works correctly
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

  // Render the tutorial UI in a portal attached to <body> so `position: fixed` is truly viewport-fixed.
  // This avoids cases where an ancestor has `contain/transform` which can break fixed positioning or clip the tooltip.
  useEffect(() => {
    if (typeof document === 'undefined') return

    const existing = document.getElementById('mobile-tutorial-portal-root') as HTMLElement | null
    let el: HTMLElement | null = null
    if (!existing) {
      el = document.createElement('div')
      el.id = 'mobile-tutorial-portal-root'
      document.body.appendChild(el)
      setPortalRoot(el)
    } else {
      setPortalRoot(existing)
    }

    return () => {
      if (el?.parentNode) el.parentNode.removeChild(el)
      // Restore composer and all elements when tutorial completes (unmount)
      document.querySelector('.composer')?.classList.remove('tutorial-dropdown-container-active')
      document.querySelectorAll('.mobile-tutorial-highlight').forEach(htmlEl => {
        htmlEl.classList.remove('mobile-tutorial-highlight')
      })
      document.querySelectorAll('.mobile-tutorial-button-pulsate').forEach(htmlEl => {
        htmlEl.classList.remove('mobile-tutorial-button-pulsate')
      })
      document.querySelectorAll('.mobile-tutorial-tabs-pulse').forEach(htmlEl => {
        htmlEl.classList.remove('mobile-tutorial-tabs-pulse')
      })
    }
  }, [])
  // Estimated tooltip height - smaller for short viewports
  const getTooltipEstimatedHeight = () => {
    const vh = window.innerHeight
    if (vh < 600) return 130
    if (vh < 700) return 150
    return 180
  }
  const tooltipEstimatedHeight = getTooltipEstimatedHeight()
  const previousStepRef = useRef<TutorialStep | null>(null)

  // Reset dropdown opened flag when step changes
  useEffect(() => {
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
    }
  }, [step])

  // Reset save-selection flag synchronously before paint when entering step 10
  useLayoutEffect(() => {
    if (step === 'save-selection') {
      setSaveSelectionDropdownOpened(false)
    }
  }, [step])

  // Track step transitions to suppress scroll indicator during automatic scrolling
  useEffect(() => {
    // Only trigger transition state when step actually changes to a new value
    if (step && step !== previousStepRef.current) {
      previousStepRef.current = step
      setIsStepTransitioning(true)
      // Reset off-screen state immediately to prevent flashing indicator
      setIsTargetOffScreen(null)

      // Allow time for automatic scrolling to complete before enabling scroll indicator
      // This accounts for: element finding (up to 300ms), scroll delay (100ms), and smooth scroll animation (400-600ms)
      const transitionTimeout = setTimeout(() => {
        setIsStepTransitioning(false)
      }, 1000)

      return () => clearTimeout(transitionTimeout)
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
        element = document.querySelector('.composer') as HTMLElement
        if (!element) {
          const textarea = document.querySelector(
            '[data-testid="comparison-input-textarea"]'
          ) as HTMLElement
          if (textarea) {
            element = textarea.closest('.composer') as HTMLElement
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
    } else if (TEXTAREA_STEPS.includes(step)) {
      // Keep the entire composer (prompt + toolbar) visible/bright for textarea steps (3 and 6).
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (composer) {
        const inputWrapper = composer.querySelector('.composer-input-wrapper') as HTMLElement | null
        const toolbar = composer.querySelector('.composer-toolbar') as HTMLElement | null
        const parts = [inputWrapper, toolbar].filter(Boolean) as HTMLElement[]
        const rects = (parts.length > 0 ? parts : [composer]).map(el => el.getBoundingClientRect())
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))
        const width = maxRight - minLeft
        const height = maxBottom - minTop
        setBackdropRect({
          top: minTop,
          left: minLeft,
          width,
          height,
          centerX: minLeft + width / 2,
          centerY: minTop + height / 2,
        })
      } else {
        setBackdropRect(null)
      }
    } else if (step === 'submit-comparison' || step === 'submit-comparison-2') {
      // Keep the entire composer (prompt + toolbar) visible/bright during submit steps.
      // Tooltip still targets the submit button, but the cutout should match step 3 behavior.
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (composer) {
        const inputWrapper = composer.querySelector('.composer-input-wrapper') as HTMLElement | null
        const toolbar = composer.querySelector('.composer-toolbar') as HTMLElement | null
        const parts = [inputWrapper, toolbar].filter(Boolean) as HTMLElement[]
        const rects = (parts.length > 0 ? parts : [composer]).map(el => el.getBoundingClientRect())
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))
        const width = maxRight - minLeft
        const height = maxBottom - minTop
        setBackdropRect({
          top: minTop,
          left: minLeft,
          width,
          height,
          centerX: minLeft + width / 2,
          centerY: minTop + height / 2,
        })
      } else {
        setBackdropRect(null)
      }
    } else {
      setBackdropRect(null)
    }

    if (DROPDOWN_STEPS.includes(step)) {
      // Use same rects as step 3 (inputWrapper + toolbar) for consistent cutout size; add dropdown when open
      const composer = document.querySelector('.composer') as HTMLElement | null
      const dropdownElement =
        step === 'history-dropdown'
          ? (document.querySelector('.history-inline-list') as HTMLElement)
          : (document.querySelector('.saved-selections-dropdown') as HTMLElement)
      if (composer) {
        const inputWrapper = composer.querySelector('.composer-input-wrapper') as HTMLElement | null
        const toolbar = composer.querySelector('.composer-toolbar') as HTMLElement | null
        const parts = [inputWrapper, toolbar, dropdownElement].filter(Boolean) as HTMLElement[]
        const elements = parts.length > 0 ? parts : [composer]
        const rects = elements.map(el => el.getBoundingClientRect())
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))
        const width = maxRight - minLeft
        const height = maxBottom - minTop
        setDropdownRect({
          top: minTop,
          left: minLeft,
          width,
          height,
          centerX: minLeft + width / 2,
          centerY: minTop + height / 2,
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
      arrowDirection = rect.top + rect.height / 2 > viewportHeight / 2 ? 'down' : 'up'
    }

    // Ensure tooltip stays within viewport vertically
    tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding))

    // For 'follow-up' and 'view-follow-up-results' steps: Position tooltip ABOVE the results section, not inside it
    // The tooltip should be at the top of the results section and allowed to scroll out of view
    if (step === 'follow-up' || step === 'view-follow-up-results') {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      if (resultsSection) {
        const resultsRect = resultsSection.getBoundingClientRect()
        // Position tooltip above the results section
        tooltipTop = resultsRect.top - tooltipHeight - arrowSize - 8
        arrowDirection = 'down'
        // Do NOT clamp to viewport - allow tooltip to scroll out of view
      }
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
  }, [targetElement, step, tooltipEstimatedHeight])

  // Update positions on mount, scroll, resize
  useEffect(() => {
    if (!targetElement || !step) return

    calculatePositions()

    // Scroll target into view if needed
    const scrollTargetIntoView = () => {
      const rect = targetElement.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      if (TEXTAREA_STEPS.includes(step)) {
        // For enter-prompt steps, scroll to the top of the page initially
        // The tooltip appears above the textarea, and the user should see the top of the page
        window.scrollTo({ top: 0, behavior: 'smooth' })
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
      } else if (step === 'view-follow-up-results') {
        // For view-follow-up-results, scroll high so more comparison results are visible
        // Position results section just below the tooltip
        const arrowSize = 10
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = tooltipEstimatedHeight + tooltipSpacing
        const topMargin = 12 // Desired margin from top of viewport for tooltip

        // Always scroll to position results section just below the tooltip
        // This maximizes the visible results area
        const idealResultsTop = topMargin + totalTooltipHeight
        const scrollAdjustment = rect.top - idealResultsTop
        const scrollTarget = window.pageYOffset + scrollAdjustment
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
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
    // Skip interval for button-pulsate steps so tooltip stays stable while button scales
    const isButtonPulsateStep = ['submit-comparison', 'follow-up', 'submit-comparison-2'].includes(
      step
    )
    const interval = isButtonPulsateStep ? null : setInterval(handleUpdate, 200)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
      if (interval) clearInterval(interval)
    }
  }, [targetElement, step, calculatePositions, tooltipEstimatedHeight])

  // Add highlight class to target element
  useEffect(() => {
    if (!targetElement || !step) return

    // Apply highlight
    targetElement.classList.add('mobile-tutorial-highlight')

    // Add button pulsate when tooltip says "Tap the highlighted button"
    if (step === 'submit-comparison' || step === 'follow-up' || step === 'submit-comparison-2') {
      targetElement.classList.add('mobile-tutorial-button-pulsate')
    }

    // For provider steps, highlight the whole dropdown
    if (step === 'expand-provider' || step === 'select-models') {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        googleDropdown.classList.add('mobile-tutorial-highlight')
      }
    }

    // For follow-up step, highlight the full results section and add pulsing to model tabs
    const resultsSection =
      step === 'follow-up' ? (document.querySelector('.results-section') as HTMLElement) : null
    if (resultsSection) {
      resultsSection.classList.add('mobile-tutorial-highlight')
      // Add pulsing effect to model results tabs to draw attention
      const tabsHeader = document.querySelector('.results-tabs-header') as HTMLElement
      if (tabsHeader) {
        tabsHeader.classList.add('mobile-tutorial-tabs-pulse')
      }
    }

    // For submit steps, highlight the composer container too (match step 3's visual emphasis)
    if (step === 'submit-comparison' || step === 'submit-comparison-2') {
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (composer) {
        composer.classList.add('mobile-tutorial-highlight')
      }
    }

    // For dropdown steps, highlight the composer (same blue & green as step 3)
    // so it surrounds both composer and dropdowns when they are expanded
    if (step === 'history-dropdown' || step === 'save-selection') {
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (composer) {
        composer.classList.add('mobile-tutorial-highlight')
        composer.classList.add('tutorial-dropdown-container-active')
      }
    }

    return () => {
      document.querySelector('.composer')?.classList.remove('tutorial-dropdown-container-active')
      targetElement.classList.remove('mobile-tutorial-highlight')
      targetElement.classList.remove('mobile-tutorial-button-pulsate')
      // Clean up tabs pulse
      document.querySelectorAll('.mobile-tutorial-tabs-pulse').forEach(el => {
        el.classList.remove('mobile-tutorial-tabs-pulse')
      })
      // Clean up all highlights
      document.querySelectorAll('.mobile-tutorial-highlight').forEach(el => {
        el.classList.remove('mobile-tutorial-highlight')
      })
    }
  }, [targetElement, step])

  // Handle dropdown steps - track when dropdown is opened
  // For save-selection: use DOM presence as source of truth (dropdown only renders when user clicks)
  useEffect(() => {
    if (step !== 'history-dropdown' && step !== 'save-selection') return

    let didEnableSaveSelectionDone = false
    const checkDropdown = () => {
      if (step === 'history-dropdown') {
        const historyDropdown = document.querySelector('.history-inline-list')
        if (historyDropdown) {
          dropdownWasOpenedRef.current = true
        }
      } else if (step === 'save-selection') {
        const savedSelectionsDropdown = document.querySelector('.saved-selections-dropdown')
        if (savedSelectionsDropdown && !didEnableSaveSelectionDone) {
          didEnableSaveSelectionDone = true
          setSaveSelectionDropdownOpened(true)
        }
      }
    }

    checkDropdown()
    const interval = setInterval(checkDropdown, 100)

    return () => clearInterval(interval)
  }, [step])

  // Effect to handle loading/streaming cutout for submit-comparison steps
  // Phase 1: Loading section cutout (before streaming begins)
  // Phase 2: Results section cutout with scroll (once streaming begins)
  useEffect(() => {
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    const isFollowUpSubmit = step === 'submit-comparison-2'

    // Clear cutout when not on submit step or when loading ends
    if (!isSubmitStep || !isLoading) {
      setLoadingStreamingRect(null)
      return
    }

    // Track if we've already scrolled to results section
    let hasScrolledToResults = false
    // For follow-up (step 7), results section already exists, so we need to wait
    // for loading section to appear first before allowing scroll
    let loadingSectionWasSeen = false

    const updateLoadingStreamingRect = () => {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement

      // Track if loading section has been seen (needed for step 7)
      if (loadingSection) {
        loadingSectionWasSeen = true
      }

      // Phase 2: Results section exists = streaming has started (takes priority)
      // Note: Loading section may still be visible during streaming, but we want to show results
      if (resultsSection) {
        // For step 7 (follow-up), only scroll after we've seen the loading section
        // This ensures we don't scroll immediately when the old results are still showing
        const canScroll = isFollowUpSubmit ? loadingSectionWasSeen : true

        // Scroll to results section once when streaming starts
        // Position it at the top of the page so users can see streaming content clearly
        if (!hasScrolledToResults && canScroll) {
          hasScrolledToResults = true
          // Use requestAnimationFrame + small delay to ensure DOM is fully rendered
          requestAnimationFrame(() => {
            setTimeout(() => {
              // Scroll results section to top of viewport
              resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
          })
        }

        // Update cutout for results section
        const rect = resultsSection.getBoundingClientRect()
        setLoadingStreamingRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        })
      }
      // Phase 1: Only loading section exists = still in initial loading phase, before streaming
      else if (loadingSection) {
        const rect = loadingSection.getBoundingClientRect()
        setLoadingStreamingRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        })
      }
    }

    // Update immediately
    updateLoadingStreamingRect()

    // Update periodically to catch when results section appears and to keep cutout position current
    const interval = setInterval(updateLoadingStreamingRect, 100)

    return () => {
      clearInterval(interval)
      setLoadingStreamingRect(null)
    }
  }, [step, isLoading])

  if (!step || !isVisible || !portalRoot) {
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
    if (step === 'history-dropdown') {
      return !dropdownWasOpenedRef.current
    }
    if (step === 'save-selection') {
      return !saveSelectionDropdownOpened
    }
    return false
  }

  const buttonText = getButtonText()

  // Get description - use mobile override if available, otherwise config
  const getDescription = (): string =>
    MOBILE_STEP_OVERRIDES[step]?.description ?? config.description

  // Check if we're in loading/streaming phase on submit-comparison step
  // This needs to be calculated before early returns so we can skip them during loading/streaming
  const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
  const isLoadingStreamingPhase = isSubmitStep && isLoading && loadingStreamingRect

  // Render scroll indicator if target is off-screen
  // Only show when:
  // 1. Target is actually off-screen
  // 2. NOT during loading/streaming phase
  // 3. NOT during automatic step transition (to avoid flashing during smooth scroll between steps)
  const shouldShowScrollIndicator =
    isTargetOffScreen && !isLoadingStreamingPhase && !isStepTransitioning

  // Calculate cutout for backdrop
  // Always show backdrop on mobile; use cutout to keep the target visible
  const showBackdrop = true

  // During loading/streaming phase, use loadingStreamingRect; otherwise use normal cutout logic
  const cutoutTarget: TargetRect | null = isLoadingStreamingPhase
    ? loadingStreamingRect
    : shouldShowScrollIndicator
      ? null
      : (dropdownRect ?? backdropRect ?? targetRect)

  const cutoutPadding = 8
  const cutoutStyle =
    cutoutTarget && showBackdrop
      ? {
          position: 'fixed' as const,
          top: `${cutoutTarget.top - cutoutPadding}px`,
          left: `${cutoutTarget.left - cutoutPadding}px`,
          width: `${cutoutTarget.width + cutoutPadding * 2}px`,
          height: `${cutoutTarget.height + cutoutPadding * 2}px`,
          borderRadius: isLoadingStreamingPhase
            ? '16px'
            : step === 'enter-prompt' ||
                step === 'enter-prompt-2' ||
                step === 'submit-comparison' ||
                step === 'submit-comparison-2' ||
                step === 'history-dropdown' ||
                step === 'save-selection'
              ? '32px'
              : '16px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
          zIndex: 9998,
          pointerEvents: 'none' as const,
        }
      : undefined

  const overlayUi = (
    <>
      {/* Backdrop with cutout - skip for steps where user needs to see full content */}
      {showBackdrop &&
        (cutoutStyle ? (
          <div className="mobile-tutorial-backdrop-cutout" style={cutoutStyle} />
        ) : (
          <div className="mobile-tutorial-backdrop" />
        ))}

      {/* Scroll indicator - shown when target is off-screen */}
      {shouldShowScrollIndicator && (
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
      )}

      {/* Tooltip - hidden during loading/streaming phase on submit steps */}
      {!shouldShowScrollIndicator && !isLoadingStreamingPhase && tooltipPosition && (
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
            <p className="mobile-tutorial-tooltip-description">{getDescription()}</p>

            {/* Tap indicator for action steps (exclude step 2 - select-models) */}
            {isActionStep && !showButton && step !== 'select-models' && (
              <div className="mobile-tutorial-tap-indicator">
                <span>
                  {step === 'submit-comparison' ||
                  step === 'follow-up' ||
                  step === 'submit-comparison-2'
                    ? 'Tap the highlighted button'
                    : 'Tap the highlighted area'}
                </span>
              </div>
            )}

            {/* Action button */}
            {showButton && (
              <div className="mobile-tutorial-tooltip-actions">
                <button
                  className="mobile-tutorial-button mobile-tutorial-button-primary"
                  onClick={() => {
                    // Guard: only complete when button is enabled (e.g. save-selection needs dropdown opened)
                    if (!isButtonDisabled()) {
                      onComplete()
                    }
                  }}
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

            {/* Arrow - positioned dynamically */}
            {!tooltipPosition.useFullscreen && (
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

  return createPortal(overlayUi, portalRoot)
}
