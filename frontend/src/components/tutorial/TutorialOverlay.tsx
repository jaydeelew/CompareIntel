import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { TutorialStep } from '../../hooks/useTutorial'

import { TUTORIAL_STEPS_CONFIG } from './tutorialSteps'
import './TutorialOverlay.css'

interface TutorialOverlayProps {
  step: TutorialStep | null
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
  isLoading?: boolean
}

interface HTMLElementWithTutorialProps extends HTMLElement {
  __tutorialHeightObserver?: MutationObserver
  __tutorialHeightInterval?: number
}

function getComposerElement(): HTMLElement | null {
  const composer = document.querySelector('.composer') as HTMLElement | null
  if (composer) return composer
  const textarea = document.querySelector(
    '[data-testid="comparison-input-textarea"]'
  ) as HTMLElement | null
  return (textarea?.closest('.composer') as HTMLElement | null) || null
}

function getComposerCutoutRects(composerElement: HTMLElement): DOMRect[] {
  const inputWrapper = composerElement.querySelector(
    '.composer-input-wrapper'
  ) as HTMLElement | null
  const toolbar = composerElement.querySelector('.composer-toolbar') as HTMLElement | null
  const parts = [inputWrapper, toolbar].filter(Boolean) as HTMLElement[]
  return (parts.length > 0 ? parts : [composerElement]).map(el => el.getBoundingClientRect())
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  step,
  onComplete,
  onSkip,
  isStepCompleted = false,
  isLoading = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<TutorialStep | null>(step)
  const heroHeightLockedRef = useRef<boolean>(false)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  const hasAttemptedElementFindRef = useRef<boolean>(false)
  const tooltipClampAttemptsRef = useRef<number>(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [highlightedElements, setHighlightedElements] = useState<HTMLElement[]>([])
  const [overlayPosition, setOverlayPosition] = useState({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  // Dynamic position for step 3 - can switch between 'top' and 'bottom' based on scroll
  const [effectivePosition, setEffectivePosition] = useState<'top' | 'bottom' | null>(null)
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

  useEffect(() => {
    return () => {
      const heroSection = document.querySelector('.hero-section') as HTMLElement
      if (heroSection) {
        heroSection.classList.remove('tutorial-height-locked')
        heroSection.style.removeProperty('height')
        heroSection.style.removeProperty('max-height')
        heroSection.style.removeProperty('min-height')
        heroSection.style.removeProperty('padding-top')
        heroSection.style.removeProperty('padding-bottom')
        heroSection.style.removeProperty('overflow')
      }
      document.documentElement.style.removeProperty('--hero-locked-height')
    }
  }, [])

  // Update step ref when step changes
  useEffect(() => {
    stepRef.current = step
    // Reset dropdown opened flag when step changes away from dropdown steps
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
      setButtonCutout(null)
    }
  }, [step])

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

  // CRITICAL FIX: Force visibility immediately for key tutorial steps
  // This ensures tooltip appears in production even if main findElement has timing issues
  useEffect(() => {
    if (step === 'expand-provider' || step === 'select-models') {
      // Force visibility immediately - tooltip should ALWAYS show for these steps
      setIsVisible(true)
      // Set a reasonable default position in case elements aren't found yet
      setOverlayPosition({ top: 320, left: window.innerWidth / 2 })
    } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
      // Force visibility for enter-prompt steps - position below the composer
      setIsVisible(true)
      // Position tooltip below the input area (around 400px from top)
      setOverlayPosition({ top: 450, left: window.innerWidth / 2 })
    }
  }, [step])

  // Lock hero section dimensions immediately when tutorial starts
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
      // CRITICAL: Also remove inline styles that were set by the height-locking effect
      // CSS !important can override inline styles, but removing them ensures no conflicts
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

  useEffect(() => {
    if (!step) {
      setTargetElement(null)
      setHighlightedElements([])
      setIsVisible(false)
      hasAttemptedElementFindRef.current = false
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
      console.warn(`No config found for tutorial step: ${step}`)
      return
    }

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
        // Calculate circular cutout for button
        if (element) {
          const rect = element.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const radius = Math.max(rect.width, rect.height) / 2 + 2 // Reduced padding
          setButtonCutout({
            top: centerY,
            left: centerX,
            radius: radius,
          })
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
        // Calculate circular cutout for button
        if (element) {
          const rect = element.getBoundingClientRect()
          const centerX = rect.left + rect.width / 2
          const centerY = rect.top + rect.height / 2
          const radius = Math.max(rect.width, rect.height) / 2 + 2 // Reduced padding
          setButtonCutout({
            top: centerY,
            left: centerX,
            radius: radius,
          })
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
      } else if (step === 'submit-comparison' || step === 'submit-comparison-2') {
        // Special handling for submit steps - highlight the Comparison Results card or loading section
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
          setIsVisible(true)
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
          console.warn(
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

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect()
      // Use viewport coordinates (not scroll coordinates) since tooltip uses position: fixed
      // This prevents page shifting

      let top = 0
      let left = 0
      const offset = 16 // Distance from target element

      // For step 3 (enter-prompt) and step 6 (enter-prompt-2), dynamically switch between top/bottom based on scroll position
      const isEnterPromptStep =
        (step === 'enter-prompt' || step === 'enter-prompt-2') && config.position === 'bottom'
      if (isEnterPromptStep) {
        const estimatedTooltipHeight = 280 // Estimated tooltip height
        const minSpaceNeeded = estimatedTooltipHeight + offset + 40 // Space needed for tooltip + margin

        // Calculate available space below the composer
        const spaceBelow = window.innerHeight - rect.bottom
        // Calculate available space above the composer
        const spaceAbove = rect.top

        // Determine which position to use:
        // - Default to 'bottom' (tooltip below composer)
        // - Switch to 'top' (tooltip above composer) if not enough space below OR if composer is too high in viewport
        const shouldUseTop = spaceBelow < minSpaceNeeded && spaceAbove >= minSpaceNeeded

        if (shouldUseTop) {
          // Position tooltip above the composer
          setEffectivePosition('top')
          top = rect.top - offset
          left = rect.left + rect.width / 2
        } else {
          // Position tooltip below the composer (default)
          setEffectivePosition('bottom')
          top = rect.bottom + offset
          left = rect.left + rect.width / 2
        }
      } else {
        // For other steps, use config position
        switch (config.position) {
          case 'bottom':
            top = rect.bottom + offset
            left = rect.left + rect.width / 2
            break
          case 'top':
            top = rect.top - offset
            left = rect.left + rect.width / 2
            break
          case 'left':
            top = rect.top + rect.height / 2
            left = rect.left - offset
            break
          case 'right':
            top = rect.top + rect.height / 2
            left = rect.right + offset
            break
        }
      }

      setOverlayPosition({ top, left })
    }

    updatePosition()

    // Use manual scrolling instead of scrollIntoView to avoid layout shifts
    const scrollToElement = () => {
      const rect = targetElement.getBoundingClientRect()
      const elementTop = rect.top + window.pageYOffset

      let scrollTarget: number

      // Special handling for step 1 (expand-provider) - ensure tooltip bubble is visible above provider
      if (step === 'expand-provider') {
        // Tooltip is positioned above the element (position: 'top')
        // Tooltip appears at: rect.top - offset (in viewport coordinates)
        // We need to ensure the tooltip doesn't go off-screen at the top

        // Estimate tooltip height (max-width 360px, typical height ~250-300px)
        const estimatedTooltipHeight = 280
        const tooltipOffset = 16 // Distance from target element
        const topMargin = 80 // Desired margin from top of viewport

        // Calculate where the element should be positioned in viewport after scroll
        // so that: tooltipTop = elementTopInViewport - tooltipOffset >= topMargin
        // Therefore: elementTopInViewport >= topMargin + tooltipOffset + tooltipHeight
        const desiredElementTopInViewport = topMargin + tooltipOffset + estimatedTooltipHeight

        // Calculate scroll position needed to achieve this
        // After scrolling, elementTopInViewport = rect.top (current) - (scrollTarget - currentScroll)
        // We want: rect.top - (scrollTarget - window.pageYOffset) = desiredElementTopInViewport
        // So: scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
        scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
      } else if (step === 'select-models') {
        // Special handling for step 2 (select-models) - ensure tooltip bubble is visible
        // Tooltip is positioned above the element (position: 'top')
        // Tooltip appears at: rect.top - offset (in viewport coordinates)
        // We need to ensure the tooltip doesn't go off-screen at the top

        // Estimate tooltip height (max-width 360px, typical height ~250-300px)
        const estimatedTooltipHeight = 280
        const tooltipOffset = 16 // Distance from target element
        const topMargin = 80 // Desired margin from top of viewport

        // Calculate where the element should be positioned in viewport after scroll
        // so that: tooltipTop = elementTopInViewport - tooltipOffset >= topMargin
        // Therefore: elementTopInViewport >= topMargin + tooltipOffset + tooltipHeight
        const desiredElementTopInViewport = topMargin + tooltipOffset + estimatedTooltipHeight

        // Calculate scroll position needed to achieve this
        // After scrolling, elementTopInViewport = rect.top (current) - (scrollTarget - currentScroll)
        // We want: rect.top - (scrollTarget - window.pageYOffset) = desiredElementTopInViewport
        // So: scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
        scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
      } else if (step === 'follow-up') {
        // Special handling for step 5 (follow-up) - ensure tooltip bubble is fully visible
        // The tooltip is positioned above the follow-up button (position: 'top')
        // We need to scroll down enough to see both the button and the tooltip above it

        // Estimate tooltip height (max-width 360px, typical height ~250-300px)
        const estimatedTooltipHeight = 280
        const tooltipOffset = 16 // Distance from target element
        const topMargin = 80 // Desired margin from top of viewport

        // Calculate where the element should be positioned in viewport after scroll
        // so that the tooltip above it is fully visible with margin from top
        const desiredElementTopInViewport = topMargin + tooltipOffset + estimatedTooltipHeight

        // Calculate scroll position needed to achieve this
        scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
      } else if (step === 'view-follow-up-results') {
        // Special handling for step 8 (view-follow-up-results) - scroll to show results section with tooltip
        // The tooltip is positioned above the results section (position: 'top')
        const estimatedTooltipHeight = 280
        const tooltipOffset = 16
        const topMargin = 80

        const desiredElementTopInViewport = topMargin + tooltipOffset + estimatedTooltipHeight
        scrollTarget = window.pageYOffset + rect.top - desiredElementTopInViewport
      } else if (step === 'enter-prompt') {
        // Special handling for step 3 (enter-prompt) - tooltip is positioned BELOW the composer (position: 'bottom')
        // We need to scroll so that both the composer and the tooltip below it are visible
        const estimatedTooltipHeight = 280 // Estimated tooltip height
        const tooltipOffset = 16 // Distance from composer to tooltip
        const bottomMargin = 40 // Desired margin from bottom of viewport

        // Calculate where the element should be positioned in viewport after scroll
        // so that: composerBottom + tooltipOffset + tooltipHeight <= viewportHeight - bottomMargin
        // Therefore: composerBottom <= viewportHeight - bottomMargin - tooltipOffset - tooltipHeight
        const desiredComposerBottomInViewport =
          window.innerHeight - bottomMargin - tooltipOffset - estimatedTooltipHeight

        // Calculate scroll position needed to achieve this
        // After scrolling, composerBottomInViewport = rect.bottom (current) - (scrollTarget - currentScroll)
        // We want: rect.bottom - (scrollTarget - window.pageYOffset) = desiredComposerBottomInViewport
        // So: scrollTarget = window.pageYOffset + rect.bottom - desiredComposerBottomInViewport
        scrollTarget = window.pageYOffset + rect.bottom - desiredComposerBottomInViewport
      } else if (step === 'enter-prompt-2') {
        // Special handling for step 6 (enter-prompt-2) - same as step 3
        // Tooltip is positioned BELOW the composer (position: 'bottom')
        // We need to scroll so that both the composer and the tooltip below it are visible
        const estimatedTooltipHeight = 280 // Estimated tooltip height
        const tooltipOffset = 16 // Distance from composer to tooltip
        const bottomMargin = 40 // Desired margin from bottom of viewport

        // Calculate where the element should be positioned in viewport after scroll
        // so that: composerBottom + tooltipOffset + tooltipHeight <= viewportHeight - bottomMargin
        // Therefore: composerBottom <= viewportHeight - bottomMargin - tooltipOffset - tooltipHeight
        const desiredComposerBottomInViewport =
          window.innerHeight - bottomMargin - tooltipOffset - estimatedTooltipHeight

        // Calculate scroll position needed to achieve this
        scrollTarget = window.pageYOffset + rect.bottom - desiredComposerBottomInViewport
      } else {
        // Default behavior: center the element in viewport
        const elementCenter = elementTop + rect.height / 2
        const viewportCenter = window.innerHeight / 2
        scrollTarget = elementCenter - viewportCenter
      }

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
        const duration = 1500 // 1.5 seconds for smooth, slow scroll
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
            requestAnimationFrame(animateScroll)
          }
        }

        requestAnimationFrame(animateScroll)
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

    // Small delay to ensure hero is locked, then scroll
    setTimeout(() => {
      scrollToElement()
      if (shouldDelayReveal) {
        waitForScrollStop(() => {
          if (stepRef.current !== step) return
          updatePosition()
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
          postScrollTimers = [t1, t2, t3]
        })
      }
    }, 100)

    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      if (scrollCheckFrame !== null) {
        window.cancelAnimationFrame(scrollCheckFrame)
      }
      postScrollTimers.forEach(t => window.clearTimeout(t))
    }
  }, [targetElement, step])

  // Add highlight class to target element(s)
  useEffect(() => {
    if (!step) return

    // Skip highlighting only for enter-prompt-2 (keep cutout for step 6)
    const shouldSkipHighlight = step === 'enter-prompt-2'
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
    } else if (step === 'enter-prompt') {
      // Highlight the textarea container for step 3
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        elementsToHighlight = [composerElement]
      }
    } else if (step === 'history-dropdown') {
      // Don't add highlight border, but ensure dropdown is not dimmed
      // The dropdown will be kept above backdrop via z-index in CSS
      elementsToHighlight = []
      // Explicitly remove highlight from results section when transitioning to step 9
      const resultsSection = document.querySelector('.results-section') as HTMLElement
      if (resultsSection) {
        resultsSection.classList.remove('tutorial-highlight')
        resultsSection.style.pointerEvents = ''
        resultsSection.style.position = ''
      }
    } else if (step === 'save-selection') {
      // Don't add highlight border, but ensure dropdown is not dimmed
      // The dropdown will be kept above backdrop via z-index in CSS
      elementsToHighlight = []
    } else if (
      step === 'submit-comparison' ||
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
      if (composerElement) {
        composerElement.classList.add('tutorial-textarea-active')
        // Calculate cutout position for backdrop mask.
        // IMPORTANT: compute using the union of the textarea wrapper + toolbar since the composer
        // can have negative margins and dynamic layout that makes a single rect less reliable.
        const padding = 8 // tighter padding for rounded cutout
        const rects = getComposerCutoutRects(composerElement)
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))

        setTextareaCutout({
          top: minTop - padding,
          left: minLeft - padding,
          width: maxRight - minLeft + padding * 2,
          height: maxBottom - minTop + padding * 2,
        })
      } else {
        setTextareaCutout(null)
      }
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
      if (historyDropdown) {
        historyDropdown.classList.add('tutorial-dropdown-active')
        // Also ensure parent container is above backdrop
        dropdownContainer = historyDropdown.closest('.composer') as HTMLElement
        if (dropdownContainer) {
          dropdownContainer.classList.add('tutorial-dropdown-container-active')
          // Calculate cutout position for backdrop mask
          const rect = dropdownContainer.getBoundingClientRect()
          // Use tighter padding for rounded cutout
          const padding = 8
          const cutout = {
            top: rect.top - padding,
            left: rect.left - padding,
            right: rect.right + padding,
            bottom: rect.bottom + padding,
          }
          setDropdownCutout({
            top: cutout.top,
            left: cutout.left,
            width: cutout.right - cutout.left,
            height: cutout.bottom - cutout.top,
          })
        }
      }
      // Don't set cutout to null if dropdown doesn't exist yet - let continuous effect handle it
      // This prevents the backdrop from rendering without a cutout before the dropdown appears
    } else if (step === 'save-selection') {
      savedSelectionsDropdown = document.querySelector('.saved-selections-dropdown') as HTMLElement
      if (savedSelectionsDropdown) {
        savedSelectionsDropdown.classList.add('tutorial-dropdown-active')
        // Also ensure parent container is above backdrop
        dropdownContainer = savedSelectionsDropdown.closest('.composer') as HTMLElement
        if (dropdownContainer) {
          dropdownContainer.classList.add('tutorial-dropdown-container-active')
          // Calculate cutout position for backdrop mask
          const rect = dropdownContainer.getBoundingClientRect()
          // Use tighter padding for rounded cutout
          const padding = 8
          const cutout = {
            top: rect.top - padding,
            left: rect.left - padding,
            right: rect.right + padding,
            bottom: rect.bottom + padding,
          }
          setDropdownCutout({
            top: cutout.top,
            left: cutout.left,
            width: cutout.right - cutout.left,
            height: cutout.bottom - cutout.top,
          })
        }
      }
      // Don't set cutout to null if dropdown doesn't exist yet - let continuous effect handle it
      // Also don't clear cutout here - let the continuous effect maintain it
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

      // Only remove highlights when step actually changes away from expand-provider, select-models, enter-prompt, submit-comparison, follow-up, view-follow-up-results, or dropdown steps
      // If we're still on these steps, keep the highlight even if elements change
      if (
        currentStep !== 'expand-provider' &&
        currentStep !== 'select-models' &&
        currentStep !== 'enter-prompt' &&
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
        // Add highlight class if not present
        if (!googleDropdown.classList.contains('tutorial-highlight')) {
          googleDropdown.classList.add('tutorial-highlight')
          googleDropdown.style.pointerEvents = 'auto'
          googleDropdown.style.position = 'relative'
        }
        // CRITICAL: Also ensure visibility, target, and position are set
        // This fixes production timing issues where main findElement fails but interval finds element
        const headerElement = googleDropdown.querySelector('.provider-header') as HTMLElement
        if (headerElement) {
          setTargetElement(headerElement)
          setIsVisible(true)
          // Calculate position with viewport bounds clamping
          const rect = headerElement.getBoundingClientRect()
          const offset = 16
          const tooltipHeight = 280 // Estimated tooltip height
          const minMargin = 20 // Minimum margin from viewport top

          // Position is 'top' for expand-provider - tooltip appears above element
          // With CSS transform: translateY(-100%), the 'top' value is where tooltip BOTTOM sits
          // So actual tooltip top = top - tooltipHeight
          // To ensure tooltip stays on screen: top - tooltipHeight >= minMargin
          // Therefore: top >= tooltipHeight + minMargin
          const minTop = tooltipHeight + minMargin
          let top = rect.top - offset

          // ROBUST FIX: Clamp position so tooltip is always visible
          if (top < minTop) {
            top = minTop
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
        // Add highlight class if not present
        if (!googleDropdown.classList.contains('tutorial-highlight')) {
          googleDropdown.classList.add('tutorial-highlight')
          googleDropdown.style.pointerEvents = 'auto'
          googleDropdown.style.position = 'relative'
        }
        // CRITICAL: Also ensure visibility, target, and position are set
        // This fixes production timing issues where main findElement fails but interval finds element
        setTargetElement(googleDropdown)
        setIsVisible(true)
        // Calculate position with viewport bounds clamping
        const rect = googleDropdown.getBoundingClientRect()
        const offset = 16
        const tooltipHeight = 280 // Estimated tooltip height
        const minMargin = 20 // Minimum margin from viewport top

        // Position is 'top' for select-models - tooltip appears above element
        // With CSS transform: translateY(-100%), the 'top' value is where tooltip BOTTOM sits
        // So actual tooltip top = top - tooltipHeight
        // To ensure tooltip stays on screen: top - tooltipHeight >= minMargin
        // Therefore: top >= tooltipHeight + minMargin
        const minTop = tooltipHeight + minMargin
        let top = rect.top - offset

        // ROBUST FIX: Clamp position so tooltip is always visible
        if (top < minTop) {
          top = minTop
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
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility, targetElement, and POSITION are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'enter-prompt') return

    // FORCE visibility immediately on mount to ensure tooltip appears
    setIsVisible(true)

    const ensureHighlightCutoutAndVisibility = () => {
      const composerElement = getComposerElement()
      if (composerElement) {
        // Always force add highlight class (remove first to ensure it's applied fresh)
        // This handles cases where the class might have been removed by other effects
        composerElement.classList.add('tutorial-highlight')
        composerElement.style.pointerEvents = 'auto'
        composerElement.style.position = 'relative'
        // Ensure textarea-active class is present
        composerElement.classList.add('tutorial-textarea-active')
        // Ensure cutout is calculated - this handles cases where initial calculation was missed
        const padding = 8
        const rects = getComposerCutoutRects(composerElement)
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))

        setTextareaCutout({
          top: minTop - padding,
          left: minLeft - padding,
          width: maxRight - minLeft + padding * 2,
          height: maxBottom - minTop + padding * 2,
        })
        // CRITICAL: Also ensure visibility, target, and POSITION are set
        // This fixes production timing issues where main findElement fails but interval finds element
        setTargetElement(composerElement)
        setIsVisible(true)

        // Calculate position with dynamic top/bottom switching based on available space
        const rect = composerElement.getBoundingClientRect()
        const offset = 16
        const estimatedTooltipHeight = 280
        const minSpaceNeeded = estimatedTooltipHeight + offset + 40

        // Calculate available space
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top

        // Determine which position to use
        const shouldUseTop = spaceBelow < minSpaceNeeded && spaceAbove >= minSpaceNeeded

        let top: number
        if (shouldUseTop) {
          setEffectivePosition('top')
          top = rect.top - offset
        } else {
          setEffectivePosition('bottom')
          top = rect.bottom + offset
        }
        const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
        setOverlayPosition({ top, left })
      } else {
        // Fallback: show tooltip at a reasonable position even if composer not found
        setIsVisible(true)
        setOverlayPosition({ top: 450, left: window.innerWidth / 2 })
      }
    }

    // Run immediately
    ensureHighlightCutoutAndVisibility()

    // Also run after a brief delay to handle any cleanup that might run after this effect
    const initialTimeout = setTimeout(ensureHighlightCutoutAndVisibility, 50)

    // Check periodically to maintain highlight, cutout, visibility, and position
    const interval = setInterval(ensureHighlightCutoutAndVisibility, 100)

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

  // Separate effect to continuously maintain cutout for enter-prompt-2 step (no highlight, but needs cutout)
  // Uses simple interval to ensure cutout is properly calculated
  // ALSO ensures visibility, targetElement, and POSITION are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'enter-prompt-2') return

    // FORCE visibility immediately on mount to ensure tooltip appears
    setIsVisible(true)

    const ensureCutoutAndVisibility = () => {
      const composerElement = getComposerElement()
      if (composerElement) {
        // Ensure textarea-active class is present
        if (!composerElement.classList.contains('tutorial-textarea-active')) {
          composerElement.classList.add('tutorial-textarea-active')
        }
        // Ensure cutout is calculated - this handles cases where initial calculation was missed
        const padding = 8
        const rects = getComposerCutoutRects(composerElement)
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))

        setTextareaCutout({
          top: minTop - padding,
          left: minLeft - padding,
          width: maxRight - minLeft + padding * 2,
          height: maxBottom - minTop + padding * 2,
        })
        // CRITICAL: Also ensure visibility, target, and POSITION are set
        // This fixes production timing issues where main findElement fails but interval finds element
        setTargetElement(composerElement)
        setIsVisible(true)

        // Calculate position with dynamic top/bottom switching based on available space (like step 3)
        const rect = composerElement.getBoundingClientRect()
        const offset = 16
        const estimatedTooltipHeight = 280
        const minSpaceNeeded = estimatedTooltipHeight + offset + 40

        // Calculate available space
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top

        // Determine which position to use
        const shouldUseTop = spaceBelow < minSpaceNeeded && spaceAbove >= minSpaceNeeded

        let top: number
        if (shouldUseTop) {
          setEffectivePosition('top')
          top = rect.top - offset
        } else {
          setEffectivePosition('bottom')
          top = rect.bottom + offset
        }
        const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
        setOverlayPosition({ top, left })
      } else {
        // Fallback: show tooltip at a reasonable position even if composer not found
        setIsVisible(true)
        setOverlayPosition({ top: 450, left: window.innerWidth / 2 })
      }
    }

    // Check immediately
    ensureCutoutAndVisibility()

    // Check periodically to maintain cutout, visibility, and position
    const interval = setInterval(ensureCutoutAndVisibility, 100)

    return () => {
      clearInterval(interval)
      // Clean up when leaving this step
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        composerElement.classList.remove('tutorial-textarea-active')
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
        const composerElement = document.querySelector('.composer') as HTMLElement
        if (composerElement) {
          if (!composerElement.classList.contains('tutorial-textarea-active')) {
            composerElement.classList.add('tutorial-textarea-active')
          }
          // Ensure cutout is calculated
          const rect = composerElement.getBoundingClientRect()
          const padding = 8
          setTextareaCutout({
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
          })
        }
      }

      // CRITICAL: Also ensure visibility and target are set
      // This fixes production timing issues where main findElement fails but interval finds element
      // For submit-comparison steps, target the submit button
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
      // Clean up textarea active class
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        composerElement.classList.remove('tutorial-textarea-active')
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
      // Update button cutout position and add highlight to button
      const historyToggleButton = document.querySelector('.history-toggle-button') as HTMLElement
      if (historyToggleButton) {
        const rect = historyToggleButton.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const radius = Math.max(rect.width, rect.height) / 2 + 2 // Reduced padding
        setButtonCutout({
          top: centerY,
          left: centerX,
          radius: radius,
        })
        // Add highlight class to the button for visual emphasis
        if (!historyToggleButton.classList.contains('tutorial-highlight')) {
          historyToggleButton.classList.add('tutorial-highlight')
        }
        // CRITICAL: Also ensure visibility and target are set
        // This fixes production timing issues where main findElement fails but interval finds element
        setTargetElement(historyToggleButton)
        setIsVisible(true)
      }

      // Always set composer cutout from the start (not just when dropdown opens)
      // This highlights the compose section along with the button
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (green border)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        // Always update cutout for composer section
        const rect = composerElement.getBoundingClientRect()
        const padding = 8
        setDropdownCutout({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.right - rect.left + padding * 2,
          height: rect.bottom - rect.top + padding * 2,
        })
      }

      const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
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
      setButtonCutout(null)
    }
  }, [step])

  // Separate effect to continuously maintain dropdown active class for save-selection step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  // ALSO ensures visibility and targetElement are set (fixes production timing issues)
  useEffect(() => {
    if (step !== 'save-selection') return

    // Listen for clicks on the saved selections button to mark dropdown as opened
    const savedSelectionsButton = document.querySelector('.saved-selections-button') as HTMLElement
    const handleSavedSelectionsButtonClick = () => {
      dropdownWasOpenedRef.current = true
    }
    if (savedSelectionsButton) {
      savedSelectionsButton.addEventListener('click', handleSavedSelectionsButtonClick)
    }

    const ensureDropdownActiveAndVisibility = () => {
      // Update button cutout position and add highlight to button
      const savedSelectionsButton = document.querySelector(
        '.saved-selections-button'
      ) as HTMLElement
      if (savedSelectionsButton) {
        const rect = savedSelectionsButton.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const radius = Math.max(rect.width, rect.height) / 2 + 2 // Reduced padding
        setButtonCutout({
          top: centerY,
          left: centerX,
          radius: radius,
        })
        // Add highlight class to the button for visual emphasis
        if (!savedSelectionsButton.classList.contains('tutorial-highlight')) {
          savedSelectionsButton.classList.add('tutorial-highlight')
        }
        // CRITICAL: Also ensure visibility and target are set
        // This fixes production timing issues where main findElement fails but interval finds element
        setTargetElement(savedSelectionsButton)
        setIsVisible(true)
      }

      // Always set composer cutout from the start (not just when dropdown opens)
      // This highlights the compose section along with the button
      const composerElement = document.querySelector('.composer') as HTMLElement
      if (composerElement) {
        if (!composerElement.classList.contains('tutorial-dropdown-container-active')) {
          composerElement.classList.add('tutorial-dropdown-container-active')
        }
        // Add highlight class to the composer for visual emphasis (green border)
        if (!composerElement.classList.contains('tutorial-highlight')) {
          composerElement.classList.add('tutorial-highlight')
        }
        // Always update cutout for composer section
        const rect = composerElement.getBoundingClientRect()
        const padding = 8
        setDropdownCutout({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.right - rect.left + padding * 2,
          height: rect.bottom - rect.top + padding * 2,
        })
      }

      const savedSelectionsDropdown = document.querySelector(
        '.saved-selections-dropdown'
      ) as HTMLElement
      if (savedSelectionsDropdown) {
        // Mark that dropdown was opened
        dropdownWasOpenedRef.current = true
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
      // Clean up on unmount
      if (savedSelectionsButton) {
        savedSelectionsButton.removeEventListener('click', handleSavedSelectionsButtonClick)
      }
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
      setButtonCutout(null)
    }
  }, [step])

  // Update textarea cutout position on scroll/resize for textarea-related steps
  // NOTE: This hook must be called before any early returns to comply with Rules of Hooks
  useEffect(() => {
    const shouldExcludeTextarea =
      step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison-2'
    if (!shouldExcludeTextarea) return

    const updateTextareaCutout = () => {
      const composerElement = getComposerElement()
      if (composerElement) {
        const padding = 8
        const rects = getComposerCutoutRects(composerElement)
        const minTop = Math.min(...rects.map(r => r.top))
        const minLeft = Math.min(...rects.map(r => r.left))
        const maxRight = Math.max(...rects.map(r => r.right))
        const maxBottom = Math.max(...rects.map(r => r.bottom))

        setTextareaCutout({
          top: minTop - padding,
          left: minLeft - padding,
          width: maxRight - minLeft + padding * 2,
          height: maxBottom - minTop + padding * 2,
        })
      } else {
        setTextareaCutout(null)
      }
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

  // Update dropdown cutout position on scroll/resize for dropdown-related steps
  useEffect(() => {
    const shouldExcludeDropdown = step === 'history-dropdown' || step === 'save-selection'
    if (!shouldExcludeDropdown) return

    const updateDropdownCutout = () => {
      let dropdownContainer: HTMLElement | null = null
      if (step === 'history-dropdown') {
        const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
        if (historyDropdown) {
          dropdownContainer = historyDropdown.closest('.composer') as HTMLElement
        }
      } else if (step === 'save-selection') {
        const savedSelectionsDropdown = document.querySelector(
          '.saved-selections-dropdown'
        ) as HTMLElement
        if (savedSelectionsDropdown) {
          dropdownContainer = savedSelectionsDropdown.closest('.composer') as HTMLElement
        }
      }

      if (dropdownContainer) {
        const rect = dropdownContainer.getBoundingClientRect()
        // Use tighter padding for rounded cutout
        const padding = 8
        const cutout = {
          top: rect.top - padding,
          left: rect.left - padding,
          right: rect.right + padding,
          bottom: rect.bottom + padding,
        }
        setDropdownCutout({
          top: cutout.top,
          left: cutout.left,
          width: cutout.right - cutout.left,
          height: cutout.bottom - cutout.top,
        })
      }
      // Don't set to null if dropdown doesn't exist - it might appear later
      // The continuous effect will handle setting it when it appears
    }

    // Update immediately
    updateDropdownCutout()

    // Update on scroll/resize
    window.addEventListener('scroll', updateDropdownCutout, true)
    window.addEventListener('resize', updateDropdownCutout)

    return () => {
      window.removeEventListener('scroll', updateDropdownCutout, true)
      window.removeEventListener('resize', updateDropdownCutout)
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
        // For submit steps, always use the textarea container
        const composerElement = document.querySelector('.composer') as HTMLElement
        if (composerElement) {
          elementsToUse = [composerElement]
        }
      } else {
        // Use highlighted elements if available, otherwise use targetElement
        elementsToUse =
          highlightedElements.length > 0
            ? highlightedElements
            : targetElement
              ? [targetElement]
              : []
      }

      if (elementsToUse.length === 0) {
        setTargetCutout(null)
        return
      }

      // Calculate bounding box that encompasses all highlighted elements
      let minTop = Infinity
      let minLeft = Infinity
      let maxRight = -Infinity
      let maxBottom = -Infinity

      elementsToUse.forEach(element => {
        const rect = element.getBoundingClientRect()
        minTop = Math.min(minTop, rect.top)
        minLeft = Math.min(minLeft, rect.left)
        maxRight = Math.max(maxRight, rect.right)
        maxBottom = Math.max(maxBottom, rect.bottom)
      })

      if (minTop === Infinity) {
        setTargetCutout(null)
        return
      }

      const padding = 8 // Padding around the cutout
      // Use larger border-radius for results section and textarea, smaller for buttons/dropdowns
      const borderRadius = step === 'view-follow-up-results' ? 16 : isSubmitStep ? 32 : 12

      setTargetCutout({
        top: minTop - padding,
        left: minLeft - padding,
        width: maxRight - minLeft + padding * 2,
        height: maxBottom - minTop + padding * 2,
        borderRadius,
      })
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

  // Check if we're in loading/streaming phase on submit-comparison step
  // This needs to be calculated before the early return so we can allow rendering during this phase
  const isSubmitStep = step === 'submit-comparison' || step === 'submit-comparison-2'
  const isLoadingStreamingPhase = isSubmitStep && isLoading && loadingStreamingCutout

  // During loading/streaming phase, we only need loadingStreamingCutout to render the backdrop
  // We don't need targetElement since we hide the tooltip anyway
  if (!step) {
    return null
  }

  // In production builds, element finding might fail or be delayed due to:
  // - Code splitting/chunk loading timing
  // - CSS loading timing
  // - DOM rendering differences
  // - Minification affecting querySelector behavior
  // CRITICAL FIX: Allow rendering during initial element finding phase
  // The findElement effect will find the element and update visibility/position
  // This prevents tooltips from never appearing in production due to timing issues
  if (!isLoadingStreamingPhase) {
    // Allow rendering if:
    // 1. We have visibility set to true, OR
    // 2. We haven't attempted element finding yet (initial render), OR
    // 3. We have a targetElement (element was found)
    // Only block if we've attempted finding AND visibility is explicitly false AND no element
    const shouldBlock = hasAttemptedElementFindRef.current && !isVisible && !targetElement

    if (shouldBlock) {
      return null
    }
  }

  const config = TUTORIAL_STEPS_CONFIG[step]
  const stepIndex = Object.keys(TUTORIAL_STEPS_CONFIG).indexOf(step) + 1
  const totalSteps = Object.keys(TUTORIAL_STEPS_CONFIG).length

  const shouldExcludeTextarea =
    step === 'enter-prompt' ||
    step === 'submit-comparison' ||
    step === 'submit-comparison-2' ||
    step === 'enter-prompt-2'
  const shouldExcludeDropdown = step === 'history-dropdown' || step === 'save-selection'

  // Use rounded box-shadow cutout for all textarea-related steps (but not during loading/streaming phase)
  const useRoundedCutout =
    (step === 'enter-prompt' ||
      step === 'submit-comparison' ||
      step === 'enter-prompt-2' ||
      step === 'submit-comparison-2') &&
    !isLoadingStreamingPhase

  // For submit steps, use textareaCutout if available, otherwise use targetCutout as fallback
  const textareaCutoutToUse = textareaCutout || (isSubmitStep ? targetCutout : null)

  const overlayUi = (
    <>
      {/* Backdrop - loading/streaming cutout takes priority during submit steps */}
      {isLoadingStreamingPhase ? (
        <div
          className="tutorial-backdrop-cutout"
          style={{
            position: 'fixed',
            top: `${loadingStreamingCutout.top}px`,
            left: `${loadingStreamingCutout.left}px`,
            width: `${loadingStreamingCutout.width}px`,
            height: `${loadingStreamingCutout.height}px`,
            borderRadius: '16px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.classList.contains('tutorial-backdrop-cutout')) {
              e.stopPropagation()
            }
          }}
        />
      ) : useRoundedCutout && textareaCutoutToUse ? (
        <div
          className="tutorial-backdrop-cutout"
          style={{
            position: 'fixed',
            top: `${textareaCutoutToUse.top}px`,
            left: `${textareaCutoutToUse.left}px`,
            width: `${textareaCutoutToUse.width}px`,
            height: `${textareaCutoutToUse.height}px`,
            // Border-radius: textarea has 1.5rem (24px), cutout is 8px from element edge, so radius = 24px + 8px = 32px
            borderRadius: '32px',
            // Use huge box-shadow to create the dim overlay effect around the cutout
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.classList.contains('tutorial-backdrop-cutout')) {
              e.stopPropagation()
            }
          }}
        />
      ) : shouldExcludeTextarea && textareaCutoutToUse ? (
        <>
          {/* Top backdrop section */}
          <div
            className="tutorial-backdrop tutorial-backdrop-top"
            style={{
              height: `${textareaCutoutToUse.top}px`,
            }}
            onClick={e => {
              const target = e.target as HTMLElement
              if (target.classList.contains('tutorial-backdrop')) {
                e.stopPropagation()
              }
            }}
          />
          {/* Bottom backdrop section */}
          <div
            className="tutorial-backdrop tutorial-backdrop-bottom"
            style={{
              top: `${textareaCutoutToUse.top + textareaCutoutToUse.height}px`,
            }}
            onClick={e => {
              const target = e.target as HTMLElement
              if (target.classList.contains('tutorial-backdrop')) {
                e.stopPropagation()
              }
            }}
          />
          {/* Left backdrop section */}
          <div
            className="tutorial-backdrop tutorial-backdrop-left"
            style={{
              top: `${textareaCutoutToUse.top}px`,
              left: '0',
              width: `${textareaCutoutToUse.left}px`,
              height: `${textareaCutoutToUse.height}px`,
            }}
            onClick={e => {
              const target = e.target as HTMLElement
              if (target.classList.contains('tutorial-backdrop')) {
                e.stopPropagation()
              }
            }}
          />
          {/* Right backdrop section */}
          <div
            className="tutorial-backdrop tutorial-backdrop-right"
            style={{
              top: `${textareaCutoutToUse.top}px`,
              left: `${textareaCutoutToUse.left + textareaCutoutToUse.width}px`,
              height: `${textareaCutoutToUse.height}px`,
            }}
            onClick={e => {
              const target = e.target as HTMLElement
              if (target.classList.contains('tutorial-backdrop')) {
                e.stopPropagation()
              }
            }}
          />
        </>
      ) : shouldExcludeDropdown && dropdownCutout ? (
        <div
          className="tutorial-backdrop-cutout"
          style={{
            position: 'fixed',
            top: `${dropdownCutout.top}px`,
            left: `${dropdownCutout.left}px`,
            width: `${dropdownCutout.width}px`,
            height: `${dropdownCutout.height}px`,
            // Border-radius: textarea container has 1.5rem (24px), cutout is 8px from element edge, so radius = 24px + 8px = 32px
            borderRadius: '32px',
            // Use huge box-shadow to create the dim overlay effect around the cutout
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.classList.contains('tutorial-backdrop-cutout')) {
              e.stopPropagation()
            }
          }}
        />
      ) : targetCutout ? (
        <div
          className="tutorial-backdrop-cutout"
          style={{
            position: 'fixed',
            top: `${targetCutout.top}px`,
            left: `${targetCutout.left}px`,
            width: `${targetCutout.width}px`,
            height: `${targetCutout.height}px`,
            borderRadius: `${targetCutout.borderRadius}px`,
            // Use huge box-shadow to create the dim overlay effect around the cutout
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            zIndex: 9998,
            pointerEvents: 'none',
          }}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.classList.contains('tutorial-backdrop-cutout')) {
              e.stopPropagation()
            }
          }}
        />
      ) : (
        <div
          className="tutorial-backdrop"
          style={
            buttonCutout
              ? {
                  maskImage: `radial-gradient(circle ${buttonCutout.radius + 1}px at ${buttonCutout.left}px ${buttonCutout.top}px, transparent ${buttonCutout.radius}px, black ${buttonCutout.radius + 1}px)`,
                  WebkitMaskImage: `radial-gradient(circle ${buttonCutout.radius + 1}px at ${buttonCutout.left}px ${buttonCutout.top}px, transparent ${buttonCutout.radius}px, black ${buttonCutout.radius + 1}px)`,
                }
              : undefined
          }
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.classList.contains('tutorial-backdrop')) {
              e.stopPropagation()
            }
          }}
        />
      )}

      {/* Tooltip bubble - hidden during loading/streaming phase on submit steps.
          Also gate on isVisible so steps that require scrolling/layout settle (e.g. enter-prompt)
          don't render a mis-positioned tooltip while the page is moving. */}
      {!isLoadingStreamingPhase && isVisible && (
        <div
          ref={overlayRef}
          className={`tutorial-tooltip tutorial-tooltip-${(step === 'enter-prompt' || step === 'enter-prompt-2') && effectivePosition ? effectivePosition : config.position}`}
          style={{
            top: `${overlayPosition.top}px`,
            left: `${overlayPosition.left}px`,
            // Ensure z-index is high enough to appear above other elements
            zIndex: 10000,
            // Add smooth transition for position changes (step 3 and step 6)
            transition:
              step === 'enter-prompt' || step === 'enter-prompt-2'
                ? 'top 0.3s ease-in-out, transform 0.3s ease-in-out'
                : undefined,
          }}
        >
          <div className="tutorial-tooltip-content">
            <div className="tutorial-tooltip-header">
              <span className="tutorial-step-indicator">
                Step {stepIndex} of {totalSteps}
              </span>
              <button className="tutorial-close-button" onClick={onSkip} aria-label="Skip tutorial">
                ×
              </button>
            </div>
            <h3 className="tutorial-tooltip-title">{config.title}</h3>
            <p className="tutorial-tooltip-description">{config.description}</p>
            <div className="tutorial-tooltip-actions">
              {/* Show "Done with input" button for step 3 (enter-prompt) and step 6 (enter-prompt-2) */}
              {(step === 'enter-prompt' || step === 'enter-prompt-2') && (
                <button
                  className="tutorial-button tutorial-button-primary"
                  onClick={onComplete}
                  disabled={!isStepCompleted}
                  title={!isStepCompleted ? 'Enter at least 1 character to continue' : undefined}
                >
                  Done with input
                </button>
              )}
              {/* Show "Done" button for step 8 (view-follow-up-results) - always enabled */}
              {step === 'view-follow-up-results' && (
                <button
                  className="tutorial-button tutorial-button-primary"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    onComplete()
                  }}
                >
                  Done
                </button>
              )}
              {/* Show "Done" button for step 9 (history-dropdown) - enabled when dropdown is open */}
              {step === 'history-dropdown' && (
                <button
                  className="tutorial-button tutorial-button-primary"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    // Always call onComplete - handleComplete will check if dropdown was opened
                    onComplete()
                  }}
                  disabled={!dropdownWasOpenedRef.current}
                  title={
                    !dropdownWasOpenedRef.current
                      ? 'Open the history dropdown to continue'
                      : 'Continue to next step'
                  }
                >
                  Done
                </button>
              )}
              {/* Show "Done" button for step 10 (save-selection) - enabled when dropdown is open */}
              {step === 'save-selection' && (
                <button
                  className="tutorial-button tutorial-button-primary"
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    // Always call onComplete - handleComplete will check if dropdown was opened
                    onComplete()
                  }}
                  disabled={!dropdownWasOpenedRef.current}
                  title={
                    !dropdownWasOpenedRef.current
                      ? 'Open the saved selections dropdown to continue'
                      : 'Complete the tutorial'
                  }
                >
                  Done
                </button>
              )}
            </div>
          </div>
          {/* Arrow pointing to target */}
          <div
            className={`tutorial-arrow tutorial-arrow-${(step === 'enter-prompt' || step === 'enter-prompt-2') && effectivePosition ? effectivePosition : config.position}`}
          />
        </div>
      )}
    </>
  )

  return portalRoot ? createPortal(overlayUi, portalRoot) : overlayUi
}
