import { useState, useEffect, useCallback, type RefObject } from 'react'

interface UseDoneSelectingCardProps {
  selectedModelsCount: number
  selectedModelsSignature: string
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
  handleDismissDoneSelecting: () => void
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
    selectedModelsSignature,
    isModelsHidden,
    isFollowUpMode,
    modelsSectionRef,
    tutorialIsActive,
  } = props

  const { onCollapseAllDropdowns, onSetIsModelsHidden, onFocusTextarea } = callbacks

  const [showDoneSelectingCard, setShowDoneSelectingCard] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  // Track mouse/touch position over models section with throttling for better performance
  useEffect(() => {
    let rafId: number | null = null
    let scrollRafId: number | null = null
    let lastShowState = false
    let lastMouseY = 0
    let lastMouseX = 0
    let hasRealPointer = false
    let keepVisibleTimeout: number | null = null
    let isKeepingVisible = false
    let previousIsOver = false

    const checkCardVisibility = (mouseY: number, mouseX: number, fromScroll: boolean = false) => {
      if (!modelsSectionRef.current) return

      const rect = modelsSectionRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      // Base conditions for showing card
      const baseConditionsMet =
        selectedModelsCount > 0 && !isModelsHidden && !isFollowUpMode && !isDismissed

      // Check if any result cards have their top visible in the viewport
      const resultCards = document.querySelectorAll('.result-card.conversation-card')
      const resultCardsTopVisible =
        resultCards.length > 0 &&
        Array.from(resultCards).some(card => {
          const cardRect = card.getBoundingClientRect()
          return cardRect.top >= 0 && cardRect.top < viewportHeight
        })

      // Check if models section is visible (any part of it is in the viewport)
      const isSectionVisible = rect.top < viewportHeight && rect.bottom > 0

      // On touch devices without a real pointer position, use simplified logic:
      // show the card whenever the section is visible, models are selected, and
      // no result cards are on-screen.
      if (!hasRealPointer) {
        const shouldShow = baseConditionsMet && isSectionVisible && !resultCardsTopVisible
        if (shouldShow !== lastShowState) {
          lastShowState = shouldShow
          setShowDoneSelectingCard(shouldShow)
        }
        return
      }

      // --- Desktop path (has real pointer coordinates) ---

      // Check if mouse is over the section
      const isOver =
        mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right

      // Detect transition from "over section" to "not over section"
      const justLeftSection = previousIsOver && !isOver
      if (!fromScroll) {
        previousIsOver = isOver
      }

      // Check if card is positioned below the models section
      const cardCenterY = window.innerHeight * 0.8
      const cardHeight = 150
      const cardTop = cardCenterY - cardHeight / 2
      const isCardBelowSection = cardTop > rect.bottom

      // Check if page is scrolled near the bottom
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight
      const distanceFromBottom = scrollHeight - (scrollTop + viewportHeight)
      const scrollPercentage = (scrollTop + viewportHeight) / scrollHeight
      const isNearBottom =
        distanceFromBottom < 500 ||
        scrollPercentage >= 0.8 ||
        scrollTop + viewportHeight >= scrollHeight - 200 ||
        scrollPercentage >= 0.7

      const isSectionLowestVisible = isSectionVisible

      // Check if cursor is in the left or right margins
      const viewportWidth = window.innerWidth
      const isInLeftMargin = mouseX >= 0 && mouseX < rect.left
      const isInRightMargin = mouseX > rect.right && mouseX <= viewportWidth
      const isInSideMargins = isInLeftMargin || isInRightMargin

      const autoShowCondition =
        baseConditionsMet &&
        isNearBottom &&
        isSectionVisible &&
        isSectionLowestVisible &&
        !resultCardsTopVisible &&
        !isInSideMargins

      const hoverCondition =
        isOver && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins

      const keepVisibleCondition =
        !isOver &&
        isCardBelowSection &&
        baseConditionsMet &&
        (justLeftSection || isKeepingVisible) &&
        !resultCardsTopVisible &&
        !isInSideMargins

      let shouldShow = false

      if (autoShowCondition) {
        shouldShow = true
        isKeepingVisible = true

        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (hoverCondition) {
        shouldShow = true
        if (isKeepingVisible) {
          isKeepingVisible = false
        }
        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else if (keepVisibleCondition) {
        shouldShow = true
        isKeepingVisible = true

        if (keepVisibleTimeout) {
          window.clearTimeout(keepVisibleTimeout)
          keepVisibleTimeout = null
        }
      } else {
        if (isKeepingVisible) {
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
            shouldShow = true
          } else {
            shouldShow =
              isCardBelowSection && baseConditionsMet && !resultCardsTopVisible && !isInSideMargins
          }
        } else {
          shouldShow = false
        }
      }

      if (shouldShow !== lastShowState) {
        lastShowState = shouldShow
        setShowDoneSelectingCard(shouldShow)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      hasRealPointer = true
      lastMouseY = e.clientY
      lastMouseX = e.clientX

      if (rafId) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        checkCardVisibility(lastMouseY, lastMouseX)
      })
    }

    const handleTouch = (e: TouchEvent) => {
      const touch = e.touches[0] ?? e.changedTouches[0]
      if (!touch) return
      lastMouseY = touch.clientY
      lastMouseX = touch.clientX

      if (rafId) return

      rafId = window.requestAnimationFrame(() => {
        rafId = null
        checkCardVisibility(lastMouseY, lastMouseX)
      })
    }

    const handleScroll = () => {
      if (scrollRafId) return

      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null
        checkCardVisibility(lastMouseY, lastMouseX, true)
      })
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchstart', handleTouch, { passive: true })
    window.addEventListener('touchmove', handleTouch, { passive: true })
    window.addEventListener('touchend', handleTouch, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    // Initial check on mount and when dependencies change
    checkCardVisibility(lastMouseY, lastMouseX)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchstart', handleTouch)
      window.removeEventListener('touchmove', handleTouch)
      window.removeEventListener('touchend', handleTouch)
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
  }, [selectedModelsCount, isModelsHidden, isFollowUpMode, modelsSectionRef, isDismissed])

  // Re-enable card visibility when model selection changes after dismissal
  useEffect(() => {
    setIsDismissed(false)
  }, [selectedModelsSignature])

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

  const handleDismissDoneSelecting = useCallback(() => {
    setIsDismissed(true)
    setShowDoneSelectingCard(false)
  }, [])

  return {
    showDoneSelectingCard: showDoneSelectingCard && !tutorialIsActive,
    setShowDoneSelectingCard,
    handleDoneSelecting,
    handleDismissDoneSelecting,
  }
}
