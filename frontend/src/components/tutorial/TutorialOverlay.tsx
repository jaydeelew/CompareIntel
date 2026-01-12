import React, { useEffect, useRef, useState } from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'

import { TUTORIAL_STEPS_CONFIG } from './tutorialSteps'
import './TutorialOverlay.css'

interface TutorialOverlayProps {
  step: TutorialStep | null
  onComplete: () => void
  onSkip: () => void
  isStepCompleted?: boolean
}

interface HTMLElementWithTutorialProps extends HTMLElement {
  __tutorialHeightObserver?: MutationObserver
  __tutorialHeightInterval?: number
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  step,
  onComplete,
  onSkip,
  isStepCompleted = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<TutorialStep | null>(step)
  const heroHeightLockedRef = useRef<boolean>(false)
  const dropdownWasOpenedRef = useRef<boolean>(false)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [highlightedElements, setHighlightedElements] = useState<HTMLElement[]>([])
  const [overlayPosition, setOverlayPosition] = useState({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(false)
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

  // Update step ref when step changes
  useEffect(() => {
    stepRef.current = step
    // Reset dropdown opened flag when step changes away from dropdown steps
    if (step !== 'history-dropdown' && step !== 'save-selection') {
      dropdownWasOpenedRef.current = false
      setButtonCutout(null)
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

    // Lock hero section dimensions if not already locked
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

  useEffect(() => {
    if (!step) {
      setTargetElement(null)
      setHighlightedElements([])
      setIsVisible(false)
      // Clean up any remaining tutorial classes when tutorial ends
      const textareaContainerActive = document.querySelector(
        '.textarea-container.tutorial-textarea-active'
      ) as HTMLElement
      if (textareaContainerActive) {
        textareaContainerActive.classList.remove('tutorial-textarea-active')
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
        '.textarea-container.tutorial-dropdown-container-active'
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
        element = document.querySelector('.textarea-container') as HTMLElement
        if (!element) {
          // Fallback: try to find by testid and get parent container
          const textarea = document.querySelector(
            '[data-testid="comparison-input-textarea"]'
          ) as HTMLElement
          if (textarea) {
            element = textarea.closest('.textarea-container') as HTMLElement
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
      } else {
        // Use default selector for other steps
        element = document.querySelector(config.targetSelector) as HTMLElement
        setHighlightedElements([]) // Clear highlights for all other steps
      }

      if (element) {
        // For textarea container, check if it's visible (might be in viewport)
        const isVisible =
          element.offsetParent !== null || (element.offsetWidth > 0 && element.offsetHeight > 0)

        if (isVisible) {
          setTargetElement(element)
          setIsVisible(true)
          return true
        }
      }
      return false
    }

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
          // Still try to show the overlay even if element not found (for debugging)
          setIsVisible(true)
        }
      }

      const timeout = setTimeout(tryFind, attemptDelay)
      return () => clearTimeout(timeout)
    }
  }, [step])

  useEffect(() => {
    if (!targetElement || !step) return

    const config = TUTORIAL_STEPS_CONFIG[step]

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect()
      // Use viewport coordinates (not scroll coordinates) since tooltip uses position: fixed
      // This prevents page shifting

      let top = 0
      let left = 0
      const offset = 16 // Distance from target element

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

      setOverlayPosition({ top, left })
    }

    updatePosition()

    // Use manual scrolling instead of scrollIntoView to avoid layout shifts
    const scrollToElement = () => {
      const rect = targetElement.getBoundingClientRect()
      const elementTop = rect.top + window.pageYOffset

      let scrollTarget: number

      // Special handling for step 2 (select-models) - ensure tooltip bubble is visible
      if (step === 'select-models') {
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
      } else {
        // Default behavior: center the element in viewport
        const elementCenter = elementTop + rect.height / 2
        const viewportCenter = window.innerHeight / 2
        scrollTarget = elementCenter - viewportCenter
      }

      // Scroll smoothly without affecting hero section layout
      window.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth',
        left: window.pageXOffset, // Keep horizontal position
      })
    }

    // Small delay to ensure hero is locked, then scroll
    setTimeout(() => {
      scrollToElement()
    }, 100)

    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
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
      const textareaContainer = document.querySelector('.textarea-container') as HTMLElement
      if (textareaContainer) {
        elementsToHighlight = [textareaContainer]
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
    let textareaContainer: HTMLElement | null = null
    if (shouldExcludeTextarea) {
      textareaContainer = document.querySelector('.textarea-container') as HTMLElement
      if (textareaContainer) {
        textareaContainer.classList.add('tutorial-textarea-active')
        // Calculate cutout position for backdrop mask
        const rect = textareaContainer.getBoundingClientRect()
        // For all textarea-related steps with rounded cutout, use tighter padding (outline 3px + offset 4px = 7px + 1px buffer)
        const padding = 8
        const cutout = {
          top: rect.top - padding,
          left: rect.left - padding,
          right: rect.right + padding,
          bottom: rect.bottom + padding,
        }
        setTextareaCutout({
          top: cutout.top,
          left: cutout.left,
          width: cutout.right - cutout.left,
          height: cutout.bottom - cutout.top,
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
        dropdownContainer = historyDropdown.closest('.textarea-container') as HTMLElement
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
        dropdownContainer = savedSelectionsDropdown.closest('.textarea-container') as HTMLElement
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
        const textareaContainer = document.querySelector('.textarea-container') as HTMLElement
        if (textareaContainer) {
          textareaContainer.classList.remove('tutorial-highlight')
          textareaContainer.style.pointerEvents = ''
          textareaContainer.style.position = ''
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
          '.textarea-container.tutorial-dropdown-container-active'
        ) as HTMLElement
        if (dropdownContainerActive) {
          dropdownContainerActive.classList.remove('tutorial-dropdown-container-active')
        }
        const textareaContainerActive = document.querySelector(
          '.textarea-container.tutorial-textarea-active'
        ) as HTMLElement
        if (textareaContainerActive) {
          textareaContainerActive.classList.remove('tutorial-textarea-active')
        }
        setTextareaCutout(null)
      }
      // If we're still on expand-provider, select-models, enter-prompt, submit-comparison, or dropdown steps, don't clean up - keep the highlight
    }
  }, [step]) // Only depend on step, not targetElement or highlightedElements, to prevent unnecessary re-runs

  // Separate effect to continuously maintain highlight for expand-provider step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  useEffect(() => {
    if (step !== 'expand-provider') return

    const ensureHighlight = () => {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown && !googleDropdown.classList.contains('tutorial-highlight')) {
        googleDropdown.classList.add('tutorial-highlight')
        googleDropdown.style.pointerEvents = 'auto'
        googleDropdown.style.position = 'relative'
      }
    }

    // Check immediately
    ensureHighlight()

    // Check periodically to maintain highlight
    const interval = setInterval(ensureHighlight, 200)

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
  useEffect(() => {
    if (step !== 'select-models') return

    const ensureHighlight = () => {
      const googleDropdown = document.querySelector(
        '.provider-dropdown[data-provider-name="Google"]'
      ) as HTMLElement
      if (googleDropdown && !googleDropdown.classList.contains('tutorial-highlight')) {
        googleDropdown.classList.add('tutorial-highlight')
        googleDropdown.style.pointerEvents = 'auto'
        googleDropdown.style.position = 'relative'
      }
    }

    // Check immediately
    ensureHighlight()

    // Check periodically to maintain highlight
    const interval = setInterval(ensureHighlight, 200)

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

  // Separate effect to continuously maintain highlight for enter-prompt step
  // Uses simple interval instead of MutationObserver to avoid performance issues
  useEffect(() => {
    if (step !== 'enter-prompt') return

    const ensureHighlight = () => {
      const textareaContainer = document.querySelector('.textarea-container') as HTMLElement
      if (textareaContainer && !textareaContainer.classList.contains('tutorial-highlight')) {
        textareaContainer.classList.add('tutorial-highlight')
        textareaContainer.style.pointerEvents = 'auto'
        textareaContainer.style.position = 'relative'
      }
    }

    // Check immediately
    ensureHighlight()

    // Check periodically to maintain highlight
    const interval = setInterval(ensureHighlight, 200)

    return () => {
      clearInterval(interval)
      // Clean up highlight when leaving this step
      const textareaContainer = document.querySelector('.textarea-container') as HTMLElement
      if (textareaContainer) {
        textareaContainer.classList.remove('tutorial-highlight')
        textareaContainer.style.pointerEvents = ''
        textareaContainer.style.position = ''
      }
    }
  }, [step])

  // Separate effect to continuously maintain highlight for submit-comparison, follow-up, and view-follow-up-results steps
  // Uses simple interval instead of MutationObserver to avoid performance issues
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

    const ensureHighlight = () => {
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
    }

    // Check immediately
    ensureHighlight()

    // Check periodically to maintain highlight
    const interval = setInterval(ensureHighlight, 200)

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
    }
  }, [step])

  // Separate effect to continuously maintain dropdown active class for history-dropdown step
  // This ensures the dropdown stays above backdrop even if the DOM updates
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

    const ensureDropdownActive = () => {
      // Update button cutout position
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
      }

      const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
      if (historyDropdown) {
        // Mark that dropdown was opened
        dropdownWasOpenedRef.current = true
        if (!historyDropdown.classList.contains('tutorial-dropdown-active')) {
          historyDropdown.classList.add('tutorial-dropdown-active')
        }
        // Also ensure parent container is above backdrop
        const textareaContainer = historyDropdown.closest('.textarea-container') as HTMLElement
        if (textareaContainer) {
          if (!textareaContainer.classList.contains('tutorial-dropdown-container-active')) {
            textareaContainer.classList.add('tutorial-dropdown-container-active')
          }
          // Update cutout - always recalculate to ensure it's current
          const rect = textareaContainer.getBoundingClientRect()
          // Use tighter padding for rounded cutout
          const padding = 8
          setDropdownCutout({
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.right - rect.left + padding * 2,
            height: rect.bottom - rect.top + padding * 2,
          })
        }
      } else {
        // If dropdown was previously opened but is now closed, clear the dropdown cutout
        // Keep button cutout visible
        if (dropdownWasOpenedRef.current) {
          setDropdownCutout(null)
        }
        // If dropdown doesn't exist yet and hasn't been opened, don't set cutout to null - wait for it to appear
      }
    }

    // Check immediately
    ensureDropdownActive()

    // Check periodically to maintain dropdown state (no MutationObserver to avoid performance issues)
    const interval = setInterval(ensureDropdownActive, 100)

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
      const textareaContainer = document.querySelector(
        '.textarea-container.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (textareaContainer) {
        textareaContainer.classList.remove('tutorial-dropdown-container-active')
      }
      setDropdownCutout(null)
      setButtonCutout(null)
    }
  }, [step])

  // Separate effect to continuously maintain dropdown active class for save-selection step
  // Uses simple interval instead of MutationObserver to avoid performance issues
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

    const ensureDropdownActive = () => {
      // Update button cutout position (no highlight, just cutout)
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
        // Also ensure parent container is above backdrop
        const textareaContainer = savedSelectionsDropdown.closest(
          '.textarea-container'
        ) as HTMLElement
        if (textareaContainer) {
          if (!textareaContainer.classList.contains('tutorial-dropdown-container-active')) {
            textareaContainer.classList.add('tutorial-dropdown-container-active')
          }
          // Update cutout
          const rect = textareaContainer.getBoundingClientRect()
          // Use tighter padding for rounded cutout
          const padding = 8
          setDropdownCutout({
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.right - rect.left + padding * 2,
            height: rect.bottom - rect.top + padding * 2,
          })
        }
      } else {
        // If dropdown was previously opened but is now closed, clear the dropdown cutout
        // Keep button cutout visible
        if (dropdownWasOpenedRef.current) {
          setDropdownCutout(null)
        }
      }
    }

    // Check immediately
    ensureDropdownActive()

    // Check periodically to maintain dropdown state (no MutationObserver to avoid performance issues)
    const interval = setInterval(ensureDropdownActive, 100)

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
      const textareaContainer = document.querySelector(
        '.textarea-container.tutorial-dropdown-container-active'
      ) as HTMLElement
      if (textareaContainer) {
        textareaContainer.classList.remove('tutorial-dropdown-container-active')
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
      const textareaContainer = document.querySelector('.textarea-container') as HTMLElement
      if (textareaContainer) {
        const rect = textareaContainer.getBoundingClientRect()
        // For all textarea-related steps with rounded cutout, use tighter padding (outline 3px + offset 4px = 7px + 1px buffer)
        const padding = 8
        const cutout = {
          top: rect.top - padding,
          left: rect.left - padding,
          right: rect.right + padding,
          bottom: rect.bottom + padding,
        }
        setTextareaCutout({
          top: cutout.top,
          left: cutout.left,
          width: cutout.right - cutout.left,
          height: cutout.bottom - cutout.top,
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
          dropdownContainer = historyDropdown.closest('.textarea-container') as HTMLElement
        }
      } else if (step === 'save-selection') {
        const savedSelectionsDropdown = document.querySelector(
          '.saved-selections-dropdown'
        ) as HTMLElement
        if (savedSelectionsDropdown) {
          dropdownContainer = savedSelectionsDropdown.closest('.textarea-container') as HTMLElement
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

  if (!step || !targetElement || !isVisible) {
    return null
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

  // Use rounded box-shadow cutout for all textarea-related steps
  const useRoundedCutout =
    step === 'enter-prompt' ||
    step === 'submit-comparison' ||
    step === 'enter-prompt-2' ||
    step === 'submit-comparison-2'

  return (
    <>
      {/* Backdrop - use box-shadow technique for rounded cutout on textarea-related steps */}
      {useRoundedCutout && textareaCutout ? (
        <div
          className="tutorial-backdrop-cutout"
          style={{
            position: 'fixed',
            top: `${textareaCutout.top}px`,
            left: `${textareaCutout.left}px`,
            width: `${textareaCutout.width}px`,
            height: `${textareaCutout.height}px`,
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
      ) : shouldExcludeTextarea && textareaCutout ? (
        <>
          {/* Top backdrop section */}
          <div
            className="tutorial-backdrop tutorial-backdrop-top"
            style={{
              height: `${textareaCutout.top}px`,
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
              top: `${textareaCutout.top + textareaCutout.height}px`,
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
              top: `${textareaCutout.top}px`,
              left: '0',
              width: `${textareaCutout.left}px`,
              height: `${textareaCutout.height}px`,
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
              top: `${textareaCutout.top}px`,
              left: `${textareaCutout.left + textareaCutout.width}px`,
              height: `${textareaCutout.height}px`,
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

      {/* Tooltip bubble */}
      <div
        ref={overlayRef}
        className={`tutorial-tooltip tutorial-tooltip-${config.position}`}
        style={{
          top: `${overlayPosition.top}px`,
          left: `${overlayPosition.left}px`,
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
        <div className={`tutorial-arrow tutorial-arrow-${config.position}`} />
      </div>
    </>
  )
}
