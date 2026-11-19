import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

import {
  isExpandProviderTutorialStep,
  isPrimaryExpandProviderStep,
  isProviderPickerTutorialStep,
  isSelectModelTutorialStep,
  resolveTutorialStepConfig,
  tutorialStepUsesFramedCutoutShadow,
  type StarterModelEntry,
} from '../../data/tutorialStepPlan'
import {
  TUTORIAL_VISIBLE_STEP_ORDER,
  getTutorialVisibleStepProgress,
} from '../../data/tutorialSteps'
import type { TutorialStep } from '../../hooks/useTutorial'
import {
  getTutorialProviderStepLayout,
  getTutorialScrollRoot,
  scrollTutorialProvidersIntoView,
  type TutorialProviderLayoutStep,
} from '../../utils/tutorialPositioning'
import {
  focusTutorialPromptTextarea,
  setTutorialSpotlightSettling,
  waitForTutorialLayoutSettle,
} from '../../utils/tutorialSettle'

import {
  getComposerElement,
  getHeroComposerForDropdownSteps,
  getHeroMirrorComposerIfPresent,
  getHistoryInlineListForTutorial,
  getHistoryToggleButtonForTutorial,
  getSavedSelectionsButtonForTutorial,
  getSavedSelectionsDropdownForTutorial,
} from './tutorialUtils'

import './MobileTutorialOverlay.css'

interface MobileTutorialOverlayProps {
  step: TutorialStep | null
  tutorialProviderNames: readonly string[]
  tutorialVisibleStepOrder?: readonly TutorialStep[]
  tutorialStarterEntries?: readonly StarterModelEntry[]
  tutorialSplitModelSteps?: boolean
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
  isLoading?: boolean
  streamAnswerStarted?: boolean
  /** Set when user has submitted a follow-up on step 5 (drives loading/results cutout). */
  followUpSubmitStarted?: boolean
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
    position: 'top', // Match desktop: tooltip above after provider is centered
  },
  'enter-prompt': {
    position: 'top', // Show above textarea initially on mobile
  },
  'enter-prompt-2': {
    position: 'top', // Show above textarea initially on mobile
  },
  'follow-up': {
    position: 'bottom', // Tooltip below the composer so results stay visible (mobile step 5)
    description:
      'Review the responses from both models above by selecting their tabs or swiping to the next model. Then, type a follow-up.',
  },
  'view-follow-up-results': {
    position: 'top', // Step 6: mobile code places the card above or below the full results block
    description:
      'Read the latest replies from each model. Compare how they stay consistent with the conversation so far.',
  },
}

// Steps that target the textarea - tooltip appears above on mobile
const TEXTAREA_STEPS: TutorialStep[] = ['enter-prompt', 'enter-prompt-2']
// Dropdown steps should keep tooltip above to avoid covering menus
const DROPDOWN_STEPS: TutorialStep[] = ['history-dropdown', 'save-selection']

const MobileTutorialOverlay: React.FC<MobileTutorialOverlayProps> = ({
  step,
  tutorialProviderNames,
  tutorialVisibleStepOrder = TUTORIAL_VISIBLE_STEP_ORDER,
  tutorialStarterEntries = [],
  tutorialSplitModelSteps = false,
  onComplete,
  onSkip,
  isStepCompleted = false,
  isLoading = false,
  streamAnswerStarted = false,
  followUpSubmitStarted = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const tutorialProviderNamesRef = useRef(tutorialProviderNames)
  tutorialProviderNamesRef.current = tutorialProviderNames
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [backdropRect, setBackdropRect] = useState<TargetRect | null>(null)
  /** Second clear rect for follow-up: below-results composer (not wrapped by the blue frame). */
  const [followUpComposerHoleRect, setFollowUpComposerHoleRect] = useState<TargetRect | null>(null)
  const [dropdownRect, setDropdownRect] = useState<TargetRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isTargetOffScreen, setIsTargetOffScreen] = useState<'up' | 'down' | null>(null)
  const [loadingStreamingRect, setLoadingStreamingRect] = useState<TargetRect | null>(null)
  // Track when an automatic step transition is in progress to suppress scroll indicator
  const [isStepTransitioning, setIsStepTransitioning] = useState(false)
  const isStepTransitioningRef = useRef(false)
  const spotlightSettledRef = useRef(false)
  const settledStepRef = useRef<TutorialStep | null>(null)
  const prevIsLoadingRef = useRef(isLoading)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  // Refs do not re-render. Done stays disabled until this state flips.
  const [historyDropdownOpened, setHistoryDropdownOpened] = useState(false)
  // State for save-selection step so Done button re-renders when user clicks (ref doesn't trigger re-renders)
  const [saveSelectionDropdownOpened, setSaveSelectionDropdownOpened] = useState(false)
  // Portal root for rendering tutorial UI - ensures position: fixed works correctly
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const stepRef = useRef<TutorialStep | null>(null)
  stepRef.current = step
  const suppressReviewTooltipRevealRef = useRef(false)
  const prevStepForTooltipExitRef = useRef<TutorialStep | null>(null)

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
      getHeroComposerForDropdownSteps()?.classList.remove('tutorial-dropdown-container-active')
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
    if (step !== 'history-dropdown') {
      dropdownWasOpenedRef.current = false
      setHistoryDropdownOpened(false)
    }
  }, [step])

  // Reset save-selection flag synchronously before paint when entering step 8
  useLayoutEffect(() => {
    if (step === 'save-selection') {
      setSaveSelectionDropdownOpened(false)
    }
  }, [step])

  // Step 5 tooltip must vanish before step 6 paints; same pattern as desktop useTutorialOverlay.
  useLayoutEffect(() => {
    const prev = prevStepForTooltipExitRef.current
    if (prev === 'follow-up' && step === 'view-follow-up-results') {
      setIsVisible(false)
      suppressReviewTooltipRevealRef.current = true
    }
    prevStepForTooltipExitRef.current = step
  }, [step])

  // Hide tooltip and highlight before paint on every step, including provider handoffs.
  useLayoutEffect(() => {
    if (step && step !== previousStepRef.current) {
      previousStepRef.current = step
    }
    if (!step) {
      spotlightSettledRef.current = false
      settledStepRef.current = null
      setTutorialSpotlightSettling(false)
      return
    }
    if (settledStepRef.current === step && spotlightSettledRef.current) return
    spotlightSettledRef.current = false
    isStepTransitioningRef.current = true
    setIsStepTransitioning(true)
    setIsTargetOffScreen(null)
    setTutorialSpotlightSettling(true)
  }, [step])

  // When loading ends on a submit step, the step is about to change to follow-up.
  // Preemptively hide the overlay NOW (before the step change render) so the cutout
  // doesn't visibly jump from the results section back to the submit button for one frame.
  useLayoutEffect(() => {
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    if (isSubmitStep && prevIsLoadingRef.current && !isLoading) {
      isStepTransitioningRef.current = true
      setIsStepTransitioning(true)
    }
    prevIsLoadingRef.current = isLoading
  }, [isLoading, step])

  // A short viewport (mobile keyboard) can mark the prompt off-screen and unmount the
  // card. When the window grows back, put the card back so Done stays available.
  useEffect(() => {
    const onResize = () => {
      const current = stepRef.current
      if (current !== 'enter-prompt' && current !== 'enter-prompt-2') return
      setIsTargetOffScreen(null)
      setIsVisible(true)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

    const config = resolveTutorialStepConfig(step, tutorialStarterEntries, tutorialSplitModelSteps)
    if (!config) return

    const findElement = (): boolean => {
      let element: HTMLElement | null = null

      // Special handling for certain steps
      if (isProviderPickerTutorialStep(step)) {
        const names = tutorialProviderNamesRef.current
        if (isExpandProviderTutorialStep(step) && names.length === 0) {
          return false
        }
        const layout = getTutorialProviderStepLayout(step as TutorialProviderLayoutStep, names)
        if (layout.highlights.length > 0) {
          element = layout.highlights[0]
        }
      } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
        element = getComposerElement()
        if (!element) {
          const textarea = document.querySelector(
            '[data-testid="comparison-input-textarea"]'
          ) as HTMLElement
          if (textarea) {
            element = textarea.closest('.composer') as HTMLElement
          }
        }
      } else if (step === 'view-follow-up-results') {
        element =
          (document.querySelector(config.targetSelector) as HTMLElement) ||
          (document.querySelector('.results-section') as HTMLElement)
      } else if (step === 'follow-up') {
        element = getComposerElement()
      } else if (step === 'history-dropdown') {
        element = getHistoryToggleButtonForTutorial()
      } else if (step === 'save-selection') {
        element = getSavedSelectionsButtonForTutorial()
      } else {
        element = document.querySelector(config.targetSelector) as HTMLElement
      }

      if (element && (element.offsetParent !== null || element.offsetWidth > 0)) {
        setTargetElement(element)
        if (step === 'view-follow-up-results' && suppressReviewTooltipRevealRef.current) {
          suppressReviewTooltipRevealRef.current = false
          setIsVisible(true)
        } else if (isPrimaryExpandProviderStep(step)) {
          setIsVisible(false)
        } else if (isSelectModelTutorialStep(step)) {
          setIsVisible(true)
        } else if (isProviderPickerTutorialStep(step)) {
          setIsVisible(true)
        } else {
          setIsVisible(true)
        }
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
          suppressReviewTooltipRevealRef.current = false
          setIsVisible(true) // Show tooltip anyway
        }
      }
      setTimeout(tryFind, 300)
    }
  }, [step, tutorialStarterEntries, tutorialSplitModelSteps, tutorialProviderNames])

  // Calculate target rect and tooltip position
  const calculatePositions = useCallback(() => {
    if (!targetElement || !step) return

    if (step !== 'follow-up') {
      setFollowUpComposerHoleRect(null)
    }

    const providerLayout = isProviderPickerTutorialStep(step)
      ? getTutorialProviderStepLayout(
          step as TutorialProviderLayoutStep,
          tutorialProviderNamesRef.current
        )
      : null
    const rect =
      providerLayout?.layoutRect ??
      (step === 'select-models'
        ? (targetElement.querySelector('.provider-header')?.getBoundingClientRect() ??
          targetElement.getBoundingClientRect())
        : targetElement.getBoundingClientRect())
    const placementRect = rect
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 12 // Padding from screen edges
    const tooltipRect = overlayRef.current?.getBoundingClientRect()
    const tooltipHeight = tooltipRect?.height ?? tooltipEstimatedHeight
    const tooltipWidth = tooltipRect?.width ?? Math.min(340, viewportWidth - 24)
    const arrowSize = 10
    const isSubmitTooltipStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    // Step 4 (and mirrored submit step): leave more space under the composer than the default tail gap.
    const verticalTailGap = isSubmitTooltipStep ? 14 : 8

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
      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      const composer = getComposerElement()
      if (resultsSection) {
        const r = resultsSection.getBoundingClientRect()
        setBackdropRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          centerX: r.left + r.width / 2,
          centerY: r.top + r.height / 2,
        })
      } else {
        setBackdropRect(null)
      }
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
        setFollowUpComposerHoleRect({
          top: minTop,
          left: minLeft,
          width,
          height,
          centerX: minLeft + width / 2,
          centerY: minTop + height / 2,
        })
      } else {
        setFollowUpComposerHoleRect(null)
      }
    } else if (TEXTAREA_STEPS.includes(step)) {
      // Keep the entire composer (prompt + toolbar) visible/bright for textarea steps (3 and 6).
      const composer = getComposerElement()
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
      const composer = getComposerElement()
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
    } else if (isProviderPickerTutorialStep(step)) {
      if (providerLayout?.layoutRect) {
        const r = providerLayout.layoutRect
        setBackdropRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          centerX: r.left + r.width / 2,
          centerY: r.top + r.height / 2,
        })
      } else {
        setBackdropRect(null)
      }
    } else {
      setBackdropRect(null)
    }

    if (DROPDOWN_STEPS.includes(step)) {
      // Match step 4 (submit): full composer (input + toolbar) framed cutout; union open panel when present.
      const composer = getHeroComposerForDropdownSteps()
      const dropdownElement =
        step === 'history-dropdown'
          ? getHistoryInlineListForTutorial()
          : getSavedSelectionsDropdownForTutorial()
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

    if (step === 'view-follow-up-results') {
      // Entire card fully above or fully below the whole .results-section (tabs + body) — never on top of it.
      const sideGap = 10
      const abovePad = 8
      const h = tooltipHeight
      const d = arrowSize
      const needAbove = h + d + sideGap
      const needBelow = h + d + abovePad
      const roomAbove = rect.top - padding
      const roomBelow = viewportHeight - padding - rect.bottom

      if (roomAbove >= needAbove) {
        tooltipTop = rect.top - sideGap - h - d
        tooltipTop = Math.max(padding, tooltipTop)
        arrowDirection = 'down'
      } else if (roomBelow >= needBelow) {
        tooltipTop = rect.bottom + d + abovePad
        tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - padding - h))
        arrowDirection = 'up'
      } else {
        if (roomAbove >= roomBelow) {
          tooltipTop = Math.max(padding, rect.top - sideGap - h - d)
          arrowDirection = 'down'
        } else {
          tooltipTop = Math.max(
            padding,
            Math.min(rect.bottom + d + abovePad, viewportHeight - padding - h)
          )
          arrowDirection = 'up'
        }
      }
    } else if (step === 'follow-up') {
      // Step 5: card is entirely *below* the composer; up-arrow (see .mobile-tutorial-arrow-up) points at it.
      // Do not clamp to the viewport bottom — that can lift the box over the composer (fixed or in-flow
      // composer has little space below, but scrolling cannot move a fixed bar).
      const underComposerGap = 8
      const d = arrowSize
      const minTopBelowComposer = rect.bottom + d + underComposerGap
      tooltipTop = Math.max(padding, minTopBelowComposer)
      arrowDirection = 'up'
    } else if (isProviderPickerTutorialStep(step)) {
      const verticalGap = arrowSize + 8
      const layoutRect = placementRect

      if (isSelectModelTutorialStep(step)) {
        const needAbove = tooltipHeight + verticalGap
        const needBelow = tooltipHeight + verticalGap
        const roomAbove = layoutRect.top - padding
        const roomBelow = viewportHeight - padding - layoutRect.bottom
        let placeAbove = roomAbove >= needAbove
        if (placeAbove && roomBelow < needBelow) {
          placeAbove = true
        } else if (!placeAbove && roomBelow >= needBelow) {
          placeAbove = false
        } else if (roomAbove >= roomBelow) {
          placeAbove = roomAbove >= needAbove
        } else {
          placeAbove = false
        }
        if (placeAbove) {
          tooltipTop = layoutRect.top - tooltipHeight - verticalGap
          arrowDirection = 'down'
        } else {
          tooltipTop = layoutRect.bottom + verticalGap
          arrowDirection = 'up'
        }
      } else {
        const header = targetElement.querySelector('.provider-header') as HTMLElement | null
        const anchorRect = (header ?? targetElement).getBoundingClientRect()
        const anchorMidY = anchorRect.top + anchorRect.height / 2
        const viewportMid = viewportHeight / 2
        const needAbove = tooltipHeight + verticalGap + padding
        const needBelow = tooltipHeight + verticalGap + padding
        const roomAbove = anchorRect.top - padding
        const roomBelow = viewportHeight - padding - anchorRect.bottom

        let useBelow = anchorMidY < viewportMid
        if (useBelow && roomBelow < needBelow && roomAbove >= needAbove) {
          useBelow = false
        } else if (!useBelow && roomAbove < needAbove && roomBelow >= needBelow) {
          useBelow = true
        }

        if (useBelow) {
          tooltipTop = anchorRect.bottom + verticalGap
          arrowDirection = 'up'
        } else {
          tooltipTop = anchorRect.top - tooltipHeight - verticalGap
          arrowDirection = 'down'
        }
      }
      tooltipTop = Math.max(padding, Math.min(tooltipTop, viewportHeight - tooltipHeight - padding))
    } else {
      // Determine vertical position (above or below target).
      // select-models uses the expand-provider branch above (provider-header anchor + room heuristics).
      const spaceAbove = placementRect.top
      const spaceBelow = viewportHeight - placementRect.bottom

      if (preferredPosition === 'bottom' && spaceBelow >= tooltipHeight + padding + arrowSize) {
        // Position below target
        tooltipTop = placementRect.bottom + arrowSize + verticalTailGap
        arrowDirection = 'up'
      } else if (preferredPosition === 'top' && spaceAbove >= tooltipHeight + padding + arrowSize) {
        // Position above target
        tooltipTop = placementRect.top - tooltipHeight - arrowSize - verticalTailGap
        arrowDirection = 'down'
      } else if (spaceBelow >= spaceAbove && spaceBelow >= 100) {
        // More space below
        tooltipTop = placementRect.bottom + arrowSize + verticalTailGap
        arrowDirection = 'up'
      } else if (spaceAbove >= 100) {
        // More space above
        tooltipTop = placementRect.top - tooltipHeight - arrowSize - verticalTailGap
        arrowDirection = 'down'
      } else {
        // Very tight space - position at center of screen
        tooltipTop = (viewportHeight - tooltipHeight) / 2
        arrowDirection =
          placementRect.top + placementRect.height / 2 > viewportHeight / 2 ? 'down' : 'up'
      }

      // Ensure tooltip stays within viewport vertically
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
    const rawArrowPct = (targetCenterInTooltip / Math.max(tooltipWidth, 1)) * 100
    // Submit sits on the right; when the tooltip is clamped horizontally, the true % can exceed 85 —
    // the old 15–85 clamp skewed the arrow left of the button. Allow a wider range on those steps only.
    arrowOffset = isSubmitTooltipStep
      ? Math.max(4, Math.min(96, rawArrowPct))
      : Math.max(15, Math.min(85, rawArrowPct))

    setTooltipPosition(prev => {
      if (
        prev &&
        !prev.useFullscreen &&
        Math.abs(prev.top - tooltipTop) < 0.5 &&
        Math.abs(prev.left - tooltipLeft) < 0.5 &&
        prev.arrowDirection === arrowDirection &&
        Math.abs(prev.arrowOffset - arrowOffset) < 0.5
      ) {
        return prev
      }
      return {
        top: tooltipTop,
        left: tooltipLeft,
        arrowDirection,
        arrowOffset,
        useFullscreen: false,
      }
    })
  }, [targetElement, step, tooltipEstimatedHeight])

  // Follow-up step: the portaled composer runs `composer-float-in` (~350ms). Early position reads run
  // while `translateY(20px)` is still applied, so fixed cutouts sit too low; this step also skips the
  // 200ms polling used on other steps. Recalculate when the float animation ends (and via fallback).
  useEffect(() => {
    if (step !== 'follow-up' || !targetElement) return

    const onAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName !== 'composer-float-in' && e.animationName !== 'composer-float-in-moz')
        return
      if (spotlightSettledRef.current) return
      calculatePositions()
    }

    targetElement.addEventListener('animationend', onAnimationEnd)
    const fallback = window.setTimeout(() => {
      if (spotlightSettledRef.current) return
      calculatePositions()
    }, 450)

    return () => {
      targetElement.removeEventListener('animationend', onAnimationEnd)
      window.clearTimeout(fallback)
    }
  }, [step, targetElement, calculatePositions])

  // Update positions on mount, scroll, resize
  useEffect(() => {
    if (!targetElement || !step) return
    const targetEl = targetElement
    const currentStep = step

    const alreadySettled = spotlightSettledRef.current && settledStepRef.current === currentStep

    let cancelled = false
    // Instant scroll. A smooth scroll plus a timer to fade in is clamped to about
    // a second on Mobile Safari during the test wait, so the card stays transparent
    // until the sample window is almost over.
    const behavior: ScrollBehavior = 'auto'

    const scrollByDelta = (delta: number, scrollBehavior: ScrollBehavior = behavior) => {
      if (Math.abs(delta) < 1) return
      const root = getTutorialScrollRoot()
      root.scrollToTop(Math.max(0, root.getScrollTop() + delta), scrollBehavior)
    }

    function scrollTargetIntoView() {
      const rect = targetEl.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const root = getTutorialScrollRoot()

      if (TEXTAREA_STEPS.includes(currentStep)) {
        root.scrollToTop(0, behavior)
      } else if (isProviderPickerTutorialStep(currentStep)) {
        scrollTutorialProvidersIntoView(
          tutorialProviderNamesRef.current,
          currentStep as TutorialProviderLayoutStep
        )
      } else if (currentStep === 'follow-up') {
        const arrowSize = 10
        const underComposerGap = 8
        const bottomPadding = 12
        const measuredTooltipHeight =
          overlayRef.current?.getBoundingClientRect().height ?? tooltipEstimatedHeight
        const needBelow = measuredTooltipHeight + arrowSize + underComposerGap + bottomPadding
        const spaceBelow = viewportHeight - rect.bottom
        if (spaceBelow < needBelow) scrollByDelta(needBelow - spaceBelow)
      } else if (currentStep === 'view-follow-up-results') {
        const a = 10
        const sideGap = 10
        const abovePad = 8
        const h = overlayRef.current?.getBoundingClientRect().height ?? tooltipEstimatedHeight
        const needAbove = h + a + sideGap
        const needBelow = h + a + abovePad
        const topPad = 12
        const roomAbove = rect.top - topPad
        const roomBelow = viewportHeight - rect.bottom - topPad
        if (roomAbove < needAbove && roomBelow >= needBelow) {
          const delta = rect.top - (topPad + needAbove)
          if (delta < 0) scrollByDelta(delta)
        } else if (roomBelow < needBelow && roomAbove >= needAbove) {
          scrollByDelta(needBelow - roomBelow)
        } else if (roomAbove < needAbove && roomBelow < needBelow) {
          if (roomAbove < roomBelow) {
            const delta = rect.top - (topPad + needAbove)
            if (delta < 0) scrollByDelta(delta)
          } else {
            scrollByDelta(needBelow - roomBelow)
          }
        }
      } else if (DROPDOWN_STEPS.includes(currentStep)) {
        const arrowSize = 10
        const tooltipSpacing = arrowSize + 8
        const totalTooltipHeight = tooltipEstimatedHeight + tooltipSpacing
        const topMargin = 80
        const tooltipTop = rect.top - totalTooltipHeight
        if (rect.bottom < 0 || rect.top > viewportHeight) {
          // WebKit drops smooth scrolls that start outside the click gesture, which
          // left the history control off-screen and swapped the Done card for the hint.
          scrollByDelta(rect.top - (topMargin + totalTooltipHeight), 'auto')
        } else if (tooltipTop < topMargin) {
          const scrollAdjustment = rect.top - (topMargin + totalTooltipHeight)
          if (scrollAdjustment < 0) scrollByDelta(scrollAdjustment)
        } else if (rect.top < topMargin + totalTooltipHeight) {
          scrollByDelta(-(topMargin + totalTooltipHeight - rect.top))
        }
      } else {
        const margin = 150
        if (rect.top < margin) scrollByDelta(rect.top - margin)
        else if (rect.bottom > viewportHeight - margin) {
          scrollByDelta(rect.bottom - viewportHeight + margin)
        }
      }
    }

    let fadeStarted = false
    let fadeAt = 0
    let corrections = 0
    let lastViewportHeight = window.visualViewport?.height ?? window.innerHeight
    let lastInnerHeight = window.innerHeight

    const viewportHeightChanged = () => {
      const viewport = window.visualViewport?.height ?? window.innerHeight
      const inner = window.innerHeight
      const changed =
        Math.abs(viewport - lastViewportHeight) >= 40 || Math.abs(inner - lastInnerHeight) >= 40
      lastViewportHeight = viewport
      lastInnerHeight = inner
      if (!changed) return false
      corrections = 0
      return true
    }

    const showSettledTooltip = () => {
      if (stepRef.current !== currentStep) return
      isStepTransitioningRef.current = false
      setIsStepTransitioning(false)
      setTutorialSpotlightSettling(false)
      fadeStarted = true
      fadeAt = performance.now()
    }

    const revealSettledStep = () => {
      if (cancelled || stepRef.current !== currentStep) return
      if (spotlightSettledRef.current && settledStepRef.current === currentStep) return
      calculatePositions()
      setIsVisible(true)
      spotlightSettledRef.current = true
      settledStepRef.current = currentStep
      showSettledTooltip()
    }

    const restabilize = () => {
      if (!fadeStarted || corrections >= 1 || cancelled || stepRef.current !== currentStep) return
      corrections += 1
      fadeStarted = false
      isStepTransitioningRef.current = true
      setIsStepTransitioning(true)
      setTutorialSpotlightSettling(true)
      void waitForTutorialLayoutSettle({ timeoutMs: 600, quietMs: 80 }).then(() => {
        if (cancelled || stepRef.current !== currentStep) return
        revealSettledStep()
      })
    }

    if (alreadySettled) {
      // A remount during the fade used to leave the hide class on. WebKit then
      // ignores clicks on the card, so "Done with input" never advances the step.
      fadeStarted = true
      isStepTransitioningRef.current = false
      setIsStepTransitioning(false)
      setTutorialSpotlightSettling(false)
    } else {
      scrollTargetIntoView()
      if (TEXTAREA_STEPS.includes(currentStep)) focusTutorialPromptTextarea()
      revealSettledStep()
    }

    const keyboardSettled = () => fadeStarted && performance.now() - fadeAt >= 600
    const schedulePositionUpdate = () => {
      if (!spotlightSettledRef.current || settledStepRef.current !== currentStep) return
      if (currentStep !== 'enter-prompt' && currentStep !== 'enter-prompt-2') return
      if (!keyboardSettled()) return
      if (!viewportHeightChanged()) return
      fadeStarted = true
      restabilize()
    }
    const onViewport = () => {
      if (!spotlightSettledRef.current || settledStepRef.current !== currentStep) return
      if (currentStep !== 'enter-prompt' && currentStep !== 'enter-prompt-2') return
      if (!keyboardSettled()) return
      if (!viewportHeightChanged()) return
      fadeStarted = true
      restabilize()
    }

    window.addEventListener('scroll', schedulePositionUpdate, true)
    window.addEventListener('resize', schedulePositionUpdate)
    const appScrollHost = document.querySelector('.app') as HTMLElement | null
    appScrollHost?.addEventListener('scroll', schedulePositionUpdate)
    window.visualViewport?.addEventListener('resize', onViewport)

    return () => {
      cancelled = true
      window.removeEventListener('scroll', schedulePositionUpdate, true)
      window.removeEventListener('resize', schedulePositionUpdate)
      appScrollHost?.removeEventListener('scroll', schedulePositionUpdate)
      window.visualViewport?.removeEventListener('resize', onViewport)
      if (!spotlightSettledRef.current) {
        try {
          const root = getTutorialScrollRoot()
          root.scrollToTop(root.getScrollTop(), 'auto')
        } catch {
          // jsdom does not implement Element.scrollTo.
        }
      }
    }
  }, [targetElement, step, calculatePositions, tooltipEstimatedHeight])

  useEffect(() => {
    if (!step || (!isSelectModelTutorialStep(step) && step !== 'expand-starter-provider-2')) {
      return
    }

    const maintainSelectStepOverlay = () => {
      const current = stepRef.current
      if (
        !current ||
        (!isSelectModelTutorialStep(current) && current !== 'expand-starter-provider-2')
      ) {
        return
      }
      const layout = getTutorialProviderStepLayout(
        current as TutorialProviderLayoutStep,
        tutorialProviderNamesRef.current
      )
      layout.highlights.forEach(el => {
        el.classList.add('mobile-tutorial-highlight')
      })
      const next = layout.highlights[0]
      if (next) setTargetElement(prev => (prev === next ? prev : next))
    }

    maintainSelectStepOverlay()
    const interval = window.setInterval(maintainSelectStepOverlay, 250)

    return () => {
      window.clearInterval(interval)
    }
  }, [step, tutorialProviderNames])

  // Add highlight class to target element
  useEffect(() => {
    if (!targetElement || !step) return

    const providerHighlights =
      step === 'select-models'
        ? getTutorialProviderStepLayout('select-models', tutorialProviderNamesRef.current)
            .highlights
        : step === 'expand-provider' || step === 'expand-starter-provider-2'
          ? getTutorialProviderStepLayout(
              step as 'expand-provider' | 'expand-starter-provider-2',
              tutorialProviderNamesRef.current
            ).highlights
          : [targetElement]

    providerHighlights.forEach(el => el.classList.add('mobile-tutorial-highlight'))

    // Add button pulsate when tooltip says "Tap the highlighted button" (same ring + pulse as submit step).
    if (
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'history-dropdown' ||
      step === 'save-selection'
    ) {
      targetElement.classList.add('mobile-tutorial-button-pulsate')
    }

    // Step 5: full results section; step 6: response body (grid or tab content) + tabs pulse on mobile
    const resultsSection =
      step === 'follow-up' ? (document.querySelector('.results-section') as HTMLElement) : null
    if (resultsSection) {
      resultsSection.classList.add('mobile-tutorial-highlight')
    }
    if (step === 'follow-up' || step === 'view-follow-up-results') {
      const tabsHeader = document.querySelector('.results-tabs-header') as HTMLElement
      if (tabsHeader) {
        tabsHeader.classList.add('mobile-tutorial-tabs-pulse')
      }
    }

    // For submit steps and follow-up, highlight the composer (match step 3). Follow-up also highlights the hero mirror when present.
    if (step === 'submit-comparison' || step === 'submit-comparison-2' || step === 'follow-up') {
      const composer = getComposerElement()
      if (composer) {
        composer.classList.add('mobile-tutorial-highlight')
      }
      if (step === 'follow-up') {
        const mirror = getHeroMirrorComposerIfPresent()
        if (mirror && mirror !== composer) {
          mirror.classList.add('mobile-tutorial-highlight')
        }
      }
    }

    // Steps 7–8: same pattern as step 4 — composer faint glow + framed backdrop cutout; toggles use pulsate.
    if (step === 'history-dropdown' || step === 'save-selection') {
      const composer = getHeroComposerForDropdownSteps()
      if (composer) {
        composer.classList.add('mobile-tutorial-highlight')
        composer.classList.add('tutorial-dropdown-container-active')
      }
    }

    return () => {
      const nextStep = stepRef.current
      if (nextStep && isProviderPickerTutorialStep(nextStep)) {
        return
      }
      getHeroComposerForDropdownSteps()?.classList.remove('tutorial-dropdown-container-active')
      providerHighlights.forEach(el => {
        el.classList.remove('mobile-tutorial-highlight')
      })
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
        const historyDropdown = getHistoryInlineListForTutorial()
        if (historyDropdown) {
          dropdownWasOpenedRef.current = true
          setHistoryDropdownOpened(true)
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

  // Effect to handle loading/streaming cutout: submit steps, and step 5 (follow-up) after submit
  // Phase 1: Loading / “Processing responses…” (before any stream)
  // Phase 2: Results section (stream started or compare-only without inner loading in DOM)
  useEffect(() => {
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    const isReviewAfterFollowUp = step === 'view-follow-up-results'
    const isFollowUpPostSubmit = step === 'follow-up' && followUpSubmitStarted
    const useLoadingCutout =
      (isSubmitStep && isLoading) ||
      (isReviewAfterFollowUp && isLoading) ||
      (isFollowUpPostSubmit && (isLoading || streamAnswerStarted))

    if (!useLoadingCutout) {
      setLoadingStreamingRect(null)
      return
    }

    const isFollowUpStyleLoading =
      step === 'submit-comparison-2' || isReviewAfterFollowUp || isFollowUpPostSubmit

    let hasScrolledToResults = false
    let hasScrolledToLoading = false
    let loadingSectionWasSeen = false

    const updateLoadingStreamingRect = () => {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement

      if (loadingSection) {
        loadingSectionWasSeen = true
      }

      // Show “Processing responses…” first (step 5 follow-up, or review step in a loading state)
      if (
        (isFollowUpPostSubmit || isReviewAfterFollowUp) &&
        !streamAnswerStarted &&
        loadingSection
      ) {
        const rect = loadingSection.getBoundingClientRect()
        setLoadingStreamingRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        })
        if (isFollowUpPostSubmit && !hasScrolledToLoading) {
          hasScrolledToLoading = true
          requestAnimationFrame(() => {
            setTimeout(() => {
              loadingSection.scrollIntoView({ behavior: 'auto', block: 'start' })
            }, 0)
          })
        }
        return
      }

      if (resultsSection) {
        const canScroll = isFollowUpStyleLoading ? loadingSectionWasSeen : true

        if (!hasScrolledToResults && canScroll) {
          hasScrolledToResults = true
          requestAnimationFrame(() => {
            setTimeout(() => {
              resultsSection.scrollIntoView({ behavior: 'auto', block: 'start' })
            }, 100)
          })
        }

        const rect = resultsSection.getBoundingClientRect()
        setLoadingStreamingRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        })
      } else if (loadingSection) {
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

    updateLoadingStreamingRect()
    const interval = setInterval(updateLoadingStreamingRect, 100)

    return () => {
      clearInterval(interval)
      setLoadingStreamingRect(null)
    }
  }, [step, isLoading, streamAnswerStarted, followUpSubmitStarted])

  useEffect(() => {
    const loadingSection = document.querySelector('.loading-section') as HTMLElement | null
    const highlightFollowUp =
      step === 'follow-up' && followUpSubmitStarted && isLoading && !streamAnswerStarted
    const highlightReview = step === 'view-follow-up-results' && isLoading && !streamAnswerStarted
    const highlightSubmit =
      (step === 'submit-comparison' || step === 'submit-comparison-2') &&
      isLoading &&
      !streamAnswerStarted
    const isLoadingHighlightStep =
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'view-follow-up-results' ||
      step === 'follow-up'
    if (!isLoadingHighlightStep) {
      if (loadingSection) {
        loadingSection.classList.remove('mobile-tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      return
    }
    if (!(highlightFollowUp || highlightReview || highlightSubmit) || !loadingSection) {
      if (loadingSection) {
        loadingSection.classList.remove('mobile-tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      return
    }
    loadingSection.classList.add('mobile-tutorial-highlight')
    loadingSection.style.pointerEvents = 'auto'
    loadingSection.style.position = 'relative'
    return () => {
      loadingSection.classList.remove('mobile-tutorial-highlight')
      loadingSection.style.pointerEvents = ''
      loadingSection.style.position = ''
    }
  }, [step, isLoading, streamAnswerStarted, followUpSubmitStarted])

  if (
    !step ||
    !portalRoot ||
    !(isVisible || isStepTransitioning || isProviderPickerTutorialStep(step))
  ) {
    return null
  }

  const activeStep = step

  const fadeDuringTransition = isStepTransitioning

  const config = resolveTutorialStepConfig(
    activeStep,
    tutorialStarterEntries,
    tutorialSplitModelSteps
  )
  const { stepIndex, totalSteps } = getTutorialVisibleStepProgress(
    activeStep,
    tutorialVisibleStepOrder
  )
  const progressDotIndex = (() => {
    const i = tutorialVisibleStepOrder.indexOf(activeStep)
    if (i >= 0) return i
    if (activeStep === 'enter-prompt-2' || activeStep === 'submit-comparison-2') {
      return tutorialVisibleStepOrder.indexOf('follow-up')
    }
    return 0
  })()

  // Determine if current step requires an action (show tap indicator)
  const actionSteps: TutorialStep[] = [
    'expand-provider',
    'expand-starter-provider-2',
    'select-models',
    'select-starter-model-1',
    'select-starter-model-2',
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
      return 'Done'
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
      return !historyDropdownOpened
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
  const isFollowUpPostSubmit = step === 'follow-up' && followUpSubmitStarted
  const isLoadingStreamingPhase = Boolean(
    loadingStreamingRect &&
    ((isSubmitStep && isLoading) ||
      (step === 'view-follow-up-results' && isLoading) ||
      (isFollowUpPostSubmit && (isLoading || streamAnswerStarted)))
  )

  // Render scroll indicator if target is off-screen
  // Only show when:
  // 1. Target is actually off-screen
  // 2. NOT during loading/streaming phase
  // 3. NOT during automatic step transition (to avoid flashing during smooth scroll between steps)
  // These steps advance only through the card's button. Replacing the card with the
  // off-screen hint removes Done, so the step can never finish.
  const stepKeepsTooltip =
    step === 'enter-prompt' ||
    step === 'enter-prompt-2' ||
    step === 'view-follow-up-results' ||
    step === 'history-dropdown' ||
    step === 'save-selection'
  const shouldShowScrollIndicator =
    isTargetOffScreen && !isLoadingStreamingPhase && !isStepTransitioning && !stepKeepsTooltip

  // Calculate cutout for backdrop
  // Always show backdrop on mobile; use cutout to keep the target visible
  const showBackdrop = true

  // During loading/streaming phase, use loadingStreamingRect; otherwise use normal cutout logic
  // Follow-up: dual clear rects (results + composer) are rendered as SVG — skip the single box-shadow cutout
  const useFollowUpDualCutout =
    step === 'follow-up' && backdropRect && followUpComposerHoleRect && !isLoadingStreamingPhase
  const keepFramedCutoutWhileOffScreen = tutorialStepUsesFramedCutoutShadow(step)
  const cutoutTarget: TargetRect | null = isLoadingStreamingPhase
    ? loadingStreamingRect
    : shouldShowScrollIndicator && !keepFramedCutoutWhileOffScreen
      ? null
      : useFollowUpDualCutout
        ? null
        : (dropdownRect ?? backdropRect ?? targetRect)

  const cutoutPadding = 8
  const followUpBrResults = 24
  const followUpBrComposer = 32
  const tutorialFrameShadow =
    'inset 0 0 0 3px var(--accent-color), inset 0 0 0 7px rgba(14, 165, 233, 0.25), 0 0 18px rgba(14, 165, 233, 0.45)'
  const tutorialDimShadow = '0 0 0 9999px rgba(0, 0, 0, 0.65)'
  const tutorialFramedDimShadow = `${tutorialFrameShadow}, ${tutorialDimShadow}`
  const cutoutStyle =
    cutoutTarget && showBackdrop
      ? {
          position: 'absolute' as const,
          top: `${cutoutTarget.top + window.scrollY - cutoutPadding}px`,
          left: `${cutoutTarget.left + window.scrollX - cutoutPadding}px`,
          width: `${cutoutTarget.width + cutoutPadding * 2}px`,
          height: `${cutoutTarget.height + cutoutPadding * 2}px`,
          borderRadius: isLoadingStreamingPhase
            ? '20px'
            : step === 'enter-prompt' ||
                step === 'enter-prompt-2' ||
                step === 'submit-comparison' ||
                step === 'submit-comparison-2' ||
                step === 'history-dropdown' ||
                step === 'save-selection'
              ? '32px'
              : isProviderPickerTutorialStep(step)
                ? '20px'
                : step === 'follow-up' || step === 'view-follow-up-results'
                  ? '24px'
                  : '16px',
          boxShadow: tutorialStepUsesFramedCutoutShadow(step, {
            loadingOrStreaming: isLoadingStreamingPhase,
          })
            ? tutorialFramedDimShadow
            : tutorialDimShadow,
          zIndex: 9998,
          pointerEvents: 'none' as const,
        }
      : undefined

  const followUpDimMaskId = 'mobile-tutorial-follow-up-dim-mask'
  const followUpVResults =
    useFollowUpDualCutout && backdropRect
      ? {
          top: backdropRect.top - cutoutPadding,
          left: backdropRect.left - cutoutPadding,
          width: backdropRect.width + cutoutPadding * 2,
          height: backdropRect.height + cutoutPadding * 2,
        }
      : null
  const followUpVComposer =
    useFollowUpDualCutout && followUpComposerHoleRect
      ? {
          top: followUpComposerHoleRect.top - cutoutPadding,
          left: followUpComposerHoleRect.left - cutoutPadding,
          width: followUpComposerHoleRect.width + cutoutPadding * 2,
          height: followUpComposerHoleRect.height + cutoutPadding * 2,
        }
      : null

  const docScrollX = typeof window !== 'undefined' ? window.scrollX : 0
  const docScrollY = typeof window !== 'undefined' ? window.scrollY : 0

  const overlayUi = (
    <>
      {/* Backdrop: during loading/streaming, single box-shadow cutout; otherwise dual follow-up or normal */}
      {showBackdrop &&
        (isStepTransitioning ? (
          <div className="mobile-tutorial-backdrop" />
        ) : isLoadingStreamingPhase && cutoutStyle ? (
          <div
            className={`mobile-tutorial-backdrop-cutout mobile-tutorial-backdrop-cutout--enter${fadeDuringTransition ? ' mobile-tutorial-backdrop-cutout--transitioning' : ''}`}
            style={cutoutStyle}
          />
        ) : !isLoadingStreamingPhase ? (
          useFollowUpDualCutout && followUpVResults && followUpVComposer ? (
            <>
              <svg
                className="mobile-tutorial-backdrop-follow-up-dim"
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  zIndex: 9998,
                  pointerEvents: 'none',
                }}
                aria-hidden
              >
                <defs>
                  <mask id={followUpDimMaskId}>
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={followUpVResults.left}
                      y={followUpVResults.top}
                      width={followUpVResults.width}
                      height={followUpVResults.height}
                      rx={followUpBrResults}
                      ry={followUpBrResults}
                      fill="black"
                    />
                    <rect
                      x={followUpVComposer.left}
                      y={followUpVComposer.top}
                      width={followUpVComposer.width}
                      height={followUpVComposer.height}
                      rx={followUpBrComposer}
                      ry={followUpBrComposer}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0, 0, 0, 0.65)"
                  mask={`url(#${followUpDimMaskId})`}
                />
              </svg>
              <div
                className="mobile-tutorial-backdrop-cutout mobile-tutorial-backdrop-cutout--enter mobile-tutorial-backdrop-follow-up-results-ring"
                style={{
                  position: 'absolute',
                  top: `${followUpVResults.top + docScrollY}px`,
                  left: `${followUpVResults.left + docScrollX}px`,
                  width: `${followUpVResults.width}px`,
                  height: `${followUpVResults.height}px`,
                  borderRadius: `${followUpBrResults}px`,
                  boxShadow: tutorialFrameShadow,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  background: 'transparent',
                }}
              />
              <div
                className="mobile-tutorial-backdrop-cutout mobile-tutorial-backdrop-cutout--enter mobile-tutorial-backdrop-follow-up-composer-ring"
                style={{
                  position: 'absolute',
                  top: `${followUpVComposer.top + docScrollY}px`,
                  left: `${followUpVComposer.left + docScrollX}px`,
                  width: `${followUpVComposer.width}px`,
                  height: `${followUpVComposer.height}px`,
                  borderRadius: `${followUpBrComposer}px`,
                  boxShadow: tutorialFrameShadow,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  background: 'transparent',
                }}
              />
            </>
          ) : cutoutStyle ? (
            <div
              className={`mobile-tutorial-backdrop-cutout mobile-tutorial-backdrop-cutout--enter${fadeDuringTransition ? ' mobile-tutorial-backdrop-cutout--transitioning' : ''}`}
              style={cutoutStyle}
            />
          ) : (
            <div className="mobile-tutorial-backdrop" />
          )
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
      {!shouldShowScrollIndicator && !isLoadingStreamingPhase && isVisible && tooltipPosition && (
        <div
          key={step}
          ref={overlayRef}
          className={`mobile-tutorial-tooltip${tooltipPosition.useFullscreen ? ' mobile-tutorial-fullscreen-tooltip' : ''}${fadeDuringTransition ? ' mobile-tutorial-tooltip--transitioning' : ''}`}
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
                Step {stepIndex} of {totalSteps}
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
            {isActionStep && !showButton && !isSelectModelTutorialStep(step) && (
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
              {tutorialVisibleStepOrder.map((s, i) => (
                <div
                  key={s}
                  className={`mobile-tutorial-progress-dot ${i < progressDotIndex ? 'completed' : ''} ${i === progressDotIndex ? 'current' : ''}`}
                />
              ))}
            </div>
          </div>

          {/* Arrow: sibling of content (not inside) so it is not clipped by content scroll/overflow; points at the step target */}
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
      )}
    </>
  )

  return createPortal(overlayUi, portalRoot)
}

export default MobileTutorialOverlay
