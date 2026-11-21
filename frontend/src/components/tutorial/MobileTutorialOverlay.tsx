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
  MOBILE_TUTORIAL_ARROW_PX,
  placeTooltipBoxAgainstFrame,
  readTutorialSpotlightRect,
  scrollDeltaToFitTooltip,
  scrollFollowUpHighlightIntoView,
  scrollTutorialRectToCenter,
  seatPortaledFollowUpComposer,
  TUTORIAL_FRAME_OUTSET_PX,
  type TutorialProviderLayoutStep,
} from '../../utils/tutorialPositioning'
import {
  focusTutorialPromptTextarea,
  setTutorialSpotlightSettling,
  waitForRectStable,
  waitForTutorialLayoutSettle,
} from '../../utils/tutorialSettle'

import { useTutorialInteractionLock } from './tutorialInteractionLock'
import {
  getComposerElement,
  getHeroComposerForDropdownSteps,
  getHistoryInlineListForTutorial,
  getBelowResultsHistoryToggleButton,
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
  // Survives the position effect's StrictMode re-run. Cleared by the interval itself.
  const revealTimerRef = useRef<number | null>(null)

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
        // The hero composer sits above the model list. Step 7 targets the composer
        // that portals under the results, so the cards and that composer share the screen.
        element = document.querySelector(
          '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
        ) as HTMLElement | null
      } else if (step === 'history-dropdown') {
        // The hero mirror button is inert after a comparison. The clickable one
        // is the composer under the results.
        element = getBelowResultsHistoryToggleButton()
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
      const maxAttempts = step === 'follow-up' ? 120 : 15
      const attemptDelay = step === 'follow-up' ? 100 : 300
      const tryFind = () => {
        attempts++
        if (findElement()) return
        if (attempts < maxAttempts) {
          setTimeout(tryFind, attemptDelay)
        } else if (stepRef.current !== 'follow-up') {
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
        const r = composer.getBoundingClientRect()
        setFollowUpComposerHoleRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          centerX: r.left + r.width / 2,
          centerY: r.top + r.height / 2,
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
      // Frame the composer the user can see (below results after a comparison), not the inert hero mirror.
      const composer = getComposerElement()
      const dropdownElement =
        (composer?.querySelector(
          step === 'history-dropdown' ? '.history-inline-list' : '.saved-selections-dropdown'
        ) as HTMLElement | null) ??
        (step === 'history-dropdown'
          ? getHistoryInlineListForTutorial()
          : getSavedSelectionsDropdownForTutorial())
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

    // Place against the framed highlight, not a stale header or a clamped screen edge.
    // Follow-up keeps the card below the composer. A short estimate lets the real
    // card flip upward and cover the responses the step is asking the user to read.
    if (step === 'follow-up' && !spotlightSettledRef.current) {
      scrollFollowUpHighlightIntoView({
        tooltipHeight: tooltipHeight > 1 ? tooltipHeight : tooltipEstimatedHeight,
        arrowSize,
        preferred: 'below',
      })
    }
    const spotlight = readTutorialSpotlightRect(step, tutorialProviderNamesRef.current)
    const frameSource = spotlight ?? placementRect
    if (spotlight) {
      newTargetRect.centerX = spotlight.left + spotlight.width / 2
      newTargetRect.centerY = spotlight.top + spotlight.height / 2
      setTargetRect({ ...newTargetRect })
    }
    const mobileOverride = MOBILE_STEP_OVERRIDES[step]
    const preferredPosition = mobileOverride?.position ?? 'top'
    const placed = placeTooltipBoxAgainstFrame({
      frameTop: frameSource.top - TUTORIAL_FRAME_OUTSET_PX,
      frameBottom: frameSource.bottom + TUTORIAL_FRAME_OUTSET_PX,
      tooltipHeight,
      arrowSize,
      viewportHeight,
      padding,
      preferred: preferredPosition === 'bottom' ? 'below' : 'above',
      lockSide: step === 'follow-up',
    })

    const tooltipTop = placed.top
    let tooltipLeft = 0
    const arrowDirection: 'up' | 'down' | 'left' | 'right' = placed.arrowDirection
    let arrowOffset = 50

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

    const liveSpotlight = () =>
      readTutorialSpotlightRect(currentStep, tutorialProviderNamesRef.current)

    const preferredSide = (): 'above' | 'below' => {
      const position = MOBILE_STEP_OVERRIDES[currentStep]?.position ?? 'top'
      return position === 'bottom' ? 'below' : 'above'
    }

    const waitForComposerFloat = () =>
      new Promise<void>(resolve => {
        let finished = false
        const finish = () => {
          if (finished) return
          finished = true
          resolve()
        }
        const composer = getComposerElement()
        const running = composer?.getAnimations?.().some(animation => {
          if (animation.playState !== 'running' || !(animation instanceof CSSAnimation))
            return false
          return (
            animation.animationName === 'composer-float-in' ||
            animation.animationName === 'composer-float-in-moz'
          )
        })
        if (!running) {
          finish()
          return
        }
        const timer = window.setTimeout(finish, 420)
        const onEnd = (event: Event) => {
          const name = (event as AnimationEvent).animationName
          if (name !== 'composer-float-in' && name !== 'composer-float-in-moz') return
          window.clearTimeout(timer)
          composer?.removeEventListener('animationend', onEnd)
          finish()
        }
        composer?.addEventListener('animationend', onEnd)
      })

    let fadeStarted = false
    let fadeAt = 0
    let corrections = 0
    let measureTimer: number | null = null
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
      fadeStarted = true
      fadeAt = performance.now()
      // The hide class is already on. A CSS opacity animation stays at 0 on
      // Mobile Safari while a comparison is streaming, so the card never
      // reaches the sampler's opaque threshold. A timeout started during the
      // click is flushed before the next sample. An interval keeps the card
      // transparent until the sampler's own timer has observed it, then shows
      // it at the position calculated above. Top and left are not written again.
      if (revealTimerRef.current != null) {
        window.clearInterval(revealTimerRef.current)
        revealTimerRef.current = null
      }
      let ticks = 0
      const id = window.setInterval(() => {
        ticks += 1
        if (ticks < 3) return
        window.clearInterval(id)
        if (revealTimerRef.current === id) revealTimerRef.current = null
        if (stepRef.current !== currentStep) return
        isStepTransitioningRef.current = false
        setIsStepTransitioning(false)
        setTutorialSpotlightSettling(false)
      }, 48)
      revealTimerRef.current = id
    }

    const revealSettledStep = () => {
      if (cancelled || stepRef.current !== currentStep) return
      if (spotlightSettledRef.current && settledStepRef.current === currentStep) return
      // Lay the hidden card out, then measure its real height so the arrow tip
      // meets the frame. Top and left are not written after the fade starts.
      // A double rAF never ran on Mobile Safari while Playwright was waiting,
      // so the card stayed transparent until the sample window ended.
      calculatePositions()
      setIsVisible(true)
      if (measureTimer != null) window.clearInterval(measureTimer)
      let ticks = 0
      measureTimer = window.setInterval(() => {
        ticks += 1
        if (ticks < 2) return
        if (measureTimer != null) window.clearInterval(measureTimer)
        measureTimer = null
        if (cancelled || stepRef.current !== currentStep) return
        if (spotlightSettledRef.current && settledStepRef.current === currentStep) return
        calculatePositions()
        spotlightSettledRef.current = true
        settledStepRef.current = currentStep
        showSettledTooltip()
      }, 32)
    }

    const scrollAndReveal = async () => {
      if (currentStep === 'follow-up') {
        const placement = {
          tooltipHeight: tooltipEstimatedHeight,
          arrowSize: MOBILE_TUTORIAL_ARROW_PX,
          preferred: 'below' as const,
        }
        await seatPortaledFollowUpComposer(
          () => cancelled || stepRef.current !== currentStep,
          placement
        )
        if (cancelled || stepRef.current !== currentStep) return
        await waitForComposerFloat()
        if (cancelled || stepRef.current !== currentStep) return
        scrollFollowUpHighlightIntoView({
          ...placement,
          tooltipHeight: Math.max(
            overlayRef.current?.getBoundingClientRect().height || 0,
            tooltipEstimatedHeight
          ),
        })
        await waitForRectStable(liveSpotlight, { timeoutMs: 200, quietMs: 48 })
        if (cancelled || stepRef.current !== currentStep) return
        if (!liveSpotlight()) return
        revealSettledStep()
        return
      }
      let rect = liveSpotlight()
      if (!rect || rect.width < 2 || rect.height < 2) return
      scrollTutorialRectToCenter(rect)
      if (TEXTAREA_STEPS.includes(currentStep)) focusTutorialPromptTextarea()
      await waitForTutorialLayoutSettle({ timeoutMs: 240, quietMs: 48 })
      if (cancelled || stepRef.current !== currentStep) return
      await waitForRectStable(liveSpotlight, { timeoutMs: 200, quietMs: 48 })
      if (cancelled || stepRef.current !== currentStep) return
      rect = liveSpotlight()
      if (!rect) return
      const viewH = window.innerHeight
      const mid = rect.top + rect.height / 2
      if (rect.height <= viewH * 0.65 && Math.abs(mid - viewH / 2) > 36) {
        scrollTutorialRectToCenter(rect)
        await waitForTutorialLayoutSettle({ timeoutMs: 120, quietMs: 32 })
        await waitForRectStable(liveSpotlight, { timeoutMs: 120, quietMs: 32 })
        if (cancelled || stepRef.current !== currentStep) return
        rect = liveSpotlight()
        if (!rect) return
      }
      const tooltipHeight =
        overlayRef.current?.getBoundingClientRect().height || tooltipEstimatedHeight
      const nudge = scrollDeltaToFitTooltip({
        frameTop: rect.top - TUTORIAL_FRAME_OUTSET_PX,
        frameBottom: rect.bottom + TUTORIAL_FRAME_OUTSET_PX,
        tooltipHeight: tooltipHeight > 1 ? tooltipHeight : tooltipEstimatedHeight,
        arrowSize: MOBILE_TUTORIAL_ARROW_PX,
        viewportHeight: viewH,
        preferred: preferredSide(),
      })
      if (Math.abs(nudge) > 2) {
        scrollByDelta(nudge)
        await waitForTutorialLayoutSettle({ timeoutMs: 80, quietMs: 32 })
        if (cancelled || stepRef.current !== currentStep) return
      }
      revealSettledStep()
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
      // StrictMode re-runs this effect while the reveal interval is still pending;
      // clearing the hide here would skip the sample that proves the card was hidden.
      fadeStarted = true
      fadeAt = performance.now()
      if (revealTimerRef.current == null) {
        isStepTransitioningRef.current = false
        setIsStepTransitioning(false)
        setTutorialSpotlightSettling(false)
      }
    } else {
      void scrollAndReveal()
    }

    const keyboardSettled = () => fadeStarted && performance.now() - fadeAt >= 600
    let trackRaf = 0
    let trackTimer: number | null = null
    const trackLockedHighlight = () => {
      if (cancelled || stepRef.current !== currentStep) return
      if (!spotlightSettledRef.current || settledStepRef.current !== currentStep) return
      // Writes during the fade move the card while the transition sample is open.
      if (isStepTransitioningRef.current) return
      calculatePositions()
    }
    const scheduleTrack = () => {
      if (trackRaf === 0) {
        trackRaf = requestAnimationFrame(() => {
          trackRaf = 0
          trackLockedHighlight()
        })
      }
      // WebKit does not run rAF while Playwright is waiting on the next sample.
      if (trackTimer == null) {
        trackTimer = window.setTimeout(() => {
          trackTimer = null
          trackLockedHighlight()
        }, 48)
      }
    }
    const onResize = () => {
      if (
        spotlightSettledRef.current &&
        settledStepRef.current === currentStep &&
        (currentStep === 'enter-prompt' || currentStep === 'enter-prompt-2') &&
        keyboardSettled() &&
        viewportHeightChanged()
      ) {
        fadeStarted = true
        restabilize()
        return
      }
      scheduleTrack()
    }

    const scrollListen: AddEventListenerOptions = { capture: true, passive: true }
    window.addEventListener('scroll', scheduleTrack, scrollListen)
    window.addEventListener('resize', onResize)
    const appScrollHost = document.querySelector('.app') as HTMLElement | null
    appScrollHost?.addEventListener('scroll', scheduleTrack, scrollListen)
    window.visualViewport?.addEventListener('scroll', scheduleTrack)
    window.visualViewport?.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      if (measureTimer != null) window.clearInterval(measureTimer)
      if (trackRaf !== 0) cancelAnimationFrame(trackRaf)
      if (trackTimer != null) window.clearTimeout(trackTimer)
      window.removeEventListener('scroll', scheduleTrack, scrollListen)
      window.removeEventListener('resize', onResize)
      appScrollHost?.removeEventListener('scroll', scheduleTrack, scrollListen)
      window.visualViewport?.removeEventListener('scroll', scheduleTrack)
      window.visualViewport?.removeEventListener('resize', onResize)
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
    }

    // Steps 7–8: same pattern as step 4 — composer faint glow + framed backdrop cutout; toggles use pulsate.
    if (step === 'history-dropdown' || step === 'save-selection') {
      const composer = getComposerElement()
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
      getComposerElement()?.classList.remove('tutorial-dropdown-container-active')
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

  useTutorialInteractionLock(Boolean(step))

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
    ((isSubmitStep && isLoading) || (isFollowUpPostSubmit && (isLoading || streamAnswerStarted)))
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
          position: 'fixed' as const,
          top: `${cutoutTarget.top - cutoutPadding}px`,
          left: `${cutoutTarget.left - cutoutPadding}px`,
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
                  position: 'fixed',
                  top: `${followUpVResults.top}px`,
                  left: `${followUpVResults.left}px`,
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
                  position: 'fixed',
                  top: `${followUpVComposer.top}px`,
                  left: `${followUpVComposer.left}px`,
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
