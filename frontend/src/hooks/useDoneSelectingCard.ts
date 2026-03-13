import { useState, useEffect, useCallback, type RefObject } from 'react'

interface UseDoneSelectingCardProps {
  selectedModelsCount: number
  isModelsHidden: boolean
  isFollowUpMode: boolean
  modelsSectionRef: RefObject<HTMLDivElement>
  tutorialIsActive: boolean
}

interface UseDoneSelectingCardCallbacks {
  onCollapseAllDropdowns: () => void
  onSetIsModelsHidden: (hidden: boolean) => void
  onFocusTextarea: () => void
}

interface UseDoneSelectingCardReturn {
  showDoneSelectingCard: boolean
  setShowDoneSelectingCard: React.Dispatch<React.SetStateAction<boolean>>
  handleDoneSelecting: () => void
}

/**
 * Hook to manage the "Done Selecting?" floating card visibility and behavior.
 *
 * Handles:
 * - Mouse position tracking over models section
 * - Auto-show when scrolled near bottom
 * - Hide when no models selected, in follow-up mode, or models section collapsed
 * - Done button click handler
 */
export function useDoneSelectingCard(
  props: UseDoneSelectingCardProps,
  callbacks: UseDoneSelectingCardCallbacks
): UseDoneSelectingCardReturn {
  const {
    selectedModelsCount,
    isModelsHidden,
    isFollowUpMode,
    modelsSectionRef,
    tutorialIsActive,
  } = props

  const { onCollapseAllDropdowns, onSetIsModelsHidden, onFocusTextarea } = callbacks

  const [showDoneSelectingCard, setShowDoneSelectingCard] = useState(false)

  // Track mouse position over models section with throttling for better performance
  useEffect(() => {
    let rafId: number | null = null
    let scrollRafId: number | null = null
    let lastShowState = false
    let lastMouseY = 0
    let lastMouseX = 0
    let keepVisibleTimeout: number | null = null
    let isKeepingVisible = false
    let previousIsOver = false

    const checkCardVisibility = (mouseY: number, mouseX: number, fromScroll: boolean = false) => {
      if (!modelsSectionRef.current) return

      const rect = modelsSectionRef.current.getBoundingClientRect()

      // Check if mouse is over the section
      const isOver =
        mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right

      // Detect transition from "over section" to "not over section"
      const justLeftSection = previousIsOver && !isOver
      if (!fromScroll) {
        previousIsOver = isOver
      }

      // Check if card is positioned below the models section
      // Card is at 80% of viewport height (top: 80%), so card center is at 80% of viewport
      const cardCenterY = window.innerHeight * 0.8
      const cardHeight = 150 // Approximate height of the card
      const cardTop = cardCenterY - cardHeight / 2
      const isCardBelowSection = cardTop > rect.bottom

      // Check if page is scrolled near the bottom
      // Consider "near bottom" if we're within 500px of the bottom or if scroll position
      // is close to the maximum scroll (accounting for viewport height)
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight
      const viewportHeight = window.innerHeight
      const distanceFromBottom = scrollHeight - (scrollTop + viewportHeight)
      // More lenient: within 500px of bottom, at least 80% scrolled, or in bottom 30% of page
      const scrollPercentage = (scrollTop + viewportHeight) / scrollHeight
      const isNearBottom =
        distanceFromBottom < 500 ||
        scrollPercentage >= 0.8 ||
        scrollTop + viewportHeight >= scrollHeight - 200 ||
        scrollPercentage >= 0.7

      // Check if models section is visible (any part of it is in the viewport)
      const isSectionVisible = rect.top < viewportHeight && rect.bottom > 0
      // When scrolled near bottom, if section is visible, consider it "lowest visible"
      // This is a simple check: if section is visible when near bottom, show the card
      const isSectionLowestVisible = isSectionVisible

      // Base conditions for showing card
      const baseConditionsMet = selectedModelsCount > 0 && !isModelsHidden && !isFollowUpMode

      // Check if any result cards have their top visible in the viewport
      // Don't show card if the top of any result card appears (card should not appear over results)
      const resultCards = document.querySelectorAll('.result-card.conversation-card')
      const resultCardsTopVisible =
        resultCards.length > 0 &&
        Array.from(resultCards).some(card => {
          const cardRect = card.getBoundingClientRect()
          // Check if the top of the card is visible (top is in viewport)
          return cardRect.top >= 0 && cardRect.top < viewportHeight
        })

      // Check if cursor is in the left or right margins (between screen edge and section borders)
      // Hide card when cursor is in these margin areas
      const viewportWidth = window.innerWidth
      const isInLeftMargin = mouseX >= 0 && mouseX < rect.left
      const isInRightMargin = mouseX > rect.right && mouseX <= viewportWidth
      const isInSideMargins = isInLeftMargin || isInRightMargin

      // Priority 1: Auto-show when scrolled near bottom and section is visible/lowest visible
      // This takes priority over mouse hover to ensure card is always visible in this case
      // BUT don't show if result cards top is visible OR cursor is in side margins
      const autoShowCondition =
        baseConditionsMet &&
        isNearBottom &&
        isSectionVisible &&
        isSectionLowestVisible &&
        !resultCardsTopVisible &&
        !isInSideMargins

      // Priority 2: Normal hover case - mouse is over section
      // Don't show if result cards top is visible OR cursor is in side margins
      const hoverCondition =
        isOver && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins

      // Priority 3: Keep visible when mouse leaves section and card is below
      // Don't show if result cards top is visible OR cursor is in side margins
      const keepVisibleCondition =
        !isOver &&
        isCardBelowSection &&
        baseConditionsMet &&
        (justLeftSection || isKeepingVisible) &&
        !resultCardsTopVisible &&
        !isInSideMargins

      let shouldShow = false

      if (autoShowCondition) {
        // Auto-show case: page is scrolled near bottom, section is visible/lowest visible
        // Show card regardless of mouse position or whether card is "below" section
        shouldShow = true
        isKeepingVisible = true

        // Clear any existing timeout
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (hoverCondition) {
        // Normal case: mouse is over section
        shouldShow = true
        // If we were keeping it visible, stop that since we're back in normal mode
        if (isKeepingVisible) {
          isKeepingVisible = false
        }
        // Clear any timeout since we're back in normal mode
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (keepVisibleCondition) {
        // Edge case: mouse is outside section and card is below section
        // Show card if we're keeping it visible (from mouse leaving)
        shouldShow = true
        isKeepingVisible = true

        // Clear any existing timeout - we'll keep it visible as long as card is below section
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else {
        // Not showing - check if we should stop keeping visible
        if (isKeepingVisible) {
          // Only stop if we're not in auto-show condition and card is no longer below section
          // Also stop if result cards top is now visible OR cursor is in side margins
          if (
            resultCardsTopVisible ||
            isInSideMargins ||
            (!autoShowCondition && (!isCardBelowSection || !baseConditionsMet))
          ) {
            isKeepingVisible = false
            if (keepVisibleTimeout) {
              window.clearTimeout(keepVisibleTimeout)
              keepVisibleTimeout = null
            }
            shouldShow = false
          } else if (autoShowCondition) {
            // Still in auto-show condition, keep showing
            shouldShow = true
          } else {
            // Transition state - keep showing for now if card is still below
            shouldShow =
              isCardBelowSection && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins
          }
        } else {
          shouldShow = false
        }
      }

      // Only update state if it changed to avoid unnecessary re-renders
      if (shouldShow !== lastShowState) {
        lastShowState = shouldShow
        setShowDoneSelectingCard(shouldShow)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseY = e.clientY
      lastMouseX = e.clientX

      // Use requestAnimationFrame for smoother updates
      if (rafId) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        checkCardVisibility(lastMouseY, lastMouseX)
      })
    }

    const handleTouchMove = (e: TouchEvent) => {
      // Handle touch events for mobile devices
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        lastMouseY = touch.clientY
        lastMouseX = touch.clientX

        // Use requestAnimationFrame for smoother updates
        if (rafId) return

        rafId = window.requestAnimationFrame(() => {
          rafId = null
          checkCardVisibility(lastMouseY, lastMouseX)
        })
      }
    }

    const handleScroll = () => {
      // Check card visibility on scroll to handle auto-show when near bottom
      if (scrollRafId) return

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null
        checkCardVisibility(lastMouseY, lastMouseX, true)
      })
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Initial check on mount and when dependencies change
    checkCardVisibility(lastMouseY, lastMouseX)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('scroll', handleScroll)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      if (scrollRafId) {
        window.cancelAnimationFrame(scrollRafId)
      }
      if (keepVisibleTimeout) {
        window.clearTimeout(keepVisibleTimeout)
      }
    }
  }, [selectedModelsCount, isModelsHidden, isFollowUpMode, modelsSectionRef])

  // Immediately hide card when all models are deselected
  useEffect(() => {
    if (selectedModelsCount === 0) {
      setShowDoneSelectingCard(false)
    }
  }, [selectedModelsCount])

  // Hide card when entering follow-up mode or when models section is hidden
  useEffect(() => {
    if (isFollowUpMode || isModelsHidden) {
      setShowDoneSelectingCard(false)
    }
  }, [isModelsHidden, isFollowUpMode])

  // Hide card when switching modes (follow-up mode)
  useEffect(() => {
    setShowDoneSelectingCard(false)
  }, [isFollowUpMode])

  // Handler for "Done Selecting" button click
  const handleDoneSelecting = useCallback(() => {
    // Hide the card
    setShowDoneSelectingCard(false)

    // Collapse all expanded model-provider dropdowns
    onCollapseAllDropdowns()

    // Collapse the models section
    onSetIsModelsHidden(true)

    // Scroll to the very top
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })

    // Wait for scroll to complete, then focus
    window.setTimeout(() => {
      onFocusTextarea()
    }, 800) // Wait for scroll animation to complete
  }, [onCollapseAllDropdowns, onSetIsModelsHidden, onFocusTextarea])

  return {
    showDoneSelectingCard: showDoneSelectingCard && !tutorialIsActive,
    setShowDoneSelectingCard,
    handleDoneSelecting,
  }
}
