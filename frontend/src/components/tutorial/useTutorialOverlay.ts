import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
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

import { useTutorialCleanup } from './useTutorialCleanup'

interface HTMLElementWithTutorialProps extends HTMLElement {
  __tutorialHeightObserver?: MutationObserver
  __tutorialHeightInterval?: number
}

export function useTutorialOverlay(step: TutorialStep | null, isLoading: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<TutorialStep | null>(step)
  const heroHeightLockedRef = useRef<boolean>(false)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  // State for save-selection step so Done button re-renders when user clicks (ref doesn't trigger re-renders)
  const [saveSelectionDropdownOpened, setSaveSelectionDropdownOpened] = useState(false)
  const hasAttemptedElementFindRef = useRef<boolean>(false)
  const tooltipClampAttemptsRef = useRef<number>(0)
  const initialScrollCompleteRef = useRef<boolean>(false)
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
    stepRef.current = step
    // Reset dropdown opened flag when step changes away from dropdown steps
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
      setButtonCutout(null)
    }
  }, [step])

  // Reset save-selection flag synchronously before paint when entering step 10
  // useLayoutEffect ensures user never sees Done enabled before they've clicked
  useLayoutEffect(() => {
    if (step === 'save-selection') {
      setSaveSelectionDropdownOpened(false)
    }
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

      // Note: Removed MutationObserver and interval that were causing infinite loops
      // The initial lock should be sufficient for the tutorial duration
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
      step === 'submit-comparison-2'

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

    // Clear cutout states when entering a new step to ensure fresh calculation
    // This prevents stale cutout positions from previous steps
    setTextareaCutout(null)
    setDropdownCutout(null)
    setButtonCutout(null)

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
        element = document.querySelector(config.targetSelector) as HTMLElement
        // Find and add the history dropdown if it exists
        const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
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
        element = document.querySelector(config.targetSelector) as HTMLElement
        // Find and add the saved selections dropdown if it exists
        const savedSelectionsDropdown = document.querySelector(
          '.saved-selections-dropdown'
        ) as HTMLElement
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
        element = document.querySelector('.composer') as HTMLElement
        if (!element) {
          // Fallback: try to find by testid and get parent container
          const textarea = document.querySelector(
            '[data-testid="comparison-input-textarea"]'
          ) as HTMLElement
          if (textarea) {
            element = textarea.closest('.composer') as HTMLElement
          }
        }
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
          setTextareaCutout(computeTextareaCutout(composerElement))
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
        // Special handling for view-follow-up-results step - target and highlight the results section
        element = document.querySelector('.results-section') as HTMLElement
        if (element) {
          setHighlightedElements([element])
        } else {
          setHighlightedElements([])
        }
      } else if (step === 'follow-up') {
        // Special handling for follow-up step - highlight the results section so users can see results
        // while the tooltip points at the follow-up button
        const resultsSection = document.querySelector('.results-section') as HTMLElement
        if (resultsSection) {
          setHighlightedElements([resultsSection])
        } else {
          setHighlightedElements([])
        }
        // Use default selector for the follow-up button
        element = document.querySelector(config.targetSelector) as HTMLElement
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
          // For enter-prompt steps, DON'T set visible here — the scroll effect
          // controls visibility and will show the tooltip after scrolling completes.
          // Setting it here causes a brief flash at the wrong position.
          if (step !== 'enter-prompt' && step !== 'enter-prompt-2') {
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
    if (!targetElement || !step) return

    const config = TUTORIAL_STEPS_CONFIG[step]
    const isDropdownStep = step === 'history-dropdown' || step === 'save-selection'
    let scrollCheckFrame: number | null = null
    let postScrollTimers: number[] = []
    let scrollDelayTimer: ReturnType<typeof setTimeout> | null = null
    let scrollAnimFrame: number | null = null // Track custom rAF scroll animation
    let scrollCompletionResolver: (() => void) | null = null
    const isScrollingRef = { current: false } // Track if we're in the middle of programmatic scroll

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect()
      const { top, left, effectivePosition: effPos } = computeTooltipPosition(rect, step, config)
      setEffectivePosition(effPos)
      setOverlayPosition({ top, left })
    }

    updatePosition()

    const scrollToElement = () => {
      const scrollTarget = getScrollTargetForStep(step, targetElement)

      // Scroll smoothly without affecting hero section layout
      // For step 3 (enter-prompt) and step 6 (enter-prompt-2), use slower, smoother scrolling
      const scrollOptions: ScrollToOptions = {
        top: Math.max(0, scrollTarget),
        behavior: 'smooth',
        left: window.pageXOffset, // Keep horizontal position
      }

      if (step === 'enter-prompt' || step === 'enter-prompt-2') {
        // Use a custom smooth scroll implementation for slower, smoother scrolling
        const startScrollY = window.pageYOffset
        const targetScrollY = Math.max(0, scrollTarget)
        const distance = targetScrollY - startScrollY

        // Mark that we're starting a programmatic scroll
        isScrollingRef.current = true

        const duration = 900 // Faster smooth scroll for prompt steps
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
    const rect = targetElement.getBoundingClientRect()
    const isTargetOffscreen = rect.bottom < 0 || rect.top > window.innerHeight
    const isEnterPromptStep = step === 'enter-prompt' || step === 'enter-prompt-2'
    // Delay reveal for dropdown steps when target is offscreen, or ALWAYS for enter-prompt steps
    // (enter-prompt needs scroll to position the composer correctly with room for tooltip above)
    const shouldDelayReveal = (isDropdownStep && isTargetOffscreen) || isEnterPromptStep

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
    const scrollDelay = step === 'enter-prompt' || step === 'enter-prompt-2' ? 150 : 100
    scrollDelayTimer = setTimeout(() => {
      scrollDelayTimer = null
      const shouldSkipScroll =
        (step === 'enter-prompt' || step === 'enter-prompt-2') && initialScrollCompleteRef.current

      const isCustomScrollStep = step === 'enter-prompt' || step === 'enter-prompt-2'
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
          setIsVisible(true)
          // Mark initial scroll as complete - allows dedicated step effects to take over positioning
          initialScrollCompleteRef.current = true
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
        })
      } else if (!shouldDelayReveal) {
        // For steps without delay, mark scroll complete after initial scroll animation
        setTimeout(() => {
          initialScrollCompleteRef.current = true
          setPositionStabilized(true)
        }, 500)
      }
    }, scrollDelay)

    // Update position on scroll/resize
    // For step 3 (enter-prompt), prevent updatePosition from running during programmatic scroll
    // to avoid triggering additional scroll adjustments
    const handleScroll = () => {
      if ((step === 'enter-prompt' || step === 'enter-prompt-2') && isScrollingRef.current) {
        // Skip position updates during programmatic scroll for step 3
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
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'history-dropdown') {
      // Highlight the composer (same blue & green border as step 3)
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
      // Explicitly remove highlight from results section when transitioning to step 9
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      if (resultsSection) {
        resultsSection.classList.remove('tutorial-highlight')
        resultsSection.style.pointerEvents = ''
        resultsSection.style.position = ''
      }
    } else if (step === 'save-selection') {
      // Highlight the composer (same blue & green border as step 3)
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'submit-comparison') {
      // Highlight the composer for step 4 (same as step 3)
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (
      step === 'submit-comparison-2' ||
      step === 'follow-up' ||
      step === 'view-follow-up-results'
    ) {
      // Highlight the Comparison Results card or loading section for submit steps, follow-up step, and view-follow-up-results step
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      const loadingSection = document.querySelector('.loading-section') as HTMLElement
      elementsToHighlight = []
      if (loadingSection) {
        elementsToHighlight.push(loadingSection)
      }
      if (resultsSection) {
        elementsToHighlight.push(resultsSection)
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
      step === 'enter-prompt-2'
    let composerElement: HTMLElement | null = null
    if (shouldExcludeTextarea) {
      composerElement = getComposerElement()
      setTextareaCutout(composerElement ? computeTextareaCutout(composerElement) : null)
    } else if (!isDropdownStep) {
      // Only clear textarea cutout if we're not on a dropdown step
      setTextareaCutout(null)
    }

    // Add class to dropdowns during steps 8 and 9 to keep them above backdrop (not dimmed, but no border)
    // Also ensure parent container is above backdrop and create cutout
    let historyDropdown: HTMLElement | null = null
    let savedSelectionsDropdown: HTMLElement | null = null
    let dropdownContainer: HTMLElement | null = null
    if (step === 'history-dropdown') {
      historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
      dropdownContainer = document.querySelector('.composer') as HTMLElement
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        if (historyDropdown) {
          historyDropdown.classList.add('tutorial-dropdown-active')
        }
        setDropdownCutout(computeDropdownCutout(dropdownContainer, historyDropdown))
      }
    } else if (step === 'save-selection') {
      savedSelectionsDropdown = document.querySelector('.saved-selections-dropdown') as HTMLElement
      dropdownContainer = document.querySelector('.composer') as HTMLElement
      if (dropdownContainer) {
        dropdownContainer.classList.add('tutorial-dropdown-container-active')
        if (savedSelectionsDropdown) {
          savedSelectionsDropdown.classList.add('tutorial-dropdown-active')
        }
        setDropdownCutout(computeDropdownCutout(dropdownContainer, savedSelectionsDropdown))
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
        const composerElement = document.querySelector('.composer') as HTMLElement
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
        }
        const savedSelectionsDropdown = document.querySelector(
          '.saved-selections-dropdown'
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

    // Check periodically to maintain highlight, visibility, and position
    const interval = setInterval(ensureHighlightVisibilityAndPosition, 100)

    return () => {
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

    // Check periodically to maintain highlight, visibility, and position
    const interval = setInterval(ensureHighlightVisibilityAndPosition, 100)

    return () => {
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
        // Ensure textarea-active class is present
        composerElement.classList.add('tutorial-textarea-active')
        setTextareaCutout(computeTextareaCutout(composerElement))
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

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    // Check periodically to maintain highlight, cutout, and position (only after scroll complete)
    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
      // Clean up highlight when leaving this step
      const composerElement = document.querySelector('.composer') as HTMLElement
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
        // Ensure textarea-active class is present
        composerElement.classList.add('tutorial-textarea-active')
        setTextareaCutout(computeTextareaCutout(composerElement))
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

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightAndCutout, 50)

    // Check periodically to maintain highlight, cutout, and position (only after scroll complete)
    const interval = setInterval(ensureHighlightAndCutout, 100)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
      // Clean up highlight when leaving this step
      const composerElement = document.querySelector('.composer') as HTMLElement
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

      // Also maintain textarea cutout for submit steps (they need the textarea visible)
      // But NOT for view-follow-up-results step - it only needs the results section visible
      if (step !== 'view-follow-up-results') {
        const composerElement = getComposerElement()
        if (composerElement) {
          composerElement.classList.add('tutorial-textarea-active')
          if (step === 'submit-comparison') {
            composerElement.classList.add('tutorial-highlight')
            composerElement.style.pointerEvents = 'auto'
            composerElement.style.position = 'relative'
          }
          setTextareaCutout(computeTextareaCutout(composerElement))
        }
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
      // For follow-up step, target the follow-up button
      else if (step === 'follow-up') {
        const followUpButton = document.querySelector(
          '.follow-up-button:not(.export-dropdown-trigger)'
        ) as HTMLElement
        if (followUpButton) {
          setTargetElement(followUpButton)
          setIsVisible(true)
        }
      }
      // For view-follow-up-results step, target the results section
      else if (step === 'view-follow-up-results') {
        if (resultsSection) {
          setTargetElement(resultsSection)
          setIsVisible(true)
        }
      }
    }

    // Check immediately
    ensureHighlightCutoutAndVisibility()

    // Check periodically to maintain highlight, cutout, and visibility
    const interval = setInterval(ensureHighlightCutoutAndVisibility, 200)

    return () => {
      clearInterval(interval)
      // Remove highlight when effect stops (e.g., when transitioning to step 9)
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
      if (nextStep !== 'enter-prompt-2') {
        const composerElement = document.querySelector('.composer') as HTMLElement
        if (composerElement) {
          composerElement.classList.remove('tutorial-textarea-active')
          composerElement.classList.remove('tutorial-highlight')
          composerElement.style.pointerEvents = ''
          composerElement.style.position = ''
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

    const composerElement = document.querySelector('.composer') as HTMLElement
    if (composerElement) {
      composerElement.classList.remove('tutorial-textarea-active')
      composerElement.classList.remove('tutorial-highlight')
      composerElement.style.pointerEvents = ''
      composerElement.style.position = ''
    }
    setTextareaCutout(null)
  }, [step])

  // Effect to handle loading/streaming cutout for submit-comparison steps
  // Phase 1: Loading section cutout (before streaming begins)
  // Phase 2: Results section cutout with scroll (once streaming begins)
  useEffect(() => {
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
    const isFollowUpSubmit = step === 'submit-comparison-2'

    // Clear cutout when not on submit step or when loading ends
    if (!isSubmitStep || !isLoading) {
      setLoadingStreamingCutout(null)
      return
    }

    // Track if we've already scrolled to results section
    let hasScrolledToResults = false
    // For follow-up (step 7), results section already exists, so we need to wait
    // for loading section to appear first before allowing scroll
    let loadingSectionWasSeen = false

    const updateLoadingStreamingCutout = () => {
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
        const padding = 12
        setLoadingStreamingCutout({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
      }
      // Phase 1: Only loading section exists = still in initial loading phase, before streaming
      else if (loadingSection) {
        const rect = loadingSection.getBoundingClientRect()
        const padding = 12
        setLoadingStreamingCutout({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        })
      }
    }

    // Update immediately
    updateLoadingStreamingCutout()

    // Update periodically to catch when results section appears and to keep cutout position current
    const interval = setInterval(updateLoadingStreamingCutout, 100)

    return () => {
      clearInterval(interval)
      setLoadingStreamingCutout(null)
    }
  }, [step, isLoading])

  // Separate effect to continuously maintain dropdown active class for history-dropdown step
  // This ensures the dropdown stays above backdrop even if the DOM updates
  // ALSO ensures visibility and targetElement are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'history-dropdown') return

    // Listen for clicks on the history toggle button to mark dropdown as opened
    const historyToggleButton = document.querySelector('.history-toggle-button') as HTMLElement
    const handleHistoryButtonClick = () => {
      dropdownWasOpenedRef.current = true
    }
    if (historyToggleButton) {
      historyToggleButton.addEventListener('click', handleHistoryButtonClick)
    }

    const ensureDropdownActiveAndVisibility = () => {
      const historyToggleButton = document.querySelector('.history-toggle-button') as HTMLElement
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
      const composerElement = document.querySelector('.composer') as HTMLElement
      const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (same blue & green as step 3)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        setDropdownCutout(computeDropdownCutout(composerElement, historyDropdown))
      }

      if (historyDropdown) {
        // Mark that dropdown was opened
        dropdownWasOpenedRef.current = true
        if (!historyDropdown.classList.contains('tutorial-dropdown-active')) {
          historyDropdown.classList.add('tutorial-dropdown-active')
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
      if (historyToggleButton) {
        historyToggleButton.removeEventListener('click', handleHistoryButtonClick)
      }
      // Clean up on unmount
      const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
      if (historyDropdown) {
        historyDropdown.classList.remove('tutorial-dropdown-active')
      }
      const composerElement = document.querySelector(
        '.composer.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (composerElement) {
        composerElement.classList.remove('tutorial-dropdown-container-active')
        composerElement.classList.remove('tutorial-highlight')
      }
      // Clean up highlight from history button
      const historyButton = document.querySelector('.history-toggle-button') as HTMLElement
      if (historyButton) {
        historyButton.classList.remove('tutorial-highlight')
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
      const savedSelectionsButton = document.querySelector(
        '.saved-selections-button'
      ) as HTMLElement
      if (savedSelectionsButton) {
        // Add highlight class to the button for visual emphasis
        if (!savedSelectionsButton.classList.contains('tutorial-highlight')) {
          savedSelectionsButton.classList.add('tutorial-highlight')
        }
        // Ensure visibility and target when interval finds element (main findElement may have failed)
        setTargetElement(savedSelectionsButton)
        setIsVisible(true)
      }

      // Cutout expands to include dropdown when open (composer + dropdown union)
      const composerElement = document.querySelector('.composer') as HTMLElement
      const savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (same blue & green as step 3)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        setDropdownCutout(computeDropdownCutout(composerElement, savedSelectionsDropdown))
      }

      if (savedSelectionsDropdown) {
        // Dropdown only exists when user has clicked "Save or load model selections"
        // Use DOM presence as source of truth - enable Done only when dropdown is visible
        if (!didEnableDoneForThisStep) {
          didEnableDoneForThisStep = true
          setSaveSelectionDropdownOpened(true)
        }
        if (!savedSelectionsDropdown.classList.contains('tutorial-dropdown-active')) {
          savedSelectionsDropdown.classList.add('tutorial-dropdown-active')
        }
      }
    }

    // Check immediately
    ensureDropdownActiveAndVisibility()

    // Check periodically to maintain dropdown state and visibility (no MutationObserver to avoid performance issues)
    const interval = setInterval(ensureDropdownActiveAndVisibility, 100)

    return () => {
      clearInterval(interval)
      const savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement
      if (savedSelectionsDropdown) {
        savedSelectionsDropdown.classList.remove('tutorial-dropdown-active')
      }
      const composerElement = document.querySelector(
        '.composer.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (composerElement) {
        composerElement.classList.remove('tutorial-dropdown-container-active')
        composerElement.classList.remove('tutorial-highlight')
      }
      // Clean up highlight from saved selections button
      const savedButton = document.querySelector('.saved-selections-button') as HTMLElement
      if (savedButton) {
        savedButton.classList.remove('tutorial-highlight')
      }
      setDropdownCutout(null)
    }
  }, [step])

  // Update textarea cutout position on scroll/resize for textarea-related steps. Must be called before any early returns (Rules of Hooks).
  useEffect(() => {
    const shouldExcludeTextarea =
      step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison-2'
    if (!shouldExcludeTextarea) return

    const updateTextareaCutout = () => {
      const composerElement = getComposerElement()
      setTextareaCutout(composerElement ? computeTextareaCutout(composerElement) : null)
    }

    // Update immediately
    updateTextareaCutout()

    // Update on scroll/resize
    window.addEventListener('scroll', updateTextareaCutout, true)
    window.addEventListener('resize', updateTextareaCutout)

    return () => {
      window.removeEventListener('scroll', updateTextareaCutout, true)
      window.removeEventListener('resize', updateTextareaCutout)
    }
  }, [step, targetElement])

  // Update dropdown cutout position on scroll/resize for dropdown steps. Cutout expands to include
  // the dropdown when opened (composer + dropdown union).
  useEffect(() => {
    const shouldExcludeDropdown = step === 'history-dropdown' || step === 'save-selection'
    if (!shouldExcludeDropdown) return

    const updateDropdownCutout = () => {
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (!composer) return

      const dropdown =
        step === 'history-dropdown'
          ? (document.querySelector('.history-inline-list') as HTMLElement)
          : (document.querySelector('.saved-selections-dropdown') as HTMLElement)
      setDropdownCutout(computeDropdownCutout(composer, dropdown))
    }

    // Update immediately
    updateDropdownCutout()

    // Update on scroll/resize and periodically so cutout expands when dropdown opens
    window.addEventListener('scroll', updateDropdownCutout, true)
    window.addEventListener('resize', updateDropdownCutout)
    const interval = setInterval(updateDropdownCutout, 100)

    return () => {
      window.removeEventListener('scroll', updateDropdownCutout, true)
      window.removeEventListener('resize', updateDropdownCutout)
      clearInterval(interval)
    }
  }, [step])

  // Calculate target cutout for steps that don't have special cutout handling
  // This ensures the target element is not dimmed by the backdrop
  useEffect(() => {
    const needsTargetCutout =
      step === 'expand-provider' ||
      step === 'select-models' ||
      step === 'follow-up' ||
      step === 'view-follow-up-results'

    // For submit-comparison steps, we need to show the textarea container
    // This serves as a fallback in case textareaCutout timing is off
    const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'

    if (!needsTargetCutout && !isSubmitStep) {
      setTargetCutout(null)
      return
    }

    const updateTargetCutout = () => {
      let elementsToUse: HTMLElement[] = []
      if (isSubmitStep) {
        const composerElement = document.querySelector('.composer') as HTMLElement
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
      const borderRadius = step === 'view-follow-up-results' ? 16 : isSubmitStep ? 32 : 12
      setTargetCutout(computeTargetCutout(elementsToUse, padding, borderRadius))
    }

    // Update immediately
    updateTargetCutout()

    // Update on scroll/resize
    window.addEventListener('scroll', updateTargetCutout, true)
    window.addEventListener('resize', updateTargetCutout)

    // Also update periodically to handle dynamic content
    const interval = setInterval(updateTargetCutout, 100)

    return () => {
      window.removeEventListener('scroll', updateTargetCutout, true)
      window.removeEventListener('resize', updateTargetCutout)
      clearInterval(interval)
    }
  }, [step, highlightedElements, targetElement])

  const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
  const isLoadingStreamingPhase = Boolean(isSubmitStep && isLoading && loadingStreamingCutout)
  const config = step ? TUTORIAL_STEPS_CONFIG[step] : null
  const stepIndex = step ? Object.keys(TUTORIAL_STEPS_CONFIG).indexOf(step) + 1 : 0
  const totalSteps = Object.keys(TUTORIAL_STEPS_CONFIG).length
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
