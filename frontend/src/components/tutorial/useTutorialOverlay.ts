import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  isAdjacentProviderPickerTransition,
  isExpandProviderTutorialStep,
  isPrimaryExpandProviderStep,
  isProviderPickerTutorialStep,
  isSelectModelTutorialStep,
  resolveTutorialStepConfig,
  type StarterModelEntry,
} from '../../data/tutorialStepPlan'
import {
  TUTORIAL_STEPS_CONFIG,
  TUTORIAL_VISIBLE_STEP_ORDER,
  getTutorialVisibleStepProgress,
} from '../../data/tutorialSteps'
import type { TutorialStep } from '../../hooks/useTutorial'
import {
  isFollowUpComposerReady,
  isFollowUpComposerUnavailable,
} from '../../utils/followUpComposerReady'
import logger from '../../utils/logger'
import {
  getComposerElement,
  computeTextareaCutout,
  computeButtonCutout,
  advanceFollowUpStreamingRound,
  applyStreamingComparisonHighlight,
  centerTutorialStepRect,
  clearTutorialScrollTail,
  computeDropdownCutout,
  computeTargetCutout,
  desktopResultsTooltipMinTop,
  desktopTooltipClearOfProcessingPanel,
  readTooltipAnchorAvoidingProcessingPanel,
  elementHasSpotlightBox,
  ensureTutorialScrollLayer,
  getTutorialProviderDropdowns,
  getTutorialProviderStepLayout,
  getTutorialScrollMax,
  getTutorialScrollRoot,
  DESKTOP_TUTORIAL_ARROW_PX,
  readTutorialSpotlightRect,
  readStreamingComparisonSpotlight,
  scrollContentOffset,
  scrollDeltaToFitTooltip,
  scrollFollowUpHighlightIntoView,
  tutorialTooltipPrefersBelow,
  scrollTutorialElementToViewportY,
  streamingResultsTopInViewport,
  seatPortaledFollowUpComposer,
  withScrollAnchor,
  TUTORIAL_FRAME_OUTSET_PX,
  type TutorialProviderLayoutStep,
} from '../../utils/tutorialPositioning'
import {
  focusTutorialPromptTextarea,
  setTutorialSpotlightSettling,
  TUTORIAL_FRAME_RESIZED_EVENT,
  TUTORIAL_SPOTLIGHT_SETTLED_EVENT,
  trackTutorialMotion,
  tutorialBoxesNearlyEqual,
  waitForRectStable,
  waitForTutorialLayoutSettle,
  watchTutorialFrameSize,
  watchTutorialLayout,
} from '../../utils/tutorialSettle'

import { useTutorialSubmitAttention } from './tutorialSubmitAttention'
import {
  getBelowResultsHistoryToggleButton,
  getBelowResultsSavedSelectionsButton,
  getHeroComposerForDropdownSteps,
  getHeroMirrorComposerIfPresent,
  getHistoryInlineListForTutorial,
  getPortaledHistoryList,
} from './tutorialUtils'
import { useTutorialCleanup } from './useTutorialCleanup'

interface HTMLElementWithTutorialProps extends HTMLElement {
  __tutorialHeightObserver?: MutationObserver
  __tutorialHeightInterval?: number
}

/**
 * Scroll plus resize. Used where a scroll must be observed (results pin,
 * user-took-over). Highlight coordinates themselves are not rewritten from
 * viewport tops: callers stamp a scroll anchor and skip unchanged content boxes.
 */
function attachScrollResizeRaf(update: () => void): () => void {
  return trackTutorialMotion(update)
}

/** Resize and visualViewport only. Scroll must not rewrite highlight coordinates. */
function attachLayoutWatch(update: () => void): () => void {
  return watchTutorialLayout(update)
}

function placeOverlayPoint(top: number, left: number) {
  return withScrollAnchor({ top, left })
}

function overlayPointUnchanged(
  prev: { top: number; left: number; anchorX?: number; anchorY?: number },
  next: { top: number; left: number; anchorX?: number; anchorY?: number }
): boolean {
  if (
    prev.anchorY == null ||
    next.anchorY == null ||
    prev.anchorX == null ||
    next.anchorX == null
  ) {
    return Math.abs(prev.top - next.top) < 1 && Math.abs(prev.left - next.left) < 1
  }
  const a = scrollContentOffset(prev)
  const b = scrollContentOffset(next)
  return Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1
}

export function useTutorialOverlay(
  step: TutorialStep | null,
  isLoading: boolean,
  streamAnswerStarted = false,
  tutorialProviderNames: readonly string[] = [],
  tutorialVisibleStepOrder: readonly TutorialStep[] = TUTORIAL_VISIBLE_STEP_ORDER,
  tutorialStarterEntries: readonly StarterModelEntry[] = [],
  tutorialSplitModelSteps = false,
  followUpSubmitStarted = false
) {
  useTutorialSubmitAttention(step)
  const tutorialProviderNamesRef = useRef(tutorialProviderNames)
  tutorialProviderNamesRef.current = tutorialProviderNames
  const overlayRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<TutorialStep | null>(step)
  // Keep in sync during render so effect cleanups see the *incoming* step (not the previous one).
  // Stale refs caused composer/cutout cleanup to run on 3→4, 6→7, and 9→10 and produced a visible flash.
  stepRef.current = step
  /** Previous step for transition-aware cutout clearing (layout only). */
  const prevStepForCutoutRef = useRef<TutorialStep | null>(null)
  const heroHeightLockedRef = useRef<boolean>(false)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  // State for save-selection step so Done button re-renders when user clicks (ref doesn't trigger re-renders)
  const [saveSelectionDropdownOpened, setSaveSelectionDropdownOpened] = useState(false)
  const hasAttemptedElementFindRef = useRef<boolean>(false)
  const tooltipClampAttemptsRef = useRef<number>(0)
  const initialScrollCompleteRef = useRef<boolean>(false)
  /** True only after this step's single scroll and viewport settle have been measured. */
  const spotlightSettledRef = useRef(false)
  const settledStepRef = useRef<TutorialStep | null>(null)
  /** Target rect captured when the fade-in starts. Later drift hides the tooltip before a remeasure. */
  const placedAnchorRef = useRef<{ top: number; left: number } | null>(null)
  /** Scroll captured when steps 9 and 10 finish centering. Dropdown resize must not move it. */
  const frozenPairScrollRef = useRef<{ step: TutorialStep; scrollTop: number } | null>(null)
  const [spotlightSettling, setSpotlightSettling] = useState(true)
  const spotlightSettlingRef = useRef(spotlightSettling)
  spotlightSettlingRef.current = spotlightSettling
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading
  const streamAnswerStartedRef = useRef(streamAnswerStarted)
  streamAnswerStartedRef.current = streamAnswerStarted
  const followUpSubmitStartedRef = useRef(followUpSubmitStarted)
  followUpSubmitStartedRef.current = followUpSubmitStarted
  /** True after step 7's own submit, so composer seating yields to the shared spotlight. */
  const followUpStreamingRoundRef = useRef(false)
  /** After follow-up → view-follow-up-results, skip immediate tooltip show so step 5 vanishes first. */
  const suppressReviewTooltipRevealRef = useRef(false)
  const prevStepForTooltipExitRef = useRef<TutorialStep | null>(null)
  const targetElementRef = useRef<HTMLElement | null>(null)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [highlightedElements, setHighlightedElements] = useState<HTMLElement[]>([])
  const [overlayPosition, setOverlayPosition] = useState<{
    top: number
    left: number
    anchorX?: number
    anchorY?: number
  }>({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  // Dynamic position for step 3 - can switch between 'top' and 'bottom' based on scroll
  const [effectivePosition, setEffectivePosition] = useState<'top' | 'bottom' | null>(null)
  const [tooltipHidesArrow, setTooltipHidesArrow] = useState(false)
  // Suppress CSS transitions on the tooltip until initial placement is complete.
  // This prevents the tooltip from visibly animating through intermediate positions
  // during the scroll + post-scroll adjustment phase when changing steps.
  const [positionStabilized, setPositionStabilized] = useState(false)
  /** Step 1 only: after Google row is centered, apply hero lock / highlight / cutout, then tooltip. */
  const [expandProviderEffectsReady, setExpandProviderEffectsReady] = useState(false)
  const prevStepForExpandProviderRef = useRef<TutorialStep | null>(null)
  const [textareaCutout, setTextareaCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
    anchorX?: number
    anchorY?: number
  } | null>(null)
  const [dropdownCutout, setDropdownCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
    anchorX?: number
    anchorY?: number
  } | null>(null)
  const [buttonCutout, setButtonCutout] = useState<{
    top: number
    left: number
    radius: number
    anchorX?: number
    anchorY?: number
  } | null>(null)
  const [loadingStreamingCutout, setLoadingStreamingCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
    borderRadius?: number
    anchorX?: number
    anchorY?: number
  } | null>(null)
  // General-purpose cutout for target elements (used for steps without special cutout handling)
  const [targetCutout, setTargetCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
    borderRadius: number
    anchorX?: number
    anchorY?: number
  } | null>(null)

  useTutorialCleanup()

  useEffect(() => {
    // Reset dropdown opened flag when step changes away from dropdown steps
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
      setButtonCutout(null)
      clearTutorialScrollTail()
    }
  }, [step])

  // Reset save-selection flag synchronously before paint when entering step 8
  // useLayoutEffect ensures user never sees Done enabled before they've clicked
  useLayoutEffect(() => {
    if (step === 'save-selection') {
      setSaveSelectionDropdownOpened(false)
    }
  }, [step])

  // Hide tooltip and highlight before paint on every step change so the new
  // copy never appears at the previous step's coordinates.
  useLayoutEffect(() => {
    if (!step) {
      spotlightSettledRef.current = false
      settledStepRef.current = null
      setSpotlightSettling(false)
      setTutorialSpotlightSettling(false)
      return
    }
    if (settledStepRef.current === step && spotlightSettledRef.current) return
    spotlightSettledRef.current = false
    spotlightSettlingRef.current = true
    frozenPairScrollRef.current = null
    setSpotlightSettling(true)
    setTutorialSpotlightSettling(true)
    setPositionStabilized(false)
  }, [step])

  // Hide the follow-up (step 5) tooltip before paint when advancing to the review step (6),
  // so the UI does not cross-fade or slide the old tooltip into the new position.
  useLayoutEffect(() => {
    const prev = prevStepForTooltipExitRef.current
    if (prev === 'follow-up' && step === 'view-follow-up-results') {
      setIsVisible(false)
      setPositionStabilized(false)
      suppressReviewTooltipRevealRef.current = true
    }
    if (prev === 'submit-comparison' && step === 'follow-up') {
      setIsVisible(false)
      setPositionStabilized(false)
    }
    prevStepForTooltipExitRef.current = step
  }, [step])

  // Clear cutouts when the step changes, but keep holes that stay valid across specific
  // transitions so the backdrop never briefly goes full-screen (3→4, 6→7, 9→10).
  useLayoutEffect(() => {
    if (!step) {
      prevStepForCutoutRef.current = null
      setTextareaCutout(null)
      setDropdownCutout(null)
      setButtonCutout(null)
      setTargetCutout(null)
      setLoadingStreamingCutout(null)
      return
    }

    const prev = prevStepForCutoutRef.current
    if (prev === step) return

    const preserveTextareaCutout =
      (prev === 'enter-prompt' && step === 'submit-comparison') ||
      (prev === 'enter-prompt-2' && step === 'submit-comparison-2')
    const preserveDropdownCutouts = prev === 'history-dropdown' && step === 'save-selection'

    if (!preserveTextareaCutout) {
      setTextareaCutout(null)
    }
    if (!preserveDropdownCutouts) {
      setDropdownCutout(null)
      setButtonCutout(null)
    }
    const preserveProviderTargetCutout = isAdjacentProviderPickerTransition(prev, step)
    if (!preserveProviderTargetCutout) {
      setTargetCutout(null)
    }
    setLoadingStreamingCutout(null)

    prevStepForCutoutRef.current = step
  }, [step])

  useEffect(() => {
    targetElementRef.current = targetElement
  }, [targetElement])

  // The layer sits inside `.app` so absolute cutouts and tooltips scroll with the page.
  useEffect(() => {
    if (typeof document === 'undefined') return

    const el = ensureTutorialScrollLayer('tutorial-portal-root')
    setPortalRoot(el)

    return () => {
      if (el.parentNode) el.parentNode.removeChild(el)
    }
  }, [])

  // Reset clamp attempts and effective position when the step changes.
  useEffect(() => {
    tooltipClampAttemptsRef.current = 0
    setEffectivePosition(null)
    setTooltipHidesArrow(false)
  }, [step])

  // Pull the card into the viewport. This runs while it is hidden and again if a
  // late height change leaves the transformed box outside the screen.
  useLayoutEffect(() => {
    if (!isVisible) return
    const el = overlayRef.current
    if (!el) return

    // Avoid infinite adjust loops
    if (tooltipClampAttemptsRef.current > 8) return

    const margin = 12
    const rect = el.getBoundingClientRect()

    let dx = 0
    let dy = 0

    if (rect.left < margin) dx = margin - rect.left
    else if (rect.right > window.innerWidth - margin) {
      dx = window.innerWidth - margin - rect.right
    }

    // Follow-up is glued to the composer. After it settles, pulling the card
    // back into the viewport leaves it stuck over the results.
    const followComposer = step === 'follow-up' && !spotlightSettling
    if (!followComposer) {
      if (rect.top < margin) dy = margin - rect.top
      else if (rect.bottom > window.innerHeight - margin) {
        dy = window.innerHeight - margin - rect.bottom
      }
    }

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      tooltipClampAttemptsRef.current += 1
      setOverlayPosition(pos => ({ ...pos, top: pos.top + dy, left: pos.left + dx }))
    } else {
      tooltipClampAttemptsRef.current = 0
    }
  }, [isVisible, step, overlayPosition.top, overlayPosition.left, spotlightSettling])

  useLayoutEffect(() => {
    if (isPrimaryExpandProviderStep(step) && prevStepForExpandProviderRef.current !== step) {
      setExpandProviderEffectsReady(false)
    } else if (
      step === 'expand-starter-provider-2' &&
      prevStepForExpandProviderRef.current !== step
    ) {
      // Second expand: provider list is already on-screen; no hero-centering deferral.
      setExpandProviderEffectsReady(true)
    }
    prevStepForExpandProviderRef.current = step
  }, [step])

  // Default overlay position for early frames; visibility for provider steps is set
  // after the initial scroll finishes so the tooltip does not track a moving target.
  useEffect(() => {
    if (isProviderPickerTutorialStep(step)) {
      setOverlayPosition(withScrollAnchor({ top: 320, left: window.innerWidth / 2 }))
    } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      // Do NOT force visibility for enter-prompt steps.
      // These steps require scrolling to the composer first, and the scroll effect
      // controls visibility — showing the tooltip only after scroll completes.
      // Forcing isVisible=true here causes a flicker (tooltip briefly appears at wrong
      // position before the scroll effect hides it).
      // Just set a default position so the tooltip has a reasonable starting point.
      setOverlayPosition(withScrollAnchor({ top: 450, left: window.innerWidth / 2 }))
    }
  }, [step])

  // --- hero (height lock + expansion for composer visibility) ---
  useEffect(() => {
    const heroSection = document.querySelector('.hero-section') as HTMLElement

    // Helper function to clean up any existing observers/intervals
    const cleanupHeroObservers = () => {
      if (heroSection) {
        const heroSectionWithProps = heroSection as HTMLElementWithTutorialProps
        const existingObserver = heroSectionWithProps.__tutorialHeightObserver
        if (existingObserver) {
          existingObserver.disconnect()
          delete heroSectionWithProps.__tutorialHeightObserver
        }
        const existingInterval = heroSectionWithProps.__tutorialHeightInterval
        if (existingInterval) {
          clearInterval(existingInterval)
          delete heroSectionWithProps.__tutorialHeightInterval
        }
      }
    }

    // Helper function to restore hero section styles
    const restoreHeroStyles = () => {
      if (heroSection) {
        heroSection.classList.remove('tutorial-height-locked')
        heroSection.style.removeProperty('height')
        heroSection.style.removeProperty('max-height')
        heroSection.style.removeProperty('min-height')
        heroSection.style.removeProperty('padding-top')
        heroSection.style.removeProperty('padding-bottom')
        heroSection.style.removeProperty('overflow')
        document.documentElement.style.removeProperty('--hero-locked-height')
      }
    }

    if (!step) {
      // Restore hero section when tutorial ends
      cleanupHeroObservers()
      restoreHeroStyles()
      heroHeightLockedRef.current = false
      return
    }

    // For any step, first clean up any existing observers from previous tutorial session
    // This handles the restart case where step goes directly from one step to another
    cleanupHeroObservers()

    // When starting a new tutorial (first step), reset the lock state
    if (isExpandProviderTutorialStep(step)) {
      restoreHeroStyles()
      heroHeightLockedRef.current = false
    }

    // Steps that need the composer visible - don't lock height for these
    const needsComposerVisible =
      step === 'enter-prompt' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'follow-up' ||
      step === 'history-dropdown' ||
      step === 'save-selection'

    // If we're on a step that needs the composer, don't lock and ensure hero can expand
    if (needsComposerVisible) {
      restoreHeroStyles()
      heroHeightLockedRef.current = false
      return
    }

    // Lock hero section dimensions if not already locked (only for steps that don't need composer)
    if (!heroHeightLockedRef.current && heroSection) {
      // Capture all dimensions immediately, before any operations
      const computedStyle = window.getComputedStyle(heroSection)
      const rect = heroSection.getBoundingClientRect()

      // Store original values
      const originalHeight = rect.height
      const originalPaddingTop = computedStyle.paddingTop
      const originalPaddingBottom = computedStyle.paddingBottom

      // Lock height and padding
      heroSection.classList.add('tutorial-height-locked')
      heroSection.style.height = `${originalHeight}px`
      heroSection.style.maxHeight = `${originalHeight}px`
      heroSection.style.minHeight = `${originalHeight}px`
      heroSection.style.paddingTop = originalPaddingTop
      heroSection.style.paddingBottom = originalPaddingBottom

      // Set CSS custom property
      document.documentElement.style.setProperty('--hero-locked-height', `${originalHeight}px`)

      heroHeightLockedRef.current = true

      // Initial lock is sufficient for the tutorial duration
    }

    // Cleanup function for this effect
    return () => {
      cleanupHeroObservers()
    }
    // Intentionally step-only: do not depend on expandProviderEffectsReady — toggling it used to
    // re-run restoreHeroStyles() for expand-provider and unlock/relock the hero (visible bounce).
  }, [step])

  // Ensure hero can expand during steps where the composer (prompt + actions) or dropdowns must be visible.
  // Without this, the "tutorial-height-locked" behavior can clip the composer, making step 3 appear broken
  // (no composer visible => no meaningful cutout/tooltip targeting possible).
  useEffect(() => {
    const heroSection = document.querySelector('.hero-section') as HTMLElement
    if (!heroSection) return

    const needsHeroExpansion =
      step === 'history-dropdown' ||
      step === 'save-selection' ||
      step === 'enter-prompt' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'follow-up'

    if (needsHeroExpansion) {
      heroSection.classList.add('tutorial-dropdown-hero-active')
      // Remove inline styles that were set by the height-locking effect
      heroSection.style.removeProperty('height')
      heroSection.style.removeProperty('max-height')
      heroSection.style.removeProperty('min-height')
      heroSection.style.removeProperty('overflow')
      heroSection.style.overflow = 'visible'
    } else {
      heroSection.classList.remove('tutorial-dropdown-hero-active')
    }

    return () => {
      heroSection.classList.remove('tutorial-dropdown-hero-active')
    }
  }, [step])

  // --- find element, scroll into view, position tooltip ---
  useEffect(() => {
    if (!step) {
      setTargetElement(null)
      setHighlightedElements([])
      setIsVisible(false)
      setExpandProviderEffectsReady(false)
      hasAttemptedElementFindRef.current = false
      initialScrollCompleteRef.current = false
      setPositionStabilized(false)
      // Reset all cutout states when tutorial ends to prevent stale values on next run
      setTextareaCutout(null)
      setDropdownCutout(null)
      setButtonCutout(null)
      setLoadingStreamingCutout(null)
      setOverlayPosition(placeOverlayPoint(0, 0))
      setEffectivePosition(null)
      // Clean up any remaining tutorial classes when tutorial ends
      const composerElementActive = document.querySelector(
        '.composer.tutorial-textarea-active'
      ) as HTMLElement
      if (composerElementActive) {
        composerElementActive.classList.remove('tutorial-textarea-active')
      }
      // Clean up any highlighted elements
      document.querySelectorAll('.tutorial-highlight').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.classList.remove('tutorial-highlight')
        htmlEl.style.pointerEvents = ''
        htmlEl.style.position = ''
      })
      // Clean up dropdown active classes
      const historyDropdown = document.querySelector(
        '.history-inline-list.tutorial-dropdown-active'
      ) as HTMLElement
      if (historyDropdown) {
        historyDropdown.classList.remove('tutorial-dropdown-active')
      }
      const savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown.tutorial-dropdown-active'
      ) as HTMLElement
      if (savedSelectionsDropdown) {
        savedSelectionsDropdown.classList.remove('tutorial-dropdown-active')
      }
      // Clean up parent container classes
      const dropdownContainerActive = document.querySelector(
        '.composer.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (dropdownContainerActive) {
        dropdownContainerActive.classList.remove('tutorial-dropdown-container-active')
      }
      return
    }

    const config = TUTORIAL_STEPS_CONFIG[step]
    if (!config) {
      logger.warn(`No config found for tutorial step: ${step}`)
      return
    }

    // Reset scroll complete flag for the new step
    initialScrollCompleteRef.current = false

    // Reset position stabilized flag — CSS transitions on the tooltip are suppressed
    // until the initial scroll + position adjustments settle.
    setPositionStabilized(false)

    // Cutout resets run in the layout effect above (transition-aware). Avoid clearing here —
    // a passive-effect clear after layout caused one painted frame of missing holes.

    // Wait for element to be available
    const findElement = () => {
      let element: HTMLElement | null = null

      // Tutorial provider steps: first provider (step 1) or all tutorial providers (step 2)
      if (isProviderPickerTutorialStep(step)) {
        const layout = getTutorialProviderStepLayout(
          step as TutorialProviderLayoutStep,
          tutorialProviderNamesRef.current
        )
        if (layout.anchor && layout.highlights.length > 0) {
          if (isExpandProviderTutorialStep(step)) {
            element = layout.anchor
          } else {
            element = layout.highlights[0]
          }
          setHighlightedElements(layout.highlights)
        }
      } else if (step === 'history-dropdown') {
        // The clickable toggle is the composer under the results, not the hero mirror.
        element = getBelowResultsHistoryToggleButton()
        const historyDropdown = getPortaledHistoryList()
        if (historyDropdown) {
          setHighlightedElements([historyDropdown])
        } else {
          setHighlightedElements([])
        }
        if (element) {
          setButtonCutout(computeButtonCutout(element))
        }
      } else if (step === 'save-selection') {
        element = getBelowResultsSavedSelectionsButton()
        const savedSelectionsDropdown = getComposerElement()?.querySelector(
          '.saved-selections-dropdown'
        ) as HTMLElement | null
        if (savedSelectionsDropdown) {
          setHighlightedElements([savedSelectionsDropdown])
        } else {
          setHighlightedElements([])
        }
        if (element) {
          setButtonCutout(computeButtonCutout(element))
        }
      } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
        // Special handling for textarea container - ensure it's found and visible
        // (excludes placeholder when composer is floating)
        element = getComposerElement()
        if (step === 'enter-prompt') {
          // Highlight the textarea container for step 3
          if (element) {
            setHighlightedElements([element])
          } else {
            setHighlightedElements([])
          }
        } else {
          setHighlightedElements([]) // Clear any previous highlights for enter-prompt-2
        }
      } else if (step === 'submit-comparison') {
        // Step 4: Highlight the composer (same as step 3) and set cutout immediately
        const composerElement = getComposerElement()
        if (composerElement) {
          setHighlightedElements([composerElement])
          composerElement.classList.add('tutorial-highlight')
          composerElement.classList.add('tutorial-textarea-active')
          composerElement.style.pointerEvents = 'auto'
          composerElement.style.position = 'relative'
          const submitCutout = computeTextareaCutout(composerElement)
          // submitCutout uses viewport-relative coords (portal is on body, outside .app scroll root)
          setTextareaCutout(submitCutout)
        }
        // Use default selector for the submit button as target element
        element = document.querySelector(config.targetSelector) as HTMLElement
      } else if (step === 'submit-comparison-2') {
        // Special handling for submit-comparison-2 - highlight the Comparison Results card or loading section
        const resultsSection = document.querySelector('.results-section') as HTMLElement
        const loadingSection = document.querySelector('.loading-section') as HTMLElement
        const elementsToHighlight: HTMLElement[] = []
        if (loadingSection) {
          elementsToHighlight.push(loadingSection)
        }
        if (resultsSection) {
          elementsToHighlight.push(resultsSection)
        }
        setHighlightedElements(elementsToHighlight)
        // Use default selector for the submit button
        element = document.querySelector(config.targetSelector) as HTMLElement
      } else if (step === 'view-follow-up-results') {
        element = document.querySelector('.results-section') as HTMLElement
        if (element) {
          setHighlightedElements([element])
        } else {
          setHighlightedElements([])
        }
      } else if (step === 'follow-up') {
        // Backdrop cutout: results + the composer under them. The hero composer is above
        // the model list; framing it pushes the result cards off the bottom of the screen.
        const resultsSection = document.querySelector('.results-section') as HTMLElement
        setHighlightedElements(resultsSection ? [resultsSection] : [])
        element = document.querySelector(
          '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
        ) as HTMLElement | null
      } else {
        // Use default selector for other steps
        element = document.querySelector(config.targetSelector) as HTMLElement
        setHighlightedElements([]) // Clear highlights for all other steps
      }

      if (element) {
        // For textarea container, check if it's visible (might be in viewport)
        const isElementVisible =
          element.offsetParent !== null || (element.offsetWidth > 0 && element.offsetHeight > 0)

        if (isElementVisible) {
          setTargetElement(element)
          // For enter-prompt steps and step 5→6 transition, DON'T set visible here —
          // the scroll effect controls visibility and will show the tooltip after
          // scrolling completes. Setting it here causes a brief flash at the wrong position.
          if (
            step !== 'enter-prompt' &&
            step !== 'enter-prompt-2' &&
            step !== 'follow-up' &&
            !isProviderPickerTutorialStep(step) &&
            !(step === 'view-follow-up-results' && suppressReviewTooltipRevealRef.current)
          ) {
            setIsVisible(true)
          }
          return true
        }
      }
      return false
    }

    // Mark that we've attempted to find the element
    hasAttemptedElementFindRef.current = true

    // Try immediately
    if (!findElement()) {
      // If not found, wait a bit and try again (for dynamically rendered elements)
      // Try multiple times with increasing delays
      let attempts = 0
      const maxAttempts = step === 'follow-up' ? 40 : 20
      const attemptDelay = step === 'follow-up' ? 100 : 300

      const tryFind = () => {
        attempts++
        if (findElement()) {
          return
        }
        if (attempts < maxAttempts) {
          setTimeout(tryFind, attemptDelay)
        } else {
          logger.warn(
            `Tutorial target not found after ${maxAttempts} attempts: ${config.targetSelector}`
          )
          // In production, element finding might fail due to timing or DOM differences
          // Try to find a fallback element or show tooltip anyway
          const fallbackElement = document.querySelector(config.targetSelector) as HTMLElement
          if (fallbackElement) {
            setTargetElement(fallbackElement)
            if (stepRef.current !== 'follow-up') setIsVisible(true)
          } else if (stepRef.current !== 'follow-up') {
            if (isProviderPickerTutorialStep(step)) {
              const layout = getTutorialProviderStepLayout(
                step as TutorialProviderLayoutStep,
                tutorialProviderNamesRef.current
              )
              const headerElement = isExpandProviderTutorialStep(step)
                ? layout.anchor
                : layout.highlights[0]
              if (headerElement) {
                setTargetElement(headerElement)
                if (layout.highlights.length > 0) {
                  setHighlightedElements(layout.highlights)
                }
                return
              }
            }
            // Last resort: show tooltip anyway (it will be positioned at 0,0 but visible)
            setIsVisible(true)
          }
        }
      }

      const timeout = setTimeout(tryFind, attemptDelay)
      return () => clearTimeout(timeout)
    } else {
      // Element found immediately - mark attempt as complete
      hasAttemptedElementFindRef.current = true
    }
  }, [step])

  useEffect(() => {
    if (!step) return
    // follow-up: layout using live `getComposerElement()` — the after-results composer can
    // remount when layout settles; syncing that into `targetElement` every 200ms re-ran this
    // effect and cancelled the in-progress scroll (looked like step 5 appearing twice).
    if (step === 'follow-up') {
      if (!getComposerElement() && !targetElement) return
    } else if (!targetElement) {
      return
    }

    const config = TUTORIAL_STEPS_CONFIG[step]
    let scrollDelayTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let freezeScrollOnCleanup = true

    const layoutTarget = (): HTMLElement | null => {
      if (step === 'follow-up') {
        return getComposerElement() ?? targetElement
      }
      return targetElement
    }

    const layoutRectForStep = (): DOMRect | null => {
      const spot = readStreamingComparisonSpotlight(streamAnswerStartedRef.current)
      const comparisonStep =
        step === 'submit-comparison' ||
        step === 'submit-comparison-2' ||
        step === 'follow-up' ||
        step === 'view-follow-up-results'
      // Anchor the card to the processing panel until the first streamed token.
      if (spot?.kind === 'loading' && comparisonStep) {
        return spot.element.getBoundingClientRect()
      }
      return readTutorialSpotlightRect(step, tutorialProviderNamesRef.current)
    }

    const readAnchor = (): { top: number; left: number } | null => {
      const el = layoutTarget()
      if (!el) return null
      const rect = layoutRectForStep() ?? el.getBoundingClientRect()
      return { top: rect.top, left: rect.left }
    }

    const anchorMoved = () => {
      const next = readAnchor()
      const prev = placedAnchorRef.current
      if (!next || !prev) return false
      return Math.abs(next.top - prev.top) >= 4 || Math.abs(next.left - prev.left) >= 4
    }

    const updatePosition = () => {
      const el = layoutTarget()
      if (!el) return
      const pairStep = step === 'history-dropdown' || step === 'save-selection'
      const frozen = frozenPairScrollRef.current
      if (
        pairStep &&
        spotlightSettledRef.current &&
        settledStepRef.current === step &&
        frozen?.step === step
      ) {
        const root = getTutorialScrollRoot()
        if (Math.abs(root.getScrollTop() - frozen.scrollTop) > 0.5) {
          root.scrollToTop(frozen.scrollTop, 'auto')
        }
        return
      }
      const rect = layoutRectForStep() ?? el.getBoundingClientRect()
      // The processing panel can own the cutout. The card never anchors to it.
      const placed = desktopTooltipClearOfProcessingPanel(
        rect,
        step,
        config,
        tutorialProviderNamesRef.current
      )
      setEffectivePosition(placed.effectivePosition)
      setTooltipHidesArrow(placed.hideArrow)
      setOverlayPosition(placeOverlayPoint(placed.top, placed.left))
    }

    let fadeStarted = false

    const showSettledTooltip = () => {
      window.setTimeout(() => {
        if (cancelled || stepRef.current !== step) return
        placedAnchorRef.current = readAnchor()
        setPositionStabilized(true)
        setSpotlightSettling(false)
        setTutorialSpotlightSettling(false)
        fadeStarted = true
      }, 32)
    }

    const scrollRoot = getTutorialScrollRoot()

    const scrollOnce = () => {
      const el = layoutTarget()
      const rect = layoutRectForStep() ?? el?.getBoundingClientRect()
      if (!rect) return
      if (tutorialTooltipPrefersBelow(step)) {
        scrollFollowUpHighlightIntoView({
          tooltipHeight: window.innerHeight < 700 ? 160 : 210,
          arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
          preferred: 'below',
        })
      } else {
        centerTutorialStepRect(step, rect)
      }
    }

    const revealSettledStep = () => {
      if (cancelled || stepRef.current !== step) return
      if (isPrimaryExpandProviderStep(step)) {
        setExpandProviderEffectsReady(true)
      }
      updatePosition()
      if (step === 'history-dropdown' || step === 'save-selection') {
        frozenPairScrollRef.current = {
          step,
          scrollTop: getTutorialScrollRoot().getScrollTop(),
        }
      }
      initialScrollCompleteRef.current = true
      spotlightSettledRef.current = true
      settledStepRef.current = step
      freezeScrollOnCleanup = false
      setIsVisible(true)
      window.dispatchEvent(new Event(TUTORIAL_SPOTLIGHT_SETTLED_EVENT))
      // Paint the hidden tooltip at its final coordinates, then fade opacity in.
      showSettledTooltip()
    }

    const scrollDelay = isExpandProviderTutorialStep(step)
      ? step === 'expand-provider'
        ? 0
        : 150
      : step === 'enter-prompt' || step === 'enter-prompt-2'
        ? 150
        : step === 'follow-up'
          ? 220
          : 100

    // Target identity can change after the step has settled (composer remount).
    // Measure once; do not scroll or restart the fade.
    const alreadySettled = spotlightSettledRef.current && settledStepRef.current === step
    if (alreadySettled) {
      freezeScrollOnCleanup = false
      const pairStep = step === 'history-dropdown' || step === 'save-selection'
      if (!pairStep && anchorMoved()) {
        setSpotlightSettling(true)
        setTutorialSpotlightSettling(true)
        setPositionStabilized(false)
        updatePosition()
        showSettledTooltip()
      } else {
        fadeStarted = true
        setPositionStabilized(true)
        setSpotlightSettling(false)
        setTutorialSpotlightSettling(false)
      }
    } else {
      scrollDelayTimer = setTimeout(() => {
        scrollDelayTimer = null
        void (async () => {
          if (cancelled || stepRef.current !== step) return
          if (step === 'follow-up') {
            const seated = await seatPortaledFollowUpComposer(
              () => cancelled || stepRef.current !== step,
              {
                tooltipHeight: window.innerHeight < 700 ? 160 : 210,
                arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
                preferred: config.position === 'bottom' ? 'below' : 'above',
              }
            )
            if (cancelled || stepRef.current !== step) return
            if (seated) revealSettledStep()
            return
          }
          scrollOnce()
          if (step === 'enter-prompt' || step === 'enter-prompt-2') {
            focusTutorialPromptTextarea()
          }
          await waitForTutorialLayoutSettle()
          if (cancelled || stepRef.current !== step) return
          await waitForRectStable(() => layoutRectForStep(), { timeoutMs: 400, quietMs: 80 })
          if (cancelled || stepRef.current !== step) return
          scrollOnce()
          await waitForRectStable(() => layoutRectForStep(), { timeoutMs: 280, quietMs: 80 })
          if (cancelled || stepRef.current !== step) return
          const fitted = layoutRectForStep()
          if (fitted) {
            const delta = scrollDeltaToFitTooltip({
              frameTop: fitted.top - TUTORIAL_FRAME_OUTSET_PX,
              frameBottom: fitted.bottom + TUTORIAL_FRAME_OUTSET_PX,
              tooltipHeight: window.innerHeight < 700 ? 160 : 210,
              arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
              viewportHeight: window.innerHeight,
              preferred: config.position === 'bottom' ? 'below' : 'above',
            })
            if (Math.abs(delta) > 2) {
              const root = getTutorialScrollRoot()
              const maxScroll = getTutorialScrollMax()
              root.scrollToTop(
                Math.max(0, Math.min(root.getScrollTop() + delta, maxScroll)),
                'auto'
              )
              await waitForRectStable(() => layoutRectForStep(), { timeoutMs: 240, quietMs: 60 })
            }
          }
          revealSettledStep()
        })()
      }, scrollDelay)
    }

    let trackRaf = 0
    let trackTimer: number | null = null
    const trackTooltip = () => {
      if (cancelled || stepRef.current !== step) return
      if (!spotlightSettledRef.current || settledStepRef.current !== step || !fadeStarted) return
      updatePosition()
      window.dispatchEvent(new Event(TUTORIAL_FRAME_RESIZED_EVENT))
    }
    const scheduleTrack = () => {
      if (trackRaf === 0) {
        trackRaf = requestAnimationFrame(() => {
          trackRaf = 0
          trackTooltip()
        })
      }
      if (trackTimer == null) {
        trackTimer = window.setTimeout(() => {
          trackTimer = null
          trackTooltip()
        }, 48)
      }
    }
    const followTarget = () => {
      if (cancelled || stepRef.current !== step) return
      if (!spotlightSettledRef.current || settledStepRef.current !== step) return
      // History and save yank the page back to the seated offset. That is a
      // scroll policy, not a highlight reposition. Every other step leaves the
      // scroll layer alone: rewriting top/left from a scroll sample is what
      // made the ring lag the content.
      if (step === 'history-dropdown' || step === 'save-selection') {
        updatePosition()
      }
    }

    const detachFrameWatch = watchTutorialFrameSize(scheduleTrack)
    const detachLayoutWatch = watchTutorialLayout(scheduleTrack)
    const stopMotion = trackTutorialMotion(followTarget)

    return () => {
      cancelled = true
      detachFrameWatch()
      detachLayoutWatch()
      stopMotion()
      if (trackRaf !== 0) cancelAnimationFrame(trackRaf)
      if (trackTimer != null) window.clearTimeout(trackTimer)
      if (scrollDelayTimer !== null) clearTimeout(scrollDelayTimer)
      if (freezeScrollOnCleanup) {
        try {
          scrollRoot.scrollToTop(scrollRoot.getScrollTop(), 'auto')
        } catch {
          // jsdom does not implement Element.scrollTo.
        }
      }
    }
  }, [targetElement, step])

  // Follow-up: the results block keeps growing after the first measurement, which
  // pushes the portaled composer below the fold while the tooltip stays put.
  // This effect is intentionally not tied to targetElement — that node is replaced
  // when the composer portals, and restarting the scroll effect cancelled the correction.
  useEffect(() => {
    if (step !== 'follow-up' && step !== 'view-follow-up-results') return
    let cancelled = false
    let running = false
    let tries = 0
    // Scroll offset once the follow-up card is seated. A later user scroll must
    // not be treated as the results block pushing the composer off screen.
    let seatedTop: number | null = null
    let userTookOver = false

    const readLayout = () => {
      const spot = readStreamingComparisonSpotlight(streamAnswerStartedRef.current)
      if (spot?.kind === 'loading') return spot.element.getBoundingClientRect()
      return readTutorialSpotlightRect(step, tutorialProviderNamesRef.current)
    }

    const followUpPairOffScreen = () => {
      if (step !== 'follow-up') return false
      const composer = document
        .querySelector('[data-after-results-composer-slot] .composer:not(.composer-placeholder)')
        ?.getBoundingClientRect()
      const vh = window.innerHeight
      const composerInView = Boolean(
        composer && composer.height > 20 && composer.top < vh - 24 && composer.bottom > 24
      )
      const cardInView = Array.from(document.querySelectorAll('.result-card')).some(card => {
        const rect = card.getBoundingClientRect()
        const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0)
        return rect.width > 20 && visible >= 40
      })
      return !composerInView || !cardInView
    }

    const arrowMissesSpotlight = (rect: DOMRect) => {
      const offScreen = rect.bottom < 24 || rect.top > window.innerHeight - 24
      const arrow = document.querySelector('.tutorial-arrow') as HTMLElement | null
      if (!arrow) return true
      const box = arrow.getBoundingClientRect()
      const pointsDown = arrow.classList.contains('tutorial-arrow-top')
      const tipY = pointsDown ? box.bottom : box.top
      const edge = pointsDown
        ? rect.top - TUTORIAL_FRAME_OUTSET_PX
        : rect.bottom + TUTORIAL_FRAME_OUTSET_PX
      return offScreen || Math.abs(tipY - edge) > 8
    }

    const id = window.setInterval(() => {
      if (cancelled || running || tries >= 3 || stepRef.current !== step || userTookOver) return
      // Step 7's own request uses the same processing/results spotlight as the
      // first comparison. Seating the composer here would scroll that panel away.
      if (step === 'follow-up' && followUpStreamingRoundRef.current) return
      // The processing panel keeps the cutout. Do not drag the arrow back onto it.
      if (readStreamingComparisonSpotlight(streamAnswerStartedRef.current)?.kind === 'loading') {
        return
      }
      const tip = document.querySelector('.tutorial-tooltip') as HTMLElement | null
      if (!tip || !(Number(getComputedStyle(tip).opacity) > 0.9)) return
      if (step === 'follow-up') {
        const scrollTop = getTutorialScrollRoot().getScrollTop()
        if (seatedTop == null) {
          if (!followUpPairOffScreen()) seatedTop = scrollTop
        } else if (Math.abs(scrollTop - seatedTop) > 24) {
          userTookOver = true
          return
        }
      }
      // The arrow can already meet the composer while the card still runs
      // under the footer. Keep opening room until the laid-out card fits.
      if (tutorialTooltipPrefersBelow(step) && !userTookOver) {
        scrollFollowUpHighlightIntoView({
          tooltipHeight: tip.getBoundingClientRect().height,
          arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
          preferred: 'below',
        })
      }
      const rect = readLayout()
      const pairOffScreen = followUpPairOffScreen()
      const decision = readTooltipAnchorAvoidingProcessingPanel({
        requested: rect,
        step,
        providerNames: tutorialProviderNamesRef.current,
        tooltipHeight: window.innerHeight < 700 ? 160 : 210,
        arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
        viewportTop: 0,
        viewportHeight: window.innerHeight,
        preferred: tutorialTooltipPrefersBelow(step)
          ? 'below'
          : TUTORIAL_STEPS_CONFIG[step].position === 'bottom'
            ? 'below'
            : 'above',
        lockSide: tutorialTooltipPrefersBelow(step),
      })
      if (decision?.hideArrow) return
      const aim = decision?.anchor ?? rect
      if (!aim || (!arrowMissesSpotlight(aim) && !pairOffScreen)) return
      running = true
      tries += 1
      const scrollAtStart = getTutorialScrollRoot().getScrollTop()
      setSpotlightSettling(true)
      setTutorialSpotlightSettling(true)
      setPositionStabilized(false)
      void (async () => {
        try {
          await waitForRectStable(readLayout, { timeoutMs: 800, quietMs: 160 })
          if (cancelled || stepRef.current !== step) return
          if (
            step === 'follow-up' &&
            Math.abs(getTutorialScrollRoot().getScrollTop() - scrollAtStart) > 24
          ) {
            userTookOver = true
            return
          }
          const settled = readLayout()
          if (!settled) return
          const preferred = tutorialTooltipPrefersBelow(step)
            ? 'below'
            : TUTORIAL_STEPS_CONFIG[step].position === 'bottom'
              ? 'below'
              : 'above'
          const tooltipHeight = window.innerHeight < 700 ? 160 : 210
          if (tutorialTooltipPrefersBelow(step)) {
            scrollFollowUpHighlightIntoView({
              tooltipHeight,
              arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
              preferred: 'below',
            })
          } else {
            centerTutorialStepRect(step, settled)
            await waitForRectStable(readLayout, { timeoutMs: 240, quietMs: 60 })
            if (cancelled || stepRef.current !== step) return
            const centered = readLayout()
            if (!centered) return
            const fit = scrollDeltaToFitTooltip({
              frameTop: centered.top - TUTORIAL_FRAME_OUTSET_PX,
              frameBottom: centered.bottom + TUTORIAL_FRAME_OUTSET_PX,
              tooltipHeight,
              arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
              viewportHeight: window.innerHeight,
              preferred,
            })
            if (Math.abs(fit) > 2) {
              const root = getTutorialScrollRoot()
              root.scrollToTop(
                Math.max(0, Math.min(root.getScrollTop() + fit, getTutorialScrollMax())),
                'auto'
              )
            }
          }
          await waitForRectStable(readLayout, { timeoutMs: 400, quietMs: 80 })
          if (cancelled || stepRef.current !== step) return
          const finalRect = readLayout()
          if (!finalRect) return
          const placed = desktopTooltipClearOfProcessingPanel(
            finalRect,
            step,
            TUTORIAL_STEPS_CONFIG[step],
            tutorialProviderNamesRef.current
          )
          setEffectivePosition(placed.effectivePosition)
          setTooltipHidesArrow(placed.hideArrow)
          setOverlayPosition(placeOverlayPoint(placed.top, placed.left))
        } finally {
          if (!cancelled && stepRef.current === step) {
            setPositionStabilized(true)
            setSpotlightSettling(false)
            setTutorialSpotlightSettling(false)
            if (step === 'follow-up' && !userTookOver) {
              seatedTop = getTutorialScrollRoot().getScrollTop()
            }
          }
          running = false
        }
      })()
    }, 200)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [step])

  // Add highlight class to target element(s)
  useEffect(() => {
    if (!step) return

    // No steps skip highlighting - all steps get consistent highlights
    const shouldSkipHighlight = false
    const isDropdownStep = step === 'history-dropdown' || step === 'save-selection'

    let elementsToHighlight: HTMLElement[] = []
    if (isProviderPickerTutorialStep(step)) {
      if (isPrimaryExpandProviderStep(step) && !expandProviderEffectsReady) {
        elementsToHighlight = []
      } else {
        elementsToHighlight = getTutorialProviderStepLayout(
          step as TutorialProviderLayoutStep,
          tutorialProviderNamesRef.current
        ).highlights
      }
    } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      // Highlight the textarea container for step 3 and step 6 (consistent highlight)
      const composerElement = getComposerElement()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'history-dropdown') {
      // Highlight the composer the user can see, not the inert hero mirror.
      const composerElement = getComposerElement()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
      // Explicitly remove highlight from results section when transitioning to step 7
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      if (resultsSection) {
        resultsSection.classList.remove('tutorial-highlight')
        resultsSection.style.pointerEvents = ''
        resultsSection.style.position = ''
      }
    } else if (step === 'save-selection') {
      const composerElement = getComposerElement()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'follow-up' ||
      step === 'view-follow-up-results'
    ) {
      const kind = applyStreamingComparisonHighlight(streamAnswerStartedRef.current)
      const loadingSection = document.querySelector('.loading-section') as HTMLElement | null
      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      if (kind === 'loading' && loadingSection) {
        elementsToHighlight = [loadingSection]
      } else if (kind === 'results' && resultsSection) {
        elementsToHighlight = [resultsSection]
        // Step 7 and step 8 both anchor the card on the composer, so that
        // composer gets the same ring as the results frame.
        if (step === 'follow-up' || step === 'view-follow-up-results') {
          const composerElement = getComposerElement()
          if (composerElement) elementsToHighlight.push(composerElement)
        }
      } else if (step === 'submit-comparison' || step === 'submit-comparison-2') {
        const composerElement = getComposerElement()
        if (composerElement) elementsToHighlight = [composerElement]
      }
    } else if (!shouldSkipHighlight) {
      elementsToHighlight =
        highlightedElements.length > 0 ? highlightedElements : targetElement ? [targetElement] : []
    }

    // Also add class to textarea container if it's part of textarea-related steps
    // Create cutout for textarea-related steps so the textarea isn't dimmed by the backdrop
    const shouldExcludeTextarea =
      step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'enter-prompt-2' ||
      step === 'follow-up'
    let composerElement: HTMLElement | null = null
    // Step 5 (follow-up): dual-hole backdrop syncs textarea + target cutouts in one pass (see dedicated effect).
    if (shouldExcludeTextarea && step !== 'follow-up') {
      composerElement = getComposerElement()
      const cutout = composerElement ? computeTextareaCutout(composerElement) : null
      setTextareaCutout(cutout)
    } else if (!isDropdownStep && step !== 'follow-up' && step !== 'view-follow-up-results') {
      // Only clear textarea cutout if we're not on a dropdown step.
      // Step 8 keeps the composer hole that step 7 opened.
      setTextareaCutout(null)
    }

    // Add class to dropdowns during steps 7 and 8 to keep them above backdrop
    // Also ensure parent container is above backdrop and create cutout
    let historyDropdown: HTMLElement | null = null
    let savedSelectionsDropdown: HTMLElement | null = null
    let dropdownContainer: HTMLElement | null = null
    if (step === 'history-dropdown') {
      dropdownContainer = getComposerElement()
      historyDropdown = getPortaledHistoryList()
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        if (historyDropdown) {
          historyDropdown.classList.add('tutorial-dropdown-active')
          historyDropdown.classList.add('tutorial-highlight')
        }
        const historyCutout = computeDropdownCutout(dropdownContainer, historyDropdown)
        setDropdownCutout(historyCutout)
      }
    } else if (step === 'save-selection') {
      dropdownContainer = getComposerElement()
      historyDropdown = getPortaledHistoryList()
      savedSelectionsDropdown = dropdownContainer?.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement | null
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        dropdownContainer.classList.add('tutorial-highlight')
      }
      document.querySelectorAll('.history-toggle-button').forEach(el => {
        el.classList.remove('tutorial-highlight')
      })
      if (savedSelectionsDropdown) {
        savedSelectionsDropdown.classList.add('tutorial-dropdown-active')
        savedSelectionsDropdown.classList.add('tutorial-highlight')
      }
      if (dropdownContainer) {
        setDropdownCutout(
          computeDropdownCutout(dropdownContainer, savedSelectionsDropdown ?? historyDropdown)
        )
      }
    } else if (!isDropdownStep) {
      // Only clear cutout when NOT on a dropdown step
      setDropdownCutout(null)
    }
    // If we're on a dropdown step, don't touch the cutout - let the continuous effect handle it

    // Apply highlight to all elements
    elementsToHighlight.forEach(el => {
      if (el) {
        el.classList.add('tutorial-highlight')
        // Ensure the element is interactive
        el.style.pointerEvents = 'auto'
        el.style.position = 'relative'
      }
    })

    return () => {
      // Check current step from ref (always up-to-date)
      const currentStep = stepRef.current

      // Only remove highlights when step actually changes away from steps that maintain highlights.
      // If we're still on these steps, keep the highlight even if elements change.
      if (
        !isProviderPickerTutorialStep(currentStep) &&
        currentStep !== 'enter-prompt' &&
        currentStep !== 'enter-prompt-2' &&
        currentStep !== 'submit-comparison' &&
        currentStep !== 'submit-comparison-2' &&
        currentStep !== 'follow-up' &&
        currentStep !== 'view-follow-up-results' &&
        currentStep !== 'history-dropdown' &&
        currentStep !== 'save-selection'
      ) {
        // Clean up all highlighted elements from this effect
        elementsToHighlight.forEach(el => {
          if (el) {
            el.classList.remove('tutorial-highlight')
            el.style.pointerEvents = ''
            el.style.position = ''
          }
        })
        getTutorialProviderDropdowns(tutorialProviderNamesRef.current).forEach(providerEl => {
          providerEl.classList.remove('tutorial-highlight')
          providerEl.style.pointerEvents = ''
          providerEl.style.position = ''
        })
        // Also clean up any textarea container highlights that might still exist
        const composerElement = getComposerElement()
        if (composerElement) {
          composerElement.classList.remove('tutorial-highlight')
          composerElement.style.pointerEvents = ''
          composerElement.style.position = ''
        }
        // Also clean up any results section highlights that might still exist
        const resultsSection = document.querySelector('.results-section') as HTMLElement
        if (resultsSection) {
          resultsSection.classList.remove('tutorial-highlight')
          resultsSection.style.pointerEvents = ''
          resultsSection.style.position = ''
        }
        // Also clean up any loading section highlights that might still exist
        const loadingSection = document.querySelector('.loading-section') as HTMLElement
        if (loadingSection) {
          loadingSection.classList.remove('tutorial-highlight')
          loadingSection.style.pointerEvents = ''
          loadingSection.style.position = ''
        }
        // Clean up dropdown active classes
        const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
        if (historyDropdown) {
          historyDropdown.classList.remove('tutorial-dropdown-active')
          historyDropdown.classList.remove('tutorial-highlight')
        }
        const savedSelectionsDropdown = document.querySelector(
          '.saved-selections-dropdown'
        ) as HTMLElement
        if (savedSelectionsDropdown) {
          savedSelectionsDropdown.classList.remove('tutorial-dropdown-active')
          savedSelectionsDropdown.classList.remove('tutorial-highlight')
        }
        // Clean up parent container classes
        const dropdownContainerActive = document.querySelector(
          '.composer.tutorial-dropdown-container-active'
        ) as HTMLElement
        if (dropdownContainerActive) {
          dropdownContainerActive.classList.remove('tutorial-dropdown-container-active')
        }
        const composerElementActive = document.querySelector(
          '.composer.tutorial-textarea-active'
        ) as HTMLElement
        if (composerElementActive) {
          composerElementActive.classList.remove('tutorial-textarea-active')
        }
        setTextareaCutout(null)
      }
      // If we're still on expand-provider, select-models, enter-prompt, submit-comparison, or dropdown steps, don't clean up - keep the highlight
    }
  }, [step, highlightedElements, targetElement, expandProviderEffectsReady, streamAnswerStarted])

  // Re-apply tutorial provider highlight if the DOM dropped it (production timing).
  useEffect(() => {
    if (!isPrimaryExpandProviderStep(step) || !expandProviderEffectsReady) return

    const ensureHighlight = () => {
      const layout = getTutorialProviderStepLayout(
        step as TutorialProviderLayoutStep,
        tutorialProviderNamesRef.current
      )
      const primary = layout.highlights[0]
      if (!primary || !layout.anchor) return
      if (!primary.classList.contains('tutorial-highlight')) {
        primary.classList.add('tutorial-highlight')
        primary.style.pointerEvents = 'auto'
        primary.style.position = 'relative'
      }
      const anchor = layout.anchor
      if (anchor) {
        setTargetElement(prev => (prev === anchor ? prev : anchor))
      }
    }

    ensureHighlight()
    const detachScrollResize = attachLayoutWatch(ensureHighlight)
    const interval = setInterval(ensureHighlight, 250)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      if (!isPrimaryExpandProviderStep(stepRef.current)) {
        getTutorialProviderDropdowns(tutorialProviderNamesRef.current).forEach(providerEl => {
          providerEl.classList.remove('tutorial-highlight')
          providerEl.style.pointerEvents = ''
          providerEl.style.position = ''
        })
      }
    }
  }, [step, expandProviderEffectsReady, tutorialProviderNames])

  // Re-apply provider highlight if the DOM drops the class. Position is owned by the
  // step-settle scroll effect so this interval cannot slide the tooltip.
  useEffect(() => {
    if (!step || (!isSelectModelTutorialStep(step) && step !== 'expand-starter-provider-2')) {
      return
    }

    const ensureHighlight = () => {
      const layout = getTutorialProviderStepLayout(
        step as TutorialProviderLayoutStep,
        tutorialProviderNamesRef.current
      )
      const { highlights } = layout
      if (highlights.length === 0) return
      highlights.forEach(providerEl => {
        if (!providerEl.classList.contains('tutorial-highlight')) {
          providerEl.classList.add('tutorial-highlight')
          providerEl.style.pointerEvents = 'auto'
          providerEl.style.position = 'relative'
        }
      })
      setTargetElement(prev => (prev === highlights[0] ? prev : highlights[0]))
      setHighlightedElements(prev =>
        prev.length === highlights.length && prev.every((el, i) => el === highlights[i])
          ? prev
          : highlights
      )
    }

    ensureHighlight()

    const detachScrollResize = attachLayoutWatch(ensureHighlight)

    const interval = setInterval(ensureHighlight, 250)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      getTutorialProviderDropdowns(tutorialProviderNamesRef.current).forEach(providerEl => {
        providerEl.classList.remove('tutorial-highlight')
        providerEl.style.pointerEvents = ''
        providerEl.style.position = ''
      })
    }
  }, [step, tutorialProviderNames])

  // Separate effect to continuously maintain highlight and cutout for enter-prompt step
  // Respects the initial scroll phase - only updates position after main effect completes scroll
  useEffect(() => {
    if (step !== 'enter-prompt') return

    const ensureHighlightAndCutout = () => {
      const composerElement = getComposerElement()
      if (composerElement) {
        // Always force add highlight class
        composerElement.classList.add('tutorial-highlight')
        composerElement.style.pointerEvents = 'auto'
        composerElement.style.position = 'relative'
        composerElement.classList.add('tutorial-textarea-active')
        if (spotlightSettledRef.current) {
          const cutout = computeTextareaCutout(composerElement)
          setTextareaCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
        }
        // Replacing the target after the fade restarts placement and slides the tooltip.
        const currentTarget = targetElementRef.current
        if (!currentTarget && !spotlightSettledRef.current) {
          setTargetElement(composerElement)
        }
      }
    }

    // Run immediately to set up highlight and cutout
    ensureHighlightAndCutout()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, ensureHighlightAndCutout)

    const detachScrollResize = attachLayoutWatch(ensureHighlightAndCutout)

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    // Check periodically to maintain highlight and cutout (position is owned by step settle)
    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, ensureHighlightAndCutout)
      detachScrollResize()
      clearTimeout(initialTimeout)
      clearInterval(interval)
      if (stepRef.current === 'submit-comparison') return
      // Clean up highlight when leaving this step
      const composerElement = getComposerElement()
      if (composerElement) {
        composerElement.classList.remove('tutorial-highlight')
        composerElement.classList.remove('tutorial-textarea-active')
        composerElement.style.pointerEvents = ''
        composerElement.style.position = ''
      }
    }
  }, [step])

  // Separate effect to continuously maintain highlight and cutout for enter-prompt-2 step
  // Matches step 3 (enter-prompt) behavior for consistent highlights
  // Respects the initial scroll phase - only updates position after main effect completes scroll
  useEffect(() => {
    if (step !== 'enter-prompt-2') return

    const ensureHighlightAndCutout = () => {
      const composerElement = getComposerElement()
      if (composerElement) {
        // Always force add highlight class (same as step 3 enter-prompt)
        composerElement.classList.add('tutorial-highlight')
        composerElement.style.pointerEvents = 'auto'
        composerElement.style.position = 'relative'
        composerElement.classList.add('tutorial-textarea-active')
        if (spotlightSettledRef.current) {
          const cutout = computeTextareaCutout(composerElement)
          setTextareaCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
        }
        const currentTarget = targetElementRef.current
        if (!currentTarget && !spotlightSettledRef.current) {
          setTargetElement(composerElement)
        }
      }
    }

    // Run immediately to set up highlight and cutout
    ensureHighlightAndCutout()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, ensureHighlightAndCutout)

    const detachScrollResize = attachLayoutWatch(ensureHighlightAndCutout)

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, ensureHighlightAndCutout)
      detachScrollResize()
      clearTimeout(initialTimeout)
      clearInterval(interval)
      if (stepRef.current === 'submit-comparison-2') return
      // Clean up highlight when leaving this step
      const composerElement = getComposerElement()
      if (composerElement) {
        composerElement.classList.remove('tutorial-highlight')
        composerElement.classList.remove('tutorial-textarea-active')
        composerElement.style.pointerEvents = ''
        composerElement.style.position = ''
      }
    }
  }, [step])

  // Separate effect to continuously maintain highlight for submit-comparison, follow-up, and view-follow-up-results steps
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility and targetElement are set (fixes production timing issues)
  useEffect(() => {
    if (
      step !== 'submit-comparison' &&
      step !== 'submit-comparison-2' &&
      step !== 'follow-up' &&
      step !== 'view-follow-up-results'
    ) {
      // When transitioning away from these steps, remove the highlight
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement
      if (resultsSection) {
        resultsSection.classList.remove('tutorial-highlight')
        resultsSection.style.pointerEvents = ''
        resultsSection.style.position = ''
      }
      if (loadingSection) {
        loadingSection.classList.remove('tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      return
    }

    const ensureHighlightCutoutAndVisibility = () => {
      const resultsSection = document.querySelector('.results-section') as HTMLElement

      if (step === 'follow-up') {
        if (stepRef.current !== 'follow-up') return
        const spotlight = applyStreamingComparisonHighlight(streamAnswerStartedRef.current)
        if (spotlight === 'loading' || !isFollowUpComposerReady()) {
          const composerElement = getComposerElement()
          composerElement?.classList.remove('tutorial-highlight')
          composerElement?.classList.remove('tutorial-textarea-active')
          const mirrorComposer = getHeroMirrorComposerIfPresent()
          if (mirrorComposer && mirrorComposer !== composerElement) {
            mirrorComposer.classList.remove('tutorial-highlight')
          }
          return
        }
        if (resultsSection && !resultsSection.classList.contains('tutorial-highlight')) {
          resultsSection.classList.add('tutorial-highlight')
          resultsSection.style.pointerEvents = 'auto'
          resultsSection.style.position = 'relative'
        }
        const composerElement = getComposerElement()
        if (composerElement) {
          composerElement.classList.add('tutorial-textarea-active')
          composerElement.classList.add('tutorial-highlight')
          composerElement.style.pointerEvents = 'auto'
          composerElement.style.position = 'relative'
          const mirrorComposer = getHeroMirrorComposerIfPresent()
          if (mirrorComposer && mirrorComposer !== composerElement) {
            mirrorComposer.classList.add('tutorial-highlight')
            mirrorComposer.style.position = 'relative'
          }
          // Backdrop holes and tooltip position are owned by the settle scroll effect.
          // Do not call setTargetElement(composer) here — remounts retriggered the scroll effect.
        }
        return
      }

      if (step === 'view-follow-up-results') {
        const spotlight = applyStreamingComparisonHighlight(streamAnswerStartedRef.current)
        const composerElement = getComposerElement()
        // While replies are still streaming, the processing/results frame owns
        // the ring. The composer hole and ring appear once that round is done.
        if (spotlight === 'loading' || isLoadingRef.current) {
          composerElement?.classList.remove('tutorial-highlight')
          composerElement?.classList.remove('tutorial-textarea-active')
          return
        }
        if (resultsSection && !resultsSection.classList.contains('tutorial-highlight')) {
          resultsSection.classList.add('tutorial-highlight')
          resultsSection.style.pointerEvents = 'auto'
          resultsSection.style.position = 'relative'
        }
        if (composerElement) {
          composerElement.classList.add('tutorial-textarea-active')
          composerElement.classList.add('tutorial-highlight')
          composerElement.style.pointerEvents = 'auto'
          composerElement.style.position = 'relative'
        }
        if (resultsSection) {
          if (!spotlightSettledRef.current) {
            setTargetElement(resultsSection)
            if (!suppressReviewTooltipRevealRef.current) {
              setIsVisible(true)
            }
          }
          // The follow-up → review handoff suppresses the first paint so the
          // previous card can leave. Once this step has settled, keep the
          // review card mounted even if that flag is still set.
          if (spotlightSettledRef.current && !isLoadingRef.current) {
            suppressReviewTooltipRevealRef.current = false
            setIsVisible(true)
            setSpotlightSettling(false)
            setTutorialSpotlightSettling(false)
          }
        }
        return
      }

      if (step === 'submit-comparison' || step === 'submit-comparison-2') {
        applyStreamingComparisonHighlight(streamAnswerStartedRef.current)
      }

      // Maintain textarea cutout for submit steps (view-follow-up-results returns above)
      const composerElement = getComposerElement()
      if (composerElement) {
        composerElement.classList.add('tutorial-textarea-active')
        if (step === 'submit-comparison') {
          // Before the request, the composer is the spotlight. Once the processing
          // panel or the results card is on screen, that panel owns the ring.
          const comparisonSpotlight = readStreamingComparisonSpotlight(
            streamAnswerStartedRef.current
          )
          if (comparisonSpotlight) {
            composerElement.classList.remove('tutorial-highlight')
          } else {
            composerElement.classList.add('tutorial-highlight')
            composerElement.style.pointerEvents = 'auto'
            composerElement.style.position = 'relative'
          }
        }
        const cutout = computeTextareaCutout(composerElement)
        setTextareaCutout(cutout)
      }

      // Ensure visibility and target when interval finds element (main findElement may have failed)
      if (step === 'submit-comparison' || step === 'submit-comparison-2') {
        const submitButton = document.querySelector(
          '[data-testid="comparison-submit-button"]'
        ) as HTMLElement
        if (submitButton && !spotlightSettledRef.current) {
          setTargetElement(submitButton)
          setIsVisible(true)
        }
      }
    }

    // Check immediately
    ensureHighlightCutoutAndVisibility()

    const detachScrollResize = attachLayoutWatch(ensureHighlightCutoutAndVisibility)

    // Check periodically to maintain highlight, cutout, and visibility
    const interval = setInterval(ensureHighlightCutoutAndVisibility, 200)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      const next = stepRef.current
      const keepResultsFrame =
        next === 'submit-comparison' ||
        next === 'submit-comparison-2' ||
        next === 'follow-up' ||
        next === 'view-follow-up-results'
      if (keepResultsFrame) return
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement
      if (resultsSection) {
        resultsSection.classList.remove('tutorial-highlight')
        resultsSection.style.pointerEvents = ''
        resultsSection.style.position = ''
      }
      if (loadingSection) {
        loadingSection.classList.remove('tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      // Clean up textarea active class and highlight (for step 4 submit-comparison)
      // BUT skip if transitioning to enter-prompt-2 (step 6) so the composer highlight
      // is preserved and doesn't flash/reset between steps.
      const nextStep = stepRef.current
      if (nextStep !== 'enter-prompt-2' && nextStep !== 'follow-up') {
        const composerElement = getComposerElement()
        if (composerElement) {
          composerElement.classList.remove('tutorial-textarea-active')
          composerElement.classList.remove('tutorial-highlight')
          composerElement.style.pointerEvents = ''
          composerElement.style.position = ''
        }
        const mirrorComposer = getHeroMirrorComposerIfPresent()
        if (mirrorComposer) {
          mirrorComposer.classList.remove('tutorial-highlight')
          mirrorComposer.style.position = ''
        }
      }
    }
  }, [step, streamAnswerStarted])

  // Submit, review, and the first follow-up settle. The follow-up step does not
  // reveal until the composer portals, which waits for the stream to finish, so
  // the results frame has to keep tracking that section for the whole gap.
  useEffect(() => {
    const watched =
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'view-follow-up-results' ||
      step === 'follow-up'
    if (!watched) {
      setLoadingStreamingCutout(null)
      return
    }

    let hasScrolledToLoading = false
    let hasScrolledToResults = false
    let loadingSectionWasSeen = false
    let framedDuringLoad = false
    let resultsPinScroll: number | null = null
    let userMovedResults = false
    let loadingPinScroll: number | null = null
    let userMovedLoading = false
    let sawFollowUpIdle = false
    let followUpRound = false
    let streamedIntoFollowUp = false
    let scrollToResultsRaf: number | null = null
    let scrollToResultsTimeout: ReturnType<typeof setTimeout> | null = null
    let observed: Element | null = null
    const resizeObserver = new ResizeObserver(() => updateLoadingStreamingCutout())

    // A pure scroll stamps the same content box (viewport and anchor move
    // together), so nearlyEqual skips the update and the layer keeps the ring
    // on the target. A layout change visible in this sample, such as the
    // processing panel unmounting, publishes the new content box.
    const publish = (
      cutout: {
        top: number
        left: number
        width: number
        height: number
        borderRadius: number
      } | null
    ) => {
      setLoadingStreamingCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
    }

    const updateLoadingStreamingCutout = () => {
      const current = stepRef.current
      const loading = isLoadingRef.current
      const started = streamAnswerStartedRef.current
      const followUpStarted = followUpSubmitStartedRef.current
      const settling = spotlightSettlingRef.current
      const isSubmit = current === 'submit-comparison' || current === 'submit-comparison-2'
      const isReview = current === 'view-follow-up-results'
      const followUpPost = current === 'follow-up' && followUpStarted
      if (current === 'follow-up' && !followUpStarted && loading) streamedIntoFollowUp = true
      if (current !== 'follow-up') streamedIntoFollowUp = false
      const holdFirstStream =
        streamedIntoFollowUp && current === 'follow-up' && !followUpStarted && (loading || settling)
      if (streamedIntoFollowUp && !loading && !settling) streamedIntoFollowUp = false
      const followUpAdvance = advanceFollowUpStreamingRound({
        step: current,
        loading,
        followUpSubmitStarted: followUpStarted,
        streamAnswerStarted: started,
        sawIdle: sawFollowUpIdle,
        round: followUpRound,
      })
      sawFollowUpIdle = followUpAdvance.sawIdle
      if (followUpAdvance.startedRound) {
        hasScrolledToLoading = false
        hasScrolledToResults = false
        resultsPinScroll = null
        userMovedResults = false
        loadingPinScroll = null
        userMovedLoading = false
      }
      followUpRound = followUpAdvance.round
      followUpStreamingRoundRef.current = followUpRound
      if ((isSubmit || isReview) && loading) framedDuringLoad = true
      // Follow-up stays in this phase through the first token, same as submit.
      const active =
        (isSubmit && (loading || started || (settling && framedDuringLoad))) ||
        (isReview && loading) ||
        holdFirstStream ||
        (followUpRound && (loading || started))
      if (!active) {
        publish(null)
        return
      }

      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      const loadingSection = document.querySelector('.loading-section') as HTMLElement | null
      // Cancel or error before a reply removes both panels. Drop the streaming
      // frame so the submit tooltip can come back and the user can retry.
      if (
        isSubmit &&
        !loading &&
        (isFollowUpComposerUnavailable() ||
          (!elementHasSpotlightBox(loadingSection) && !elementHasSpotlightBox(resultsSection)))
      ) {
        publish(null)
        return
      }
      const preferLoading = !started && elementHasSpotlightBox(loadingSection)
      const watch =
        preferLoading && loadingSection ? loadingSection : (resultsSection ?? loadingSection)
      if (watch !== observed) {
        if (observed) resizeObserver.unobserve(observed)
        observed = watch
        if (observed) resizeObserver.observe(observed)
      }
      if (loadingSection) loadingSectionWasSeen = true

      const anchorTooltipTo = (rect: DOMRect) => {
        const currentStep = stepRef.current
        if (!currentStep) return
        const stepConfig = TUTORIAL_STEPS_CONFIG[currentStep]
        const placed = desktopTooltipClearOfProcessingPanel(
          rect,
          currentStep,
          stepConfig,
          tutorialProviderNamesRef.current
        )
        setEffectivePosition(placed.effectivePosition)
        setTooltipHidesArrow(placed.hideArrow)
        const nextPoint = placeOverlayPoint(placed.top, placed.left)
        setOverlayPosition(prev => (overlayPointUnchanged(prev, nextPoint) ? prev : nextPoint))
        setIsVisible(true)
        if (!started) {
          suppressReviewTooltipRevealRef.current = false
          setSpotlightSettling(false)
          setTutorialSpotlightSettling(false)
          setPositionStabilized(true)
          spotlightSettledRef.current = true
          settledStepRef.current = currentStep
        }
      }

      const resultsRect = resultsSection?.getBoundingClientRect()
      const resultsReady = Boolean(
        resultsSection && resultsRect && resultsRect.width > 2 && resultsRect.height > 2
      )

      // Empty result cards mount with the request. Keep the ring on the processing
      // panel until any model has streamed answer text.
      if (preferLoading && loadingSection) {
        applyStreamingComparisonHighlight(false)
        const composer = getComposerElement()
        composer?.classList.remove('tutorial-highlight')
        const mirror = getHeroMirrorComposerIfPresent()
        if (mirror && mirror !== composer) mirror.classList.remove('tutorial-highlight')
        const box = loadingSection.getBoundingClientRect()
        const desiredTop = Math.max(
          desktopResultsTooltipMinTop(),
          (window.innerHeight - box.height) / 2
        )
        // The first comparison scrolls once. Follow-up keeps correcting until
        // the panel sits in that same spot, unless the user has scrolled away.
        if (followUpRound) {
          if (!userMovedLoading) {
            const root = getTutorialScrollRoot()
            const scrollTop = root.getScrollTop()
            if (loadingPinScroll != null && Math.abs(scrollTop - loadingPinScroll) > 24) {
              userMovedLoading = true
            } else if (Math.abs(box.top - desiredTop) > 12) {
              scrollTutorialElementToViewportY(loadingSection, desiredTop)
              loadingPinScroll = root.getScrollTop()
            } else if (loadingPinScroll == null) {
              loadingPinScroll = scrollTop
            }
          }
        } else if (!hasScrolledToLoading) {
          hasScrolledToLoading = true
          scrollTutorialElementToViewportY(loadingSection, desiredTop)
        }
        const rect = loadingSection.getBoundingClientRect()
        publish(
          withScrollAnchor({
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 20,
          })
        )
        anchorTooltipTo(rect)
        return
      }

      if (resultsReady && resultsSection) {
        const isFollowUpStyle = current === 'submit-comparison-2' || isReview || followUpPost
        const canScroll = isFollowUpStyle ? loadingSectionWasSeen : true
        // Review placement is owned by the settle scroll, which leaves room for
        // the tooltip. scrollIntoView(block: start) pins a tall card to y=0 and
        // pushes that tooltip above the viewport.
        const shouldScrollResultsIntoView =
          !holdFirstStream &&
          current !== 'view-follow-up-results' &&
          (current !== 'submit-comparison' || started)
        // Same handoff as mobile: once the first token arrives, the results
        // card leaves the bottom of the viewport. The deferred scrollIntoView
        // stays skipped while the spotlight is already settled.
        const pinStreamingResults =
          started && (current === 'submit-comparison' || followUpRound || (isReview && loading))
        if (pinStreamingResults && !userMovedResults) {
          const root = getTutorialScrollRoot()
          const scrollTop = root.getScrollTop()
          const desiredTop = streamingResultsTopInViewport()
          const before = resultsSection.getBoundingClientRect()
          // Keep correcting until the card is actually at the top. A scroll
          // that happens before that is the handoff, not the user.
          if (Math.abs(before.top - desiredTop) > 12) {
            scrollTutorialElementToViewportY(resultsSection, desiredTop)
            resultsPinScroll = root.getScrollTop()
          } else if (resultsPinScroll != null && Math.abs(scrollTop - resultsPinScroll) > 24) {
            userMovedResults = true
          } else {
            resultsPinScroll = scrollTop
          }
        } else if (
          !pinStreamingResults &&
          !followUpRound &&
          !spotlightSettledRef.current &&
          !hasScrolledToResults &&
          canScroll &&
          shouldScrollResultsIntoView
        ) {
          hasScrolledToResults = true
          scrollToResultsRaf = requestAnimationFrame(() => {
            scrollToResultsRaf = null
            scrollToResultsTimeout = setTimeout(() => {
              scrollToResultsTimeout = null
              resultsSection.scrollIntoView({ behavior: 'auto', block: 'start' })
            }, 100)
          })
        }
        const cutout = computeTargetCutout([resultsSection], 8, 24)
        publish(cutout)
        applyStreamingComparisonHighlight(streamAnswerStartedRef.current)
        if (
          current === 'view-follow-up-results' ||
          current === 'submit-comparison' ||
          current === 'submit-comparison-2' ||
          followUpRound
        ) {
          anchorTooltipTo(resultsSection.getBoundingClientRect())
        }
        return
      }

      if (loadingSection) {
        const rect = loadingSection.getBoundingClientRect()
        publish(
          withScrollAnchor({
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 20,
          })
        )
      }
    }

    updateLoadingStreamingCutout()
    const detachScrollResize = attachScrollResizeRaf(() => {
      updateLoadingStreamingCutout()
    })
    const interval = setInterval(updateLoadingStreamingCutout, 100)

    return () => {
      followUpStreamingRoundRef.current = false
      detachScrollResize()
      clearInterval(interval)
      resizeObserver.disconnect()
      if (scrollToResultsRaf !== null) cancelAnimationFrame(scrollToResultsRaf)
      if (scrollToResultsTimeout !== null) clearTimeout(scrollToResultsTimeout)
      const next = stepRef.current
      const still =
        next === 'submit-comparison' ||
        next === 'submit-comparison-2' ||
        next === 'follow-up' ||
        next === 'view-follow-up-results'
      if (!still) setLoadingStreamingCutout(null)
    }
  }, [step])

  // Re-apply the exclusive processing/results highlight when loading or the first token flips.
  // The interval above covers DOM that appears between those renders.
  useEffect(() => {
    const watched =
      step === 'submit-comparison' ||
      step === 'submit-comparison-2' ||
      step === 'view-follow-up-results' ||
      step === 'follow-up'
    if (!watched) return
    applyStreamingComparisonHighlight(streamAnswerStarted)
  }, [step, isLoading, streamAnswerStarted])

  // Separate effect to continuously maintain dropdown active class for history-dropdown step
  // This ensures the dropdown stays above backdrop even if the DOM updates
  // ALSO ensures visibility and targetElement are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'history-dropdown') return

    // Listen on the interactive (below-results) button; hero mirror is inert.
    const historyToggleForClicks = getBelowResultsHistoryToggleButton()
    const handleHistoryButtonClick = () => {
      dropdownWasOpenedRef.current = true
    }
    if (historyToggleForClicks) {
      historyToggleForClicks.addEventListener('click', handleHistoryButtonClick)
    }

    const ensureDropdownActiveAndVisibility = () => {
      const historyToggleButton = getBelowResultsHistoryToggleButton()
      if (historyToggleButton) {
        // Add highlight class to the button for visual emphasis
        if (!historyToggleButton.classList.contains('tutorial-highlight')) {
          historyToggleButton.classList.add('tutorial-highlight')
        }
        // A later target swap recenters the tooltip after the fade has started.
        if (!spotlightSettledRef.current) {
          setTargetElement(historyToggleButton)
          setIsVisible(true)
        }
      }

      // Cutout expands to include the list on the visible composer, not the hero mirror.
      const composerElement = getComposerElement()
      const historyDropdown = getPortaledHistoryList()
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (same blue & green as step 3)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        const histCutout = computeDropdownCutout(composerElement, historyDropdown)
        setDropdownCutout(histCutout)
      }

      if (historyDropdown) {
        // Mark that dropdown was opened
        dropdownWasOpenedRef.current = true
        if (!historyDropdown.classList.contains('tutorial-dropdown-active')) {
          historyDropdown.classList.add('tutorial-dropdown-active')
        }
        if (!historyDropdown.classList.contains('tutorial-highlight')) {
          historyDropdown.classList.add('tutorial-highlight')
        }
      }
    }

    // Check immediately
    ensureDropdownActiveAndVisibility()

    // Check periodically to maintain dropdown state and visibility (no MutationObserver to avoid performance issues)
    const interval = setInterval(ensureDropdownActiveAndVisibility, 100)

    return () => {
      clearInterval(interval)
      // Clean up event listener
      if (historyToggleForClicks) {
        historyToggleForClicks.removeEventListener('click', handleHistoryButtonClick)
      }
      const transitioningToSaveSelection = stepRef.current === 'save-selection'
      if (transitioningToSaveSelection) {
        return
      }
      const historyDropdown = getHistoryInlineListForTutorial()
      if (historyDropdown) {
        historyDropdown.classList.remove('tutorial-dropdown-active')
        historyDropdown.classList.remove('tutorial-highlight')
      }
      document.querySelectorAll('.history-toggle-button').forEach(el => {
        el.classList.remove('tutorial-highlight')
      })
      for (const composerElement of [getComposerElement(), getHeroComposerForDropdownSteps()]) {
        composerElement?.classList.remove('tutorial-dropdown-container-active')
        composerElement?.classList.remove('tutorial-highlight')
      }
      setDropdownCutout(null)
    }
  }, [step])

  // Separate effect to continuously maintain dropdown active class for save-selection step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility and targetElement are set (fixes production timing issues)
  // Done button enabled ONLY when dropdown exists in DOM (dropdown only renders when user clicks)
  useEffect(() => {
    if (step !== 'save-selection') return

    let didEnableDoneForThisStep = false
    const ensureDropdownActiveAndVisibility = () => {
      const savedSelectionsButton = getBelowResultsSavedSelectionsButton()
      if (savedSelectionsButton) {
        if (!savedSelectionsButton.classList.contains('tutorial-highlight')) {
          savedSelectionsButton.classList.add('tutorial-highlight')
        }
        if (!spotlightSettledRef.current) {
          setTargetElement(savedSelectionsButton)
          setIsVisible(true)
        }
      }

      // Same composer ring as the history step. The square outline is the bookmark only.
      const composerElement = getComposerElement()
      const historyDropdown = getPortaledHistoryList()
      document.querySelectorAll('.history-toggle-button').forEach(el => {
        el.classList.remove('tutorial-highlight')
      })
      if (composerElement) {
        composerElement.classList.add('tutorial-dropdown-container-active')
        composerElement.classList.add('tutorial-highlight')
      }
      if (historyDropdown) {
        historyDropdown.classList.add('tutorial-dropdown-active')
        historyDropdown.classList.remove('tutorial-highlight')
      }
      const savedSelectionsForCutout = composerElement?.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement | null
      const savedDropdownAnywhere = savedSelectionsForCutout
      setDropdownCutout(
        composerElement
          ? computeDropdownCutout(composerElement, savedSelectionsForCutout ?? historyDropdown)
          : null
      )

      if (savedDropdownAnywhere) {
        // Dropdown only exists when user has clicked "Save or load model selections"
        // Use DOM presence as source of truth - enable Done only when dropdown is visible
        if (!didEnableDoneForThisStep) {
          didEnableDoneForThisStep = true
          setSaveSelectionDropdownOpened(true)
        }
        if (!savedDropdownAnywhere.classList.contains('tutorial-dropdown-active')) {
          savedDropdownAnywhere.classList.add('tutorial-dropdown-active')
        }
        if (!savedDropdownAnywhere.classList.contains('tutorial-highlight')) {
          savedDropdownAnywhere.classList.add('tutorial-highlight')
        }
      }
    }

    // Check immediately
    ensureDropdownActiveAndVisibility()

    // Check periodically to maintain dropdown state and visibility (no MutationObserver to avoid performance issues)
    const interval = setInterval(ensureDropdownActiveAndVisibility, 100)

    return () => {
      clearInterval(interval)
      document.querySelectorAll('.saved-selections-dropdown').forEach(el => {
        const node = el as HTMLElement
        node.classList.remove('tutorial-dropdown-active')
        node.classList.remove('tutorial-highlight')
      })
      for (const composerElement of [getComposerElement(), getHeroComposerForDropdownSteps()]) {
        composerElement?.classList.remove('tutorial-dropdown-container-active')
        composerElement?.classList.remove('tutorial-highlight')
      }
      document.querySelectorAll('.saved-selections-button').forEach(el => {
        ;(el as HTMLElement).classList.remove('tutorial-highlight')
      })
      document.querySelectorAll('.history-toggle-button').forEach(el => {
        ;(el as HTMLElement).classList.remove('tutorial-highlight')
      })
      setDropdownCutout(null)
    }
  }, [step])

  // Update textarea cutout position for textarea-related steps. Must be called before any early returns (Rules of Hooks).
  // Cutout uses document-relative (absolute) coordinates so it scrolls with the page without JS updates.
  useEffect(() => {
    const shouldExcludeTextarea =
      step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison-2'
    if (!shouldExcludeTextarea) return

    const updateTextareaCutout = () => {
      if (!spotlightSettledRef.current) return
      const composerElement = getComposerElement()
      const cutout = composerElement ? computeTextareaCutout(composerElement) : null
      setTextareaCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
    }

    updateTextareaCutout()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateTextareaCutout)
    window.addEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateTextareaCutout)

    const detachScrollResize = attachLayoutWatch(updateTextareaCutout)
    const interval = setInterval(updateTextareaCutout, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateTextareaCutout)
      window.removeEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateTextareaCutout)
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step, targetElement])

  // Update dropdown cutout position for dropdown steps. Cutout expands to include
  // the dropdown when opened (composer + dropdown union).
  // Uses document-relative (absolute) coordinates so it scrolls with the page.
  useEffect(() => {
    const shouldExcludeDropdown = step === 'history-dropdown' || step === 'save-selection'
    if (!shouldExcludeDropdown) return

    const updateDropdownCutout = () => {
      if (!spotlightSettledRef.current) return
      const composer = getComposerElement()
      if (!composer) return

      const openPanel =
        getPortaledHistoryList() ??
        (composer.querySelector('.saved-selections-dropdown') as HTMLElement | null)
      const cutout = computeDropdownCutout(composer, openPanel)
      setDropdownCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
    }

    updateDropdownCutout()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateDropdownCutout)
    window.addEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateDropdownCutout)

    const detachScrollResize = attachLayoutWatch(updateDropdownCutout)
    const interval = setInterval(updateDropdownCutout, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateDropdownCutout)
      window.removeEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateDropdownCutout)
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step])

  // Step 5 (follow-up): keep results + composer backdrop holes in lockstep. Previously, separate
  // effects/rAF callbacks updated targetCutout vs textareaCutout one after another, so fast scroll
  // could paint mismatched rings. Use one DOM read + batched setState; composer ring uses the full
  // composer (header + input) to match .tutorial-highlight, not only input-wrapper/toolbar rects.
  useEffect(() => {
    if (step !== 'follow-up' && step !== 'view-follow-up-results') return

    const syncFollowUpBackdropCutouts = () => {
      if (!spotlightSettledRef.current) return
      const current = stepRef.current
      if (current !== 'follow-up' && current !== 'view-follow-up-results') return
      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      const composerElement = getComposerElement()

      const targetCut = resultsSection != null ? computeTargetCutout([resultsSection], 8, 24) : null

      const composerCutRect =
        composerElement != null ? computeTargetCutout([composerElement], 8, 32) : null

      setTargetCutout(prev => (tutorialBoxesNearlyEqual(prev, targetCut) ? prev : targetCut))
      setTextareaCutout(prev =>
        tutorialBoxesNearlyEqual(prev, composerCutRect) ? prev : composerCutRect
      )
    }

    syncFollowUpBackdropCutouts()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, syncFollowUpBackdropCutouts)
    window.addEventListener(TUTORIAL_FRAME_RESIZED_EVENT, syncFollowUpBackdropCutouts)
    const detachScrollResize = attachLayoutWatch(syncFollowUpBackdropCutouts)
    const interval = setInterval(syncFollowUpBackdropCutouts, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, syncFollowUpBackdropCutouts)
      window.removeEventListener(TUTORIAL_FRAME_RESIZED_EVENT, syncFollowUpBackdropCutouts)
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step])

  // Calculate target cutout for steps that don't have special cutout handling.
  // Uses viewport coordinates (getBoundingClientRect); TutorialBackdrop positions with fixed.
  useEffect(() => {
    const needsTargetCutout = isProviderPickerTutorialStep(step)

    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'

    if (!needsTargetCutout && !isSubmitStep) {
      // Follow-up and review manage both holes via syncFollowUpBackdropCutouts.
      if (step !== 'follow-up' && step !== 'view-follow-up-results') {
        setTargetCutout(null)
      }
      return
    }

    if (isPrimaryExpandProviderStep(step) && !expandProviderEffectsReady) {
      setTargetCutout(null)
      return
    }

    const updateTargetCutout = () => {
      if (!spotlightSettledRef.current) return
      let elementsToUse: HTMLElement[] = []
      if (isSubmitStep) {
        const composerElement = getComposerElement()
        if (composerElement) elementsToUse = [composerElement]
      } else {
        elementsToUse =
          highlightedElements.length > 0
            ? highlightedElements
            : targetElement
              ? [targetElement]
              : []
      }
      const padding = 8
      const isProviderStep = isProviderPickerTutorialStep(step)
      /* Concentric outer radius: element radius + cutout padding (8px). */
      const borderRadius = isSubmitStep
        ? 32 /* composer (match step 3–4) */
        : isProviderStep
          ? 20 /* --radius-xl (12px) + 8 */
          : 12
      const cutout = computeTargetCutout(elementsToUse, padding, borderRadius)
      setTargetCutout(prev => (tutorialBoxesNearlyEqual(prev, cutout) ? prev : cutout))
    }

    updateTargetCutout()
    window.addEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateTargetCutout)
    window.addEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateTargetCutout)

    const detachScrollResize = attachLayoutWatch(updateTargetCutout)
    const interval = setInterval(updateTargetCutout, 100)

    return () => {
      window.removeEventListener(TUTORIAL_SPOTLIGHT_SETTLED_EVENT, updateTargetCutout)
      window.removeEventListener(TUTORIAL_FRAME_RESIZED_EVENT, updateTargetCutout)
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step, highlightedElements, targetElement, expandProviderEffectsReady])

  const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
  // The cutout effect publishes null as soon as the streaming hold ends, including
  // after follow-up's first settle. A later settle must not bring this phase back.
  const isLoadingStreamingPhase = Boolean(
    loadingStreamingCutout &&
    (isSubmitStep || step === 'view-follow-up-results' || step === 'follow-up')
  )
  const config = step
    ? resolveTutorialStepConfig(step, tutorialStarterEntries, tutorialSplitModelSteps)
    : null
  const { stepIndex, totalSteps } = getTutorialVisibleStepProgress(step, tutorialVisibleStepOrder)
  const shouldExcludeTextarea =
    step === 'enter-prompt' ||
    step === 'submit-comparison' ||
    step === 'submit-comparison-2' ||
    step === 'enter-prompt-2'
  const shouldExcludeDropdown = step === 'history-dropdown' || step === 'save-selection'
  const useRoundedCutout =
    (step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison-2') &&
    !isLoadingStreamingPhase
  const textareaCutoutToUse = textareaCutout || (isSubmitStep ? targetCutout : null)
  const shouldHideTooltip =
    !isLoadingStreamingPhase &&
    hasAttemptedElementFindRef.current &&
    ((!isVisible && !targetElement) ||
      (isPrimaryExpandProviderStep(step) && !expandProviderEffectsReady))
  return {
    overlayRef,
    stepRef,
    dropdownWasOpenedRef,
    saveSelectionDropdownOpened,
    hasAttemptedElementFindRef,
    targetElement,
    overlayPosition,
    tooltipHidesArrow,
    isVisible,
    portalRoot,
    effectivePosition,
    positionStabilized,
    spotlightSettling,
    textareaCutout,
    dropdownCutout,
    buttonCutout,
    loadingStreamingCutout,
    targetCutout,
    isSubmitStep,
    isLoadingStreamingPhase,
    config,
    stepIndex,
    totalSteps,
    shouldExcludeTextarea,
    shouldExcludeDropdown,
    useRoundedCutout,
    textareaCutoutToUse,
    shouldHideTooltip,
  }
}
