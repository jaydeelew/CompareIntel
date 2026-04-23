import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TUTORIAL_STEPS_CONFIG, getTutorialVisibleStepProgress } from '../../data/tutorialSteps'
import type { TutorialStep } from '../../hooks/useTutorial'
import logger from '../../utils/logger'
import {
  getComposerElement,
  computeTextareaCutout,
  computeButtonCutout,
  computeDropdownCutout,
  computeTargetCutout,
  computeTooltipPosition,
  getScrollTargetForStep,
} from '../../utils/tutorialPositioning'

import {
  getBelowResultsHistoryToggleButton,
  getHeroComposerForDropdownSteps,
  getHeroMirrorComposerIfPresent,
  getHistoryInlineListForTutorial,
  getHistoryToggleButtonForTutorial,
  getSavedSelectionsButtonForTutorial,
  getSavedSelectionsDropdownForTutorial,
} from './tutorialUtils'
import { useTutorialCleanup } from './useTutorialCleanup'

interface HTMLElementWithTutorialProps extends HTMLElement {
  __tutorialHeightObserver?: MutationObserver
  __tutorialHeightInterval?: number
}

const SCROLL_CAPTURE_OPTS: AddEventListenerOptions = { capture: true, passive: true }

/** Re-run layout reads once per frame on scroll/resize (including nested scroll containers). */
function attachScrollResizeRaf(update: () => void): () => void {
  let raf: number | null = null
  const schedule = () => {
    if (raf != null) return
    raf = requestAnimationFrame(() => {
      raf = null
      update()
    })
  }
  document.addEventListener('scroll', schedule, SCROLL_CAPTURE_OPTS)
  window.addEventListener('resize', schedule)
  return () => {
    if (raf != null) cancelAnimationFrame(raf)
    document.removeEventListener('scroll', schedule, SCROLL_CAPTURE_OPTS)
    window.removeEventListener('resize', schedule)
  }
}

function useTutorialOverlay(
  step: TutorialStep | null,
  isLoading: boolean,
  streamAnswerStarted = false
) {
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
  /** After follow-up → view-follow-up-results, skip immediate tooltip show so step 5 vanishes first. */
  const suppressReviewTooltipRevealRef = useRef(false)
  const prevStepForTooltipExitRef = useRef<TutorialStep | null>(null)
  const targetElementRef = useRef<HTMLElement | null>(null)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [highlightedElements, setHighlightedElements] = useState<HTMLElement[]>([])
  const [overlayPosition, setOverlayPosition] = useState({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  // Dynamic position for step 3 - can switch between 'top' and 'bottom' based on scroll
  const [effectivePosition, setEffectivePosition] = useState<'top' | 'bottom' | null>(null)
  // Suppress CSS transitions on the tooltip until initial placement is complete.
  // This prevents the tooltip from visibly animating through intermediate positions
  // during the scroll + post-scroll adjustment phase when changing steps.
  const [positionStabilized, setPositionStabilized] = useState(false)
  const [textareaCutout, setTextareaCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [dropdownCutout, setDropdownCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [buttonCutout, setButtonCutout] = useState<{
    top: number
    left: number
    radius: number
  } | null>(null)
  const [loadingStreamingCutout, setLoadingStreamingCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  // General-purpose cutout for target elements (used for steps without special cutout handling)
  const [targetCutout, setTargetCutout] = useState<{
    top: number
    left: number
    width: number
    height: number
    borderRadius: number
  } | null>(null)

  useTutorialCleanup()

  useEffect(() => {
    // Reset dropdown opened flag when step changes away from dropdown steps
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
      setButtonCutout(null)
    }
  }, [step])

  // Reset save-selection flag synchronously before paint when entering step 8
  // useLayoutEffect ensures user never sees Done enabled before they've clicked
  useLayoutEffect(() => {
    if (step === 'save-selection') {
      setSaveSelectionDropdownOpened(false)
    }
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
    setTargetCutout(null)
    setLoadingStreamingCutout(null)

    prevStepForCutoutRef.current = step
  }, [step])

  useEffect(() => {
    targetElementRef.current = targetElement
  }, [targetElement])

  // Render the tutorial UI in a portal attached to <body> so `position: fixed` is truly viewport-fixed.
  // This avoids cases where an ancestor has `contain/transform` which can break fixed positioning or clip the tooltip.
  useEffect(() => {
    if (typeof document === 'undefined') return

    const existing = document.getElementById('tutorial-portal-root') as HTMLElement | null
    if (existing) {
      setPortalRoot(existing)
      return
    }

    const el = document.createElement('div')
    el.id = 'tutorial-portal-root'
    document.body.appendChild(el)
    setPortalRoot(el)

    return () => {
      if (el.parentNode) el.parentNode.removeChild(el)
    }
  }, [])

  // Reset clamp attempts and effective position when the step changes.
  useEffect(() => {
    tooltipClampAttemptsRef.current = 0
    setEffectivePosition(null)
  }, [step])

  // After the tooltip renders, clamp it fully into the viewport (regardless of content height/transform).
  // This is a final safety net for production timing/layout differences.
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

    if (rect.top < margin) dy = margin - rect.top
    else if (rect.bottom > window.innerHeight - margin) {
      dy = window.innerHeight - margin - rect.bottom
    }

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      tooltipClampAttemptsRef.current += 1
      setOverlayPosition(pos => ({ top: pos.top + dy, left: pos.left + dx }))
    } else {
      tooltipClampAttemptsRef.current = 0
    }
  }, [isVisible, step, overlayPosition.top, overlayPosition.left])

  // Force visibility immediately for key tutorial steps (handles production findElement timing issues)
  useEffect(() => {
    if (step === 'expand-provider' || step === 'select-models') {
      // Force visibility immediately - tooltip should ALWAYS show for these steps
      setIsVisible(true)
      // Set a reasonable default position in case elements aren't found yet
      setOverlayPosition({ top: 320, left: window.innerWidth / 2 })
    } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      // Do NOT force visibility for enter-prompt steps.
      // These steps require scrolling to the composer first, and the scroll effect
      // controls visibility — showing the tooltip only after scroll completes.
      // Forcing isVisible=true here causes a flicker (tooltip briefly appears at wrong
      // position before the scroll effect hides it).
      // Just set a default position so the tooltip has a reasonable starting point.
      setOverlayPosition({ top: 450, left: window.innerWidth / 2 })
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
    if (step === 'expand-provider') {
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
      hasAttemptedElementFindRef.current = false
      initialScrollCompleteRef.current = false
      setPositionStabilized(false)
      // Reset all cutout states when tutorial ends to prevent stale values on next run
      setTextareaCutout(null)
      setDropdownCutout(null)
      setButtonCutout(null)
      setLoadingStreamingCutout(null)
      setOverlayPosition({ top: 0, left: 0 })
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

      // Special handling for Google provider steps
      if (step === 'expand-provider' || step === 'select-models') {
        // Find Google provider dropdown - use data attribute for reliable selection
        const googleDropdown = document.querySelector(
          '.provider-dropdown[data-provider-name="Google"]'
        ) as HTMLElement
        if (googleDropdown) {
          if (step === 'expand-provider') {
            element = googleDropdown.querySelector('.provider-header') as HTMLElement
            // Highlight the entire dropdown (same as when expanded)
            setHighlightedElements([googleDropdown])
          } else if (step === 'select-models') {
            // Always highlight the entire Google provider section
            element = googleDropdown
            setHighlightedElements([googleDropdown])
          }
        }
      } else if (step === 'history-dropdown') {
        // Special handling for history dropdown step - create circular cutout for button
        element = getHistoryToggleButtonForTutorial()
        // Find and add the history dropdown if it exists
        const historyDropdown = getHistoryInlineListForTutorial()
        if (historyDropdown) {
          setHighlightedElements([historyDropdown])
        } else {
          setHighlightedElements([])
        }
        if (element) {
          setButtonCutout(computeButtonCutout(element))
        }
      } else if (step === 'save-selection') {
        // Special handling for saved selections dropdown step - create circular cutout for button
        element = getSavedSelectionsButtonForTutorial()
        // Find and add the saved selections dropdown if it exists
        const savedSelectionsDropdown = getSavedSelectionsDropdownForTutorial()
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
          if (submitCutout) {
            submitCutout.top += window.scrollY
            submitCutout.left += window.scrollX
          }
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
        // Backdrop cutout: results + composer; tooltip target remains the follow-up composer
        const resultsSection = document.querySelector('.results-section') as HTMLElement
        setHighlightedElements(resultsSection ? [resultsSection] : [])
        element = getComposerElement()
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
      const maxAttempts = 20
      const attemptDelay = 300

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
            setIsVisible(true)
          } else {
            // For expand-provider step, try to use the Google dropdown as fallback
            if (step === 'expand-provider' || step === 'select-models') {
              const googleDropdown = document.querySelector(
                '.provider-dropdown[data-provider-name="Google"]'
              ) as HTMLElement
              if (googleDropdown) {
                const headerElement =
                  step === 'expand-provider'
                    ? (googleDropdown.querySelector('.provider-header') as HTMLElement)
                    : googleDropdown
                if (headerElement) {
                  setTargetElement(headerElement)
                  setIsVisible(true)
                  return
                }
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
    const isDropdownStep = step === 'history-dropdown' || step === 'save-selection'
    let scrollCheckFrame: number | null = null
    let postScrollTimers: number[] = []
    let scrollDelayTimer: ReturnType<typeof setTimeout> | null = null
    let scrollAnimFrame: number | null = null // Track custom rAF scroll animation
    let scrollCompletionResolver: (() => void) | null = null
    const isScrollingRef = { current: false } // Track if we're in the middle of programmatic scroll

    const layoutTarget = (): HTMLElement | null => {
      if (step === 'follow-up') {
        return getComposerElement() ?? targetElement
      }
      return targetElement
    }

    const updatePosition = () => {
      const el = layoutTarget()
      if (!el) return
      const rect = el.getBoundingClientRect()
      const { top, left, effectivePosition: effPos } = computeTooltipPosition(rect, step, config)
      setEffectivePosition(effPos)
      setOverlayPosition({ top, left })
    }

    updatePosition()

    const scrollToElement = () => {
      const el = layoutTarget()
      if (!el) return
      const scrollTarget = getScrollTargetForStep(step, el)

      // Scroll smoothly without affecting hero section layout
      // For step 3, 5, and 6, use slower custom scrolling so the transition feels intentional
      const scrollOptions: ScrollToOptions = {
        top: Math.max(0, scrollTarget),
        behavior: 'smooth',
        left: window.pageXOffset, // Keep horizontal position
      }

      if (
        step === 'enter-prompt' ||
        step === 'enter-prompt-2' ||
        step === 'follow-up' ||
        isReviewStepFromFollowUp
      ) {
        // Use a custom smooth scroll implementation for slower, smoother scrolling
        const startScrollY = window.pageYOffset
        const targetScrollY = Math.max(0, scrollTarget)
        const distance = targetScrollY - startScrollY

        // Mark that we're starting a programmatic scroll
        isScrollingRef.current = true

        const duration = step === 'follow-up' ? 750 : isReviewStepFromFollowUp ? 600 : 900
        const startTime = performance.now()

        // Ease-in-out cubic function for smooth animation
        const easeInOutCubic = (t: number): number => {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        }

        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime
          const progress = Math.min(elapsed / duration, 1)
          const easeProgress = easeInOutCubic(progress)

          const currentScrollY = startScrollY + distance * easeProgress
          window.scrollTo(0, currentScrollY)

          if (progress < 1) {
            scrollAnimFrame = requestAnimationFrame(animateScroll)
          } else {
            scrollAnimFrame = null
            // Scroll animation complete - mark as done after a brief delay to allow layout to settle
            setTimeout(() => {
              isScrollingRef.current = false
              if (scrollCompletionResolver) {
                scrollCompletionResolver()
                scrollCompletionResolver = null
              }
            }, 100)
          }
        }

        scrollAnimFrame = requestAnimationFrame(animateScroll)
      } else {
        // Use default smooth scroll for other steps
        window.scrollTo(scrollOptions)
      }
    }

    // Determine if we need to delay tooltip reveal until scroll completes
    const rect = layoutTarget()!.getBoundingClientRect()
    const isTargetOffscreen = rect.bottom < 0 || rect.top > window.innerHeight
    const isEnterPromptStep = step === 'enter-prompt' || step === 'enter-prompt-2'
    const isFollowUpStep = step === 'follow-up'
    const isReviewStepFromFollowUp =
      step === 'view-follow-up-results' && suppressReviewTooltipRevealRef.current
    // Delay reveal for dropdown steps when target is offscreen, or for steps that smooth-scroll
    // to the composer before showing the tooltip, or for step 6 when transitioning from step 5.
    const shouldDelayReveal =
      (isDropdownStep && isTargetOffscreen) ||
      isEnterPromptStep ||
      isFollowUpStep ||
      isReviewStepFromFollowUp

    if (shouldDelayReveal) {
      setIsVisible(false)
    }

    const waitForScrollStop = (onStop: () => void) => {
      let lastScrollY = window.scrollY
      let stableFrames = 0
      const check = () => {
        const currentScrollY = window.scrollY
        if (Math.abs(currentScrollY - lastScrollY) < 1) {
          stableFrames += 1
        } else {
          stableFrames = 0
          lastScrollY = currentScrollY
        }

        if (stableFrames >= 6) {
          onStop()
          return
        }

        scrollCheckFrame = window.requestAnimationFrame(check)
      }

      scrollCheckFrame = window.requestAnimationFrame(check)
    }

    const waitForProgrammaticScrollCompletion = () =>
      new Promise<void>(resolve => {
        scrollCompletionResolver = resolve
      })

    // Small delay to ensure hero is locked, then scroll
    // For enter-prompt steps, keep a brief delay for layout expansion without feeling sluggish
    const scrollDelay =
      step === 'enter-prompt' || step === 'enter-prompt-2' ? 150 : step === 'follow-up' ? 220 : 100
    scrollDelayTimer = setTimeout(() => {
      scrollDelayTimer = null
      const shouldSkipScroll =
        (step === 'enter-prompt' ||
          step === 'enter-prompt-2' ||
          step === 'follow-up' ||
          isReviewStepFromFollowUp) &&
        initialScrollCompleteRef.current

      const isCustomScrollStep =
        step === 'enter-prompt' ||
        step === 'enter-prompt-2' ||
        step === 'follow-up' ||
        isReviewStepFromFollowUp
      const waitForScroll =
        shouldDelayReveal && !shouldSkipScroll
          ? isCustomScrollStep
            ? waitForProgrammaticScrollCompletion()
            : new Promise<void>(resolve => waitForScrollStop(resolve))
          : null

      if (shouldSkipScroll) {
        updatePosition()
        setIsVisible(true)
        initialScrollCompleteRef.current = true
        setPositionStabilized(true)
        return
      }

      scrollToElement()

      if (shouldDelayReveal && waitForScroll) {
        waitForScroll.then(() => {
          if (stepRef.current !== step) return
          updatePosition()
          initialScrollCompleteRef.current = true

          if (isReviewStepFromFollowUp) {
            // For step 5→6 transition, keep tooltip hidden while position settles,
            // then reveal once at the final position for a clean appearance.
            suppressReviewTooltipRevealRef.current = false
            const t1 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              updatePosition()
            }, 100)
            const t2 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              updatePosition()
              setIsVisible(true)
              setPositionStabilized(true)
            }, 250)
            postScrollTimers = [t1, t2]
          } else {
            setIsVisible(true)
            // Layout can continue to shift (CSS transitions, expanding/collapsing sections)
            // after scroll stops, so re-run positioning a few times to stay aligned.
            const t1 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              updatePosition()
            }, 150)
            const t2 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              updatePosition()
            }, 350)
            const t3 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              updatePosition()
            }, 700)
            // Enable CSS transitions only after all post-scroll position adjustments
            // are done. This prevents the tooltip from visibly animating between
            // intermediate positions during initial placement.
            const t4 = window.setTimeout(() => {
              if (stepRef.current !== step) return
              setPositionStabilized(true)
            }, 800)
            postScrollTimers = [t1, t2, t3, t4]
          }
        })
      } else if (!shouldDelayReveal) {
        // For steps without delay, mark scroll complete after initial scroll animation
        setTimeout(() => {
          initialScrollCompleteRef.current = true
          setPositionStabilized(true)
        }, 150)
      }
    }, scrollDelay)

    // Update position on scroll/resize
    // For step 3 (enter-prompt), prevent updatePosition from running during programmatic scroll
    // to avoid triggering additional scroll adjustments
    const handleScroll = () => {
      if (
        (step === 'enter-prompt' ||
          step === 'enter-prompt-2' ||
          step === 'follow-up' ||
          isReviewStepFromFollowUp) &&
        isScrollingRef.current
      ) {
        return
      }
      updatePosition()
    }
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePosition)
      // Cancel any pending scroll delay timeout — this prevents a stale scroll from
      // firing when the effect re-runs (e.g. targetElement changes after step change).
      if (scrollDelayTimer !== null) {
        clearTimeout(scrollDelayTimer)
      }
      // Cancel any in-progress custom rAF scroll animation
      if (scrollAnimFrame !== null) {
        cancelAnimationFrame(scrollAnimFrame)
      }
      scrollCompletionResolver = null
      if (scrollCheckFrame !== null) {
        window.cancelAnimationFrame(scrollCheckFrame)
      }
      postScrollTimers.forEach(t => window.clearTimeout(t))
      isScrollingRef.current = false
    }
  }, [targetElement, step])

  // Add highlight class to target element(s)
  useEffect(() => {
    if (!step) return

    // No steps skip highlighting - all steps get consistent highlights
    const shouldSkipHighlight = false
    const isDropdownStep = step === 'history-dropdown' || step === 'save-selection'

    // For expand-provider and select-models steps, always find and highlight the entire Google provider section
    // This ensures the highlight persists even if the DOM updates
    // We re-query the element each time to ensure we always have the current reference
    let elementsToHighlight: HTMLElement[] = []
    if (step === 'expand-provider' || step === 'select-models') {
      // Always re-query to get the current element reference (in case DOM updates)
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        elementsToHighlight = [googleDropdown]
      }
    } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      // Highlight the textarea container for step 3 and step 6 (consistent highlight)
      const composerElement = getComposerElement()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'history-dropdown') {
      // Highlight the composer (same blue & green border as step 3)
      const composerElement = getHeroComposerForDropdownSteps()
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
      // Highlight the composer (same blue & green border as step 3)
      const composerElement = getHeroComposerForDropdownSteps()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'submit-comparison') {
      // Highlight the composer for step 4 (same as step 3)
      const composerElement = getComposerElement()
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'follow-up') {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      elementsToHighlight = resultsSection ? [resultsSection] : []
    } else if (step === 'submit-comparison-2') {
      // Highlight the Comparison Results card or loading section
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement
      elementsToHighlight = []
      if (loadingSection) {
        elementsToHighlight.push(loadingSection)
      }
      if (resultsSection) {
        elementsToHighlight.push(resultsSection)
      }
    } else if (step === 'view-follow-up-results') {
      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      elementsToHighlight = resultsSection ? [resultsSection] : []
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
      if (cutout) {
        cutout.top += window.scrollY
        cutout.left += window.scrollX
      }
      setTextareaCutout(cutout)
    } else if (!isDropdownStep && step !== 'follow-up') {
      // Only clear textarea cutout if we're not on a dropdown step
      setTextareaCutout(null)
    }

    // Add class to dropdowns during steps 7 and 8 to keep them above backdrop
    // Also ensure parent container is above backdrop and create cutout
    let historyDropdown: HTMLElement | null = null
    let savedSelectionsDropdown: HTMLElement | null = null
    let dropdownContainer: HTMLElement | null = null
    if (step === 'history-dropdown') {
      historyDropdown = getHistoryInlineListForTutorial()
      dropdownContainer = getHeroComposerForDropdownSteps()
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        if (historyDropdown) {
          historyDropdown.classList.add('tutorial-dropdown-active')
          historyDropdown.classList.add('tutorial-highlight')
        }
        const historyCutout = computeDropdownCutout(dropdownContainer, historyDropdown)
        if (historyCutout) {
          historyCutout.top += window.scrollY
          historyCutout.left += window.scrollX
        }
        setDropdownCutout(historyCutout)
      }
    } else if (step === 'save-selection') {
      const savedForCutout = getSavedSelectionsDropdownForTutorial()
      savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement | null
      dropdownContainer = getHeroComposerForDropdownSteps()
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        if (savedSelectionsDropdown) {
          savedSelectionsDropdown.classList.add('tutorial-dropdown-active')
          savedSelectionsDropdown.classList.add('tutorial-highlight')
        }
        const saveCutout = computeDropdownCutout(dropdownContainer, savedForCutout)
        if (saveCutout) {
          saveCutout.top += window.scrollY
          saveCutout.left += window.scrollX
        }
        setDropdownCutout(saveCutout)
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
        currentStep !== 'expand-provider' &&
        currentStep !== 'select-models' &&
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
        // Also clean up any Google dropdown highlights that might still exist
        const googleDropdown = document.querySelector(
          '.provider-dropdown[data-provider-name="Google"]'
        ) as HTMLElement
        if (googleDropdown) {
          googleDropdown.classList.remove('tutorial-highlight')
          googleDropdown.style.pointerEvents = ''
          googleDropdown.style.position = ''
        }
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
  }, [step, highlightedElements, targetElement])

  // Separate effect to continuously maintain highlight for expand-provider step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility, targetElement, and position are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'expand-provider') return

    // FORCE visibility immediately on mount to ensure tooltip appears
    setIsVisible(true)

    const ensureHighlightVisibilityAndPosition = () => {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        if (!googleDropdown.classList.contains('tutorial-highlight')) {
          googleDropdown.classList.add('tutorial-highlight')
          googleDropdown.style.pointerEvents = 'auto'
          googleDropdown.style.position = 'relative'
        }
        // Ensure visibility, target, and position when interval finds element (main findElement may have failed)
        const headerElement = googleDropdown.querySelector('.provider-header') as HTMLElement
        if (headerElement) {
          setTargetElement(headerElement)
          setIsVisible(true)

          // Calculate position with dynamic top/bottom switching based on available space
          const rect = headerElement.getBoundingClientRect()
          const offset = 16
          const estimatedTooltipHeight = 210
          const minSpaceNeeded = estimatedTooltipHeight + offset + 40

          // Calculate available space
          const spaceAbove = rect.top
          const spaceBelow = window.innerHeight - rect.bottom

          // Determine which position to use:
          // - Default to 'top' (tooltip above provider)
          // - Switch to 'bottom' (tooltip below provider) if not enough space above
          const shouldUseBottom = spaceAbove < minSpaceNeeded && spaceBelow >= minSpaceNeeded

          let top: number
          if (shouldUseBottom) {
            setEffectivePosition('bottom')
            top = rect.bottom + offset
          } else {
            setEffectivePosition('top')
            top = rect.top - offset
          }
          const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
          setOverlayPosition({ top, left })
        } else {
          // Fallback: even if we don't find the header, still show tooltip at a reasonable position
          setIsVisible(true)
          setOverlayPosition({ top: 300, left: window.innerWidth / 2 })
        }
      } else {
        // Fallback: even if we don't find Google dropdown, still show tooltip at center-top
        setIsVisible(true)
        setOverlayPosition({ top: 300, left: window.innerWidth / 2 })
      }
    }

    // Check immediately
    ensureHighlightVisibilityAndPosition()

    const detachScrollResize = attachScrollResizeRaf(ensureHighlightVisibilityAndPosition)

    // Check periodically to maintain highlight, visibility, and position
    const interval = setInterval(ensureHighlightVisibilityAndPosition, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      // Clean up highlight when leaving this step
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        googleDropdown.classList.remove('tutorial-highlight')
        googleDropdown.style.pointerEvents = ''
        googleDropdown.style.position = ''
      }
    }
  }, [step])

  // Separate effect to continuously maintain highlight for select-models step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility, targetElement, and position are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'select-models') return

    // FORCE visibility immediately on mount to ensure tooltip appears
    setIsVisible(true)

    const ensureHighlightVisibilityAndPosition = () => {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        if (!googleDropdown.classList.contains('tutorial-highlight')) {
          googleDropdown.classList.add('tutorial-highlight')
          googleDropdown.style.pointerEvents = 'auto'
          googleDropdown.style.position = 'relative'
        }
        // Ensure visibility, target, and position when interval finds element (main findElement may have failed)
        setTargetElement(googleDropdown)
        setIsVisible(true)

        // Calculate position with dynamic top/bottom switching based on available space
        const rect = googleDropdown.getBoundingClientRect()
        const offset = 16
        const estimatedTooltipHeight = 210
        const minSpaceNeeded = estimatedTooltipHeight + offset + 40

        // Calculate available space
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom

        // Determine which position to use:
        // - Default to 'top' (tooltip above provider)
        // - Switch to 'bottom' (tooltip below provider) if not enough space above
        const shouldUseBottom = spaceAbove < minSpaceNeeded && spaceBelow >= minSpaceNeeded

        let top: number
        if (shouldUseBottom) {
          setEffectivePosition('bottom')
          top = rect.bottom + offset
        } else {
          setEffectivePosition('top')
          top = rect.top - offset
        }
        const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
        setOverlayPosition({ top, left })
      } else {
        // Fallback: even if we don't find Google dropdown, still show tooltip at center-top
        setIsVisible(true)
        setOverlayPosition({ top: 300, left: window.innerWidth / 2 })
      }
    }

    // Check immediately
    ensureHighlightVisibilityAndPosition()

    const detachScrollResize = attachScrollResizeRaf(ensureHighlightVisibilityAndPosition)

    // Check periodically to maintain highlight, visibility, and position
    const interval = setInterval(ensureHighlightVisibilityAndPosition, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      // Clean up highlight when leaving this step
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown) {
        googleDropdown.classList.remove('tutorial-highlight')
        googleDropdown.style.pointerEvents = ''
        googleDropdown.style.position = ''
      }
    }
  }, [step])

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
        const cutout = computeTextareaCutout(composerElement)
        if (cutout) {
          cutout.top += window.scrollY
          cutout.left += window.scrollX
        }
        setTextareaCutout(cutout)
        // Set target element only when needed; avoid re-triggering scroll during the initial phase
        const currentTarget = targetElementRef.current
        if (!currentTarget) {
          setTargetElement(composerElement)
        } else if (initialScrollCompleteRef.current && currentTarget !== composerElement) {
          setTargetElement(composerElement)
        }

        // Only update position AFTER initial scroll is complete to avoid jarring movement
        if (initialScrollCompleteRef.current) {
          // Always position tooltip below the composer (consistent with scroll logic)
          const rect = composerElement.getBoundingClientRect()
          const offset = 16

          setEffectivePosition('bottom')
          const top = rect.bottom + offset
          const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
          setOverlayPosition({ top, left })
        }
      }
    }

    // Run immediately to set up highlight and cutout
    ensureHighlightAndCutout()

    const detachScrollResize = attachScrollResizeRaf(ensureHighlightAndCutout)

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    // Check periodically to maintain highlight, cutout, and position (only after scroll complete)
    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
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
        const cutout = computeTextareaCutout(composerElement)
        if (cutout) {
          cutout.top += window.scrollY
          cutout.left += window.scrollX
        }
        setTextareaCutout(cutout)
        // Set target element if not set
        setTargetElement(composerElement)

        // Only update position AFTER initial scroll is complete to avoid jarring movement
        if (initialScrollCompleteRef.current) {
          // Always position tooltip below the composer (consistent with scroll logic)
          const rect = composerElement.getBoundingClientRect()
          const offset = 16

          setEffectivePosition('bottom')
          const top = rect.bottom + offset
          const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
          setOverlayPosition({ top, left })
        }
      }
    }

    // Run immediately to set up highlight and cutout
    ensureHighlightAndCutout()

    const detachScrollResize = attachScrollResizeRaf(ensureHighlightAndCutout)

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    // Check periodically to maintain highlight, cutout, and position (only after scroll complete)
    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
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
      const loadingSection = document.querySelector('.loading-section') as HTMLElement

      if (step === 'follow-up') {
        if (stepRef.current !== 'follow-up') return
        if (loadingSection) {
          loadingSection.classList.remove('tutorial-highlight')
          loadingSection.style.pointerEvents = ''
          loadingSection.style.position = ''
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
          // Backdrop holes (results + composer rings): updated atomically by follow-up backdrop sync effect.
          // Do not call setTargetElement(composer) here — remounts retriggered the scroll effect.
          if (initialScrollCompleteRef.current) {
            setIsVisible(true)
            const el = getComposerElement()
            if (el) {
              const rect = el.getBoundingClientRect()
              const {
                top,
                left,
                effectivePosition: effPos,
              } = computeTooltipPosition(rect, 'follow-up', TUTORIAL_STEPS_CONFIG['follow-up'])
              setEffectivePosition(effPos)
              setOverlayPosition({ top, left })
            }
          }
        }
        return
      }

      if (step === 'view-follow-up-results') {
        if (loadingSection) {
          loadingSection.classList.remove('tutorial-highlight')
          loadingSection.style.pointerEvents = ''
          loadingSection.style.position = ''
        }
        if (resultsSection) {
          if (!resultsSection.classList.contains('tutorial-highlight')) {
            resultsSection.classList.add('tutorial-highlight')
            resultsSection.style.pointerEvents = 'auto'
            resultsSection.style.position = 'relative'
          }
          setTargetElement(resultsSection)
          if (!suppressReviewTooltipRevealRef.current) {
            setIsVisible(true)
          }
        }
        return
      }

      // Highlight loading section if it exists (appears after submit, before results)
      if (loadingSection && !loadingSection.classList.contains('tutorial-highlight')) {
        loadingSection.classList.add('tutorial-highlight')
        loadingSection.style.pointerEvents = 'auto'
        loadingSection.style.position = 'relative'
      }

      // Highlight results section if it exists (appears when results start coming in)
      if (resultsSection && !resultsSection.classList.contains('tutorial-highlight')) {
        resultsSection.classList.add('tutorial-highlight')
        resultsSection.style.pointerEvents = 'auto'
        resultsSection.style.position = 'relative'
      }

      // Maintain textarea cutout for submit steps (view-follow-up-results returns above)
      const composerElement = getComposerElement()
      if (composerElement) {
        composerElement.classList.add('tutorial-textarea-active')
        if (step === 'submit-comparison') {
          composerElement.classList.add('tutorial-highlight')
          composerElement.style.pointerEvents = 'auto'
          composerElement.style.position = 'relative'
        }
        const cutout = computeTextareaCutout(composerElement)
        if (cutout) {
          cutout.top += window.scrollY
          cutout.left += window.scrollX
        }
        setTextareaCutout(cutout)
      }

      // Ensure visibility and target when interval finds element (main findElement may have failed)
      if (step === 'submit-comparison' || step === 'submit-comparison-2') {
        const submitButton = document.querySelector(
          '[data-testid="comparison-submit-button"]'
        ) as HTMLElement
        if (submitButton) {
          setTargetElement(submitButton)
          setIsVisible(true)
        }
      }
    }

    // Check immediately
    ensureHighlightCutoutAndVisibility()

    const detachScrollResize = attachScrollResizeRaf(ensureHighlightCutoutAndVisibility)

    // Check periodically to maintain highlight, cutout, and visibility
    const interval = setInterval(ensureHighlightCutoutAndVisibility, 200)

    return () => {
      detachScrollResize()
      clearInterval(interval)
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
  }, [step])

  // Ensure the textarea is not kept above the backdrop on view-follow-up-results
  // This step should only keep the results section visible
  useEffect(() => {
    if (step !== 'view-follow-up-results') {
      return
    }

    const composerElement = getComposerElement()
    if (composerElement) {
      composerElement.classList.remove('tutorial-textarea-active')
      composerElement.classList.remove('tutorial-highlight')
      composerElement.style.pointerEvents = ''
      composerElement.style.position = ''
    }
    setTextareaCutout(null)
  }, [step])

  // Submit steps + view-follow-up-results: dimmed backdrop with cutout over loading, then over results
  useEffect(() => {
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    const isReviewAfterFollowUp = step === 'view-follow-up-results'
    const useLoadingCutout = (isSubmitStep || isReviewAfterFollowUp) && isLoading

    if (!useLoadingCutout) {
      setLoadingStreamingCutout(null)
      return
    }

    const isFollowUpStyleLoading = step === 'submit-comparison-2' || isReviewAfterFollowUp

    // Track if we've already scrolled to results section
    let hasScrolledToResults = false
    // For follow-up (step 7), results section already exists, so we need to wait
    // for loading section to appear first before allowing scroll
    let loadingSectionWasSeen = false

    const updateLoadingStreamingCutout = () => {
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement

      if (loadingSection) {
        loadingSectionWasSeen = true
      }

      if (isReviewAfterFollowUp && !streamAnswerStarted && loadingSection) {
        const rect = loadingSection.getBoundingClientRect()
        const padding = 12
        setLoadingStreamingCutout({
          top: rect.top + window.scrollY - padding,
          left: rect.left + window.scrollX - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
        return
      }

      if (resultsSection) {
        const canScroll = isFollowUpStyleLoading ? loadingSectionWasSeen : true

        if (!hasScrolledToResults && canScroll) {
          hasScrolledToResults = true
          requestAnimationFrame(() => {
            setTimeout(() => {
              resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
          })
        }

        const rect = resultsSection.getBoundingClientRect()
        const padding = 12
        setLoadingStreamingCutout({
          top: rect.top + window.scrollY - padding,
          left: rect.left + window.scrollX - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
      } else if (loadingSection) {
        const rect = loadingSection.getBoundingClientRect()
        const padding = 12
        setLoadingStreamingCutout({
          top: rect.top + window.scrollY - padding,
          left: rect.left + window.scrollX - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
      }
    }

    updateLoadingStreamingCutout()

    const detachScrollResize = attachScrollResizeRaf(updateLoadingStreamingCutout)

    // Update periodically to catch when results section appears and to keep cutout position current
    const interval = setInterval(updateLoadingStreamingCutout, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
      setLoadingStreamingCutout(null)
    }
  }, [step, isLoading, streamAnswerStarted])

  // Step 6: pulse/highlight on the processing block before stream tokens (same class as submit loading)
  useEffect(() => {
    const loadingSection = document.querySelector('.loading-section') as HTMLElement | null
    if (step !== 'view-follow-up-results') {
      if (loadingSection) {
        loadingSection.classList.remove('tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      return
    }
    const shouldHighlight = isLoading && !streamAnswerStarted && loadingSection
    if (!shouldHighlight) {
      if (loadingSection) {
        loadingSection.classList.remove('tutorial-highlight')
        loadingSection.style.pointerEvents = ''
        loadingSection.style.position = ''
      }
      return
    }
    loadingSection.classList.add('tutorial-highlight')
    loadingSection.style.pointerEvents = 'auto'
    loadingSection.style.position = 'relative'
    return () => {
      loadingSection.classList.remove('tutorial-highlight')
      loadingSection.style.pointerEvents = ''
      loadingSection.style.position = ''
    }
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
      const historyToggleButton = getHistoryToggleButtonForTutorial()
      if (historyToggleButton) {
        // Add highlight class to the button for visual emphasis
        if (!historyToggleButton.classList.contains('tutorial-highlight')) {
          historyToggleButton.classList.add('tutorial-highlight')
        }
        // Ensure visibility and target when interval finds element (main findElement may have failed)
        setTargetElement(historyToggleButton)
        setIsVisible(true)
      }

      // Cutout expands to include dropdown when open (composer + dropdown union)
      const composerElement = getHeroComposerForDropdownSteps()
      const historyDropdown = getHistoryInlineListForTutorial()
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (same blue & green as step 3)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        const histCutout = computeDropdownCutout(composerElement, historyDropdown)
        if (histCutout) {
          histCutout.top += window.scrollY
          histCutout.left += window.scrollX
        }
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
      const historyDropdown = getHistoryInlineListForTutorial()
      if (historyDropdown) {
        historyDropdown.classList.remove('tutorial-dropdown-active')
        historyDropdown.classList.remove('tutorial-highlight')
      }
      const historyButton = getHistoryToggleButtonForTutorial()
      if (historyButton) {
        historyButton.classList.remove('tutorial-highlight')
      }
      if (transitioningToSaveSelection) {
        return
      }
      const composerElement = getHeroComposerForDropdownSteps()
      if (composerElement) {
        composerElement.classList.remove('tutorial-dropdown-container-active')
        composerElement.classList.remove('tutorial-highlight')
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
      const savedSelectionsButton = getSavedSelectionsButtonForTutorial()
      if (savedSelectionsButton) {
        // Add highlight class to the button for visual emphasis
        if (!savedSelectionsButton.classList.contains('tutorial-highlight')) {
          savedSelectionsButton.classList.add('tutorial-highlight')
        }
        // Ensure visibility and target when interval finds element (main findElement may have failed)
        setTargetElement(savedSelectionsButton)
        setIsVisible(true)
      }

      // Cutout expands to include dropdown when open (composer + dropdown union).
      // When the panel portals only under the below-results composer, `savedSelectionsForCutout` is null
      // so the hole stays on the hero composer only (avoids a full-page union).
      const composerElement = getHeroComposerForDropdownSteps()
      const savedSelectionsForCutout = getSavedSelectionsDropdownForTutorial()
      const savedDropdownAnywhere = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement | null
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (same blue & green as step 3)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        const selCutout = computeDropdownCutout(composerElement, savedSelectionsForCutout)
        if (selCutout) {
          selCutout.top += window.scrollY
          selCutout.left += window.scrollX
        }
        setDropdownCutout(selCutout)
      }

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
      const composerElement = getHeroComposerForDropdownSteps()
      if (composerElement) {
        composerElement.classList.remove('tutorial-dropdown-container-active')
        composerElement.classList.remove('tutorial-highlight')
      }
      document.querySelectorAll('.saved-selections-button').forEach(el => {
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
      const composerElement = getComposerElement()
      const cutout = composerElement ? computeTextareaCutout(composerElement) : null
      if (cutout) {
        cutout.top += window.scrollY
        cutout.left += window.scrollX
      }
      setTextareaCutout(cutout)
    }

    updateTextareaCutout()

    const detachScrollResize = attachScrollResizeRaf(updateTextareaCutout)
    const interval = setInterval(updateTextareaCutout, 100)

    return () => {
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
      const composer = getHeroComposerForDropdownSteps()
      if (!composer) return

      const dropdown =
        step === 'history-dropdown'
          ? getHistoryInlineListForTutorial()
          : getSavedSelectionsDropdownForTutorial()
      const cutout = computeDropdownCutout(composer, dropdown)
      if (cutout) {
        cutout.top += window.scrollY
        cutout.left += window.scrollX
      }
      setDropdownCutout(cutout)
    }

    updateDropdownCutout()

    const detachScrollResize = attachScrollResizeRaf(updateDropdownCutout)
    const interval = setInterval(updateDropdownCutout, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step])

  // Step 5 (follow-up): keep results + composer backdrop holes in lockstep. Previously, separate
  // effects/rAF callbacks updated targetCutout vs textareaCutout one after another, so fast scroll
  // could paint mismatched rings. Use one DOM read + batched setState; composer ring uses the full
  // composer (header + input) to match .tutorial-highlight, not only input-wrapper/toolbar rects.
  useEffect(() => {
    if (step !== 'follow-up') return

    const syncFollowUpBackdropCutouts = () => {
      if (stepRef.current !== 'follow-up') return
      const resultsSection = document.querySelector('.results-section') as HTMLElement | null
      const composerElement = getComposerElement()

      const targetCut = resultsSection != null ? computeTargetCutout([resultsSection], 8, 24) : null
      if (targetCut) {
        targetCut.top += window.scrollY
        targetCut.left += window.scrollX
      }

      const composerCutFull =
        composerElement != null ? computeTargetCutout([composerElement], 8, 32) : null
      if (composerCutFull) {
        composerCutFull.top += window.scrollY
        composerCutFull.left += window.scrollX
      }
      const composerCutRect = composerCutFull
        ? {
            top: composerCutFull.top,
            left: composerCutFull.left,
            width: composerCutFull.width,
            height: composerCutFull.height,
          }
        : null

      setTargetCutout(targetCut)
      setTextareaCutout(composerCutRect)
    }

    syncFollowUpBackdropCutouts()
    const detachScrollResize = attachScrollResizeRaf(syncFollowUpBackdropCutouts)
    const interval = setInterval(syncFollowUpBackdropCutouts, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step])

  // Calculate target cutout for steps that don't have special cutout handling.
  // Uses document-relative (absolute) coordinates so it scrolls with the page.
  useEffect(() => {
    const needsTargetCutout =
      step === 'expand-provider' || step === 'select-models' || step === 'view-follow-up-results'

    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'

    if (!needsTargetCutout && !isSubmitStep) {
      setTargetCutout(null)
      return
    }

    const updateTargetCutout = () => {
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
      const isProviderStep = step === 'expand-provider' || step === 'select-models'
      /* Concentric outer radius: element radius + cutout padding (8px). */
      const borderRadius =
        step === 'view-follow-up-results'
          ? 24 /* results area */
          : isSubmitStep
            ? 32 /* composer (match step 3–4) */
            : isProviderStep
              ? 20 /* --radius-xl (12px) + 8 */
              : 12
      const cutout = computeTargetCutout(elementsToUse, padding, borderRadius)
      if (cutout) {
        cutout.top += window.scrollY
        cutout.left += window.scrollX
      }
      setTargetCutout(cutout)
    }

    updateTargetCutout()

    const detachScrollResize = attachScrollResizeRaf(updateTargetCutout)
    const interval = setInterval(updateTargetCutout, 100)

    return () => {
      detachScrollResize()
      clearInterval(interval)
    }
  }, [step, highlightedElements, targetElement])

  const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
  const isLoadingStreamingPhase = Boolean(
    (isSubmitStep || step === 'view-follow-up-results') && isLoading && loadingStreamingCutout
  )
  const config = step ? TUTORIAL_STEPS_CONFIG[step] : null
  const { stepIndex, totalSteps } = getTutorialVisibleStepProgress(step)
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
  const shouldBlock =
    !isLoadingStreamingPhase && hasAttemptedElementFindRef.current && !isVisible && !targetElement
  return {
    overlayRef,
    stepRef,
    dropdownWasOpenedRef,
    saveSelectionDropdownOpened,
    hasAttemptedElementFindRef,
    targetElement,
    overlayPosition,
    isVisible,
    portalRoot,
    effectivePosition,
    positionStabilized,
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
    shouldBlock,
  }
}

export { useTutorialOverlay }
