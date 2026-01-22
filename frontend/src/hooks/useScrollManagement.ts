/**
 * useScrollManagement - Manages scroll behavior across multiple result cards
 *
 * ## Why This Hook Exists
 *
 * When comparing multiple AI models, users see N scrollable cards side-by-side.
 * This creates several UX challenges that this hook solves:
 *
 * 1. **Auto-scroll during streaming:** As responses stream in, content grows.
 *    Users want to see the latest content without manually scrolling.
 *
 * 2. **Respecting user intent:** If a user scrolls up to re-read something,
 *    auto-scroll should stop—otherwise it fights with the user.
 *
 * 3. **Synchronized scrolling:** Users often want to compare responses at
 *    the same relative position. Scroll-lock syncs all cards together.
 *
 * 4. **Page vs. card scrolling:** When a card is scrolled to its edge,
 *    continued scrolling should move the page, not fight the user.
 *
 * ## Key Design Decisions
 *
 * ### 1. Immediate Pause on User Interaction
 * We pause auto-scroll IMMEDIATELY when we detect wheel/touch/mousedown,
 * not on scroll events. This prevents the jarring experience of auto-scroll
 * fighting the user before the scroll event fires.
 *
 * ### 2. Resume on Scroll-to-Bottom
 * Auto-scroll resumes only when the user scrolls back to the bottom.
 * This is the clearest signal that they want to follow new content.
 *
 * ### 3. Percentage-Based Sync
 * When scroll-lock is enabled, we sync by scroll percentage (not pixels)
 * because cards may have different content heights. This keeps them
 * visually aligned at the "same" position in their respective content.
 *
 * ### 4. Page Scroll Detection
 * We track page-level scrolling separately to prevent auto-scroll from
 * interfering when the user is scrolling the main page (e.g., scrolling
 * past the results section).
 *
 * ## Refs Architecture
 *
 * This hook uses refs passed from the parent rather than internal state for:
 * - `autoScrollPausedRef`: Per-model auto-scroll pause state
 * - `scrollListenersRef`: Event listener cleanup tracking
 * - `syncingFromElementRef`: Prevents scroll sync feedback loops
 *
 * This allows the streaming hook to also access these refs for coordination.
 *
 * @example
 * ```typescript
 * const {
 *   setupScrollListener,
 *   cleanupScrollListener,
 *   isScrolledToBottom,
 *   isPageScrollingRef,
 * } = useScrollManagement({
 *   conversations,
 *   isLoadingHistory,
 *   isScrollLocked,
 *   autoScrollPausedRef,
 *   // ...other refs
 * });
 *
 * // When streaming starts for a model:
 * setupScrollListener(modelId);
 *
 * // When comparison ends:
 * cleanupScrollListener(modelId);
 * ```
 */

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'

import type { ModelConversation } from '../types'
import { createModelId } from '../types'
import { getSafeId } from '../utils'

/**
 * Listener functions attached to each conversation card element
 *
 * Multiple event types are tracked because scroll events fire too late
 * to prevent auto-scroll from fighting the user. We need to detect
 * interaction intent (wheel, touch, mousedown) immediately.
 */
interface ScrollListeners {
  /** Fires after scroll position changes - used for direction detection and sync */
  scroll: () => void
  /** Fires on mouse wheel - immediately pauses auto-scroll */
  wheel: (e: WheelEvent) => void
  /** Fires on touch - immediately pauses auto-scroll (mobile) */
  touchstart: () => void
  /** Fires on scrollbar click - immediately pauses auto-scroll */
  mousedown: () => void
}

/**
 * Configuration options for the scroll management hook
 */
export interface UseScrollManagementConfig {
  /** Array of current model conversations */
  conversations: ModelConversation[]
  /** Whether history is currently loading */
  isLoadingHistory: boolean
  /** Current scroll lock state */
  isScrollLocked: boolean
  /** Ref tracking if auto-scroll is paused per model */
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
  /** Ref storing scroll listeners per model */
  scrollListenersRef: React.MutableRefObject<Map<string, ScrollListeners>>
  /** Ref tracking which models the user is currently interacting with */
  userInteractingRef: React.MutableRefObject<Set<string>>
  /** Ref storing last scroll position per model */
  lastScrollTopRef: React.MutableRefObject<Map<string, number>>
  /** Ref synced to isScrollLocked state */
  isScrollLockedRef: React.MutableRefObject<boolean>
  /** Ref tracking which element initiated the current sync */
  syncingFromElementRef: React.MutableRefObject<HTMLElement | null>
  /** Ref tracking the last sync timestamp */
  lastSyncTimeRef: React.MutableRefObject<number>
}

/**
 * Return type for the scroll management hook
 */
export interface UseScrollManagementReturn {
  /** Set up scroll listeners for a model's conversation element */
  setupScrollListener: (modelId: string) => boolean
  /** Remove scroll listeners for a model */
  cleanupScrollListener: (modelId: string) => void
  /** Check if an element is scrolled to bottom (within threshold) */
  isScrolledToBottom: (element: HTMLElement) => boolean
  /** Ref tracking if conversations were just loaded from history */
  justLoadedFromHistoryRef: React.MutableRefObject<boolean>
  /** Ref tracking if scroll-to-top from history is in progress */
  isScrollingToTopFromHistoryRef: React.MutableRefObject<boolean>
  /** Ref tracking if page is currently scrolling */
  isPageScrollingRef: React.MutableRefObject<boolean>
}

/**
 * Hook for managing scroll behavior in comparison results
 */
export function useScrollManagement(config: UseScrollManagementConfig): UseScrollManagementReturn {
  const {
    conversations,
    isLoadingHistory,
    isScrollLocked,
    autoScrollPausedRef,
    scrollListenersRef,
    userInteractingRef,
    lastScrollTopRef,
    isScrollLockedRef,
    syncingFromElementRef,
    lastSyncTimeRef,
  } = config

  // Local refs for scroll state tracking
  const justLoadedFromHistoryRef = useRef<boolean>(false)
  const isScrollingToTopFromHistoryRef = useRef<boolean>(false)
  const isPageScrollingRef = useRef<boolean>(false)

  /**
   * Check if element is scrolled to bottom (within 50px threshold)
   */
  const isScrolledToBottom = useCallback((element: HTMLElement): boolean => {
    const threshold = 50 // px tolerance
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
  }, [])

  /**
   * Set up scroll listeners for a model to detect user scrolling
   * Returns true if successful, false if element not found
   */
  const setupScrollListener = useCallback(
    (modelId: string): boolean => {
      const safeId = getSafeId(modelId)
      const expectedId = `conversation-content-${safeId}`

      const conversationContent = document.querySelector(`#${expectedId}`) as HTMLElement

      if (!conversationContent) {
        return false
      }

      // Remove existing listeners if any
      const existingListeners = scrollListenersRef.current.get(modelId)
      if (existingListeners) {
        conversationContent.removeEventListener('scroll', existingListeners.scroll)
        conversationContent.removeEventListener('wheel', existingListeners.wheel)
        conversationContent.removeEventListener('touchstart', existingListeners.touchstart)
        conversationContent.removeEventListener('mousedown', existingListeners.mousedown)
      }

      // Initialize last scroll position
      lastScrollTopRef.current.set(modelId, conversationContent.scrollTop)

      // Handle mouse wheel - immediate indication of user interaction
      const handleWheel = (e: WheelEvent) => {
        const isAtTop = conversationContent.scrollTop === 0
        const isAtBottom = isScrolledToBottom(conversationContent)

        // If at top and scrolling up, or at bottom and scrolling down, manually scroll the window
        if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
          // Manually scroll the window to allow continuation of scrolling beyond card boundaries
          window.scrollBy({
            top: e.deltaY * 0.5, // Scale down the scroll amount slightly for smoother UX
            left: 0,
            behavior: 'auto',
          })
          // Continue to let the event propagate naturally as well
          return
        }

        // IMMEDIATELY pause auto-scroll when user scrolls
        autoScrollPausedRef.current.add(modelId)

        userInteractingRef.current.add(modelId)

        // Check scroll position after wheel event to potentially resume
        setTimeout(() => {
          if (isScrolledToBottom(conversationContent)) {
            // User scrolled to bottom - resume auto-scroll
            autoScrollPausedRef.current.delete(modelId)
          }
          // If not at bottom, keep it paused (already set above)
          userInteractingRef.current.delete(modelId)
        }, 75)
      }

      // Handle touch start - immediate indication of user interaction
      const handleTouchStart = () => {
        // IMMEDIATELY pause auto-scroll when user touches to scroll
        autoScrollPausedRef.current.add(modelId)

        userInteractingRef.current.add(modelId)

        // Check scroll position after touch to potentially resume
        setTimeout(() => {
          if (isScrolledToBottom(conversationContent)) {
            // User scrolled to bottom - resume auto-scroll
            autoScrollPausedRef.current.delete(modelId)
          }
          // If not at bottom, keep it paused (already set above)
          userInteractingRef.current.delete(modelId)
        }, 75)
      }

      // Handle mousedown on scrollbar - user is clicking/dragging scrollbar
      const handleMouseDown = () => {
        // IMMEDIATELY pause auto-scroll when user clicks scrollbar
        autoScrollPausedRef.current.add(modelId)

        userInteractingRef.current.add(modelId)

        // Check scroll position after mousedown to potentially resume
        setTimeout(() => {
          if (isScrolledToBottom(conversationContent)) {
            // User scrolled to bottom - resume auto-scroll
            autoScrollPausedRef.current.delete(modelId)
          }
          userInteractingRef.current.delete(modelId)
        }, 75)
      }

      // Handle scroll event - detect if scrolling upward (user interaction)
      const handleScroll = () => {
        const lastScrollTop = lastScrollTopRef.current.get(modelId) || 0
        const currentScrollTop = conversationContent.scrollTop

        // If scrolling up (position decreased), it's likely user interaction
        if (currentScrollTop < lastScrollTop) {
          // User scrolled up - pause auto-scroll
          autoScrollPausedRef.current.add(modelId)
        } else if (isScrolledToBottom(conversationContent)) {
          // Scrolled to bottom - resume auto-scroll
          autoScrollPausedRef.current.delete(modelId)
        }

        // Update last scroll position
        lastScrollTopRef.current.set(modelId, currentScrollTop)

        // If we're scrolling to top from history, don't sync to prevent interference
        if (isScrollingToTopFromHistoryRef.current) {
          return
        }

        // If scroll lock is enabled, sync this scroll to all other cards
        if (!isScrollLockedRef.current) {
          return
        }

        // If we're already in a sync operation, check if this is a new user scroll
        // This prevents infinite loops when programmatic scrolls trigger scroll events
        if (syncingFromElementRef.current !== null) {
          // If a different element is trying to scroll, check if it's user-initiated
          if (syncingFromElementRef.current !== conversationContent) {
            // Check if enough time has passed since the last sync to allow new user scrolling
            const timeSinceLastSync = Date.now() - lastSyncTimeRef.current
            if (timeSinceLastSync < 100) {
              // Very recent sync - likely programmatic, skip it
              return
            } else {
              // Enough time has passed, this is likely a new user scroll on a different pane
              syncingFromElementRef.current = null
            }
          }
        }

        // Mark this element as the one initiating the sync
        syncingFromElementRef.current = conversationContent
        lastSyncTimeRef.current = Date.now()

        // Get all conversation content elements
        const allConversations = document.querySelectorAll('[id^="conversation-content-"]')

        // Store the scroll position as a percentage to account for different content heights
        const scrollHeight = conversationContent.scrollHeight - conversationContent.clientHeight
        const scrollPercentage = scrollHeight > 0 ? conversationContent.scrollTop / scrollHeight : 0

        // Sync all other cards
        allConversations.forEach(element => {
          const el = element as HTMLElement
          // Don't sync to the element that triggered this scroll
          if (el !== conversationContent) {
            const targetScrollHeight = el.scrollHeight - el.clientHeight
            if (targetScrollHeight > 0) {
              const targetScrollTop = scrollPercentage * targetScrollHeight
              el.scrollTop = targetScrollTop
            }
          }
        })

        // Reset the flag after a delay to allow all programmatic scroll events to complete
        setTimeout(() => {
          syncingFromElementRef.current = null
        }, 300)
      }

      // Add all listeners
      conversationContent.addEventListener('wheel', handleWheel, { passive: true })
      conversationContent.addEventListener('touchstart', handleTouchStart, { passive: true })
      conversationContent.addEventListener('mousedown', handleMouseDown, { passive: true })
      conversationContent.addEventListener('scroll', handleScroll, { passive: true })

      scrollListenersRef.current.set(modelId, {
        scroll: handleScroll,
        wheel: handleWheel,
        touchstart: handleTouchStart,
        mousedown: handleMouseDown,
      })

      return true
    },
    [
      autoScrollPausedRef,
      scrollListenersRef,
      userInteractingRef,
      lastScrollTopRef,
      isScrollLockedRef,
      syncingFromElementRef,
      lastSyncTimeRef,
      isScrolledToBottom,
    ]
  )

  /**
   * Cleanup scroll listener for a model
   */
  const cleanupScrollListener = useCallback(
    (modelId: string) => {
      const safeId = getSafeId(modelId)
      const conversationContent = document.querySelector(
        `#conversation-content-${safeId}`
      ) as HTMLElement
      const listeners = scrollListenersRef.current.get(modelId)

      if (conversationContent && listeners) {
        conversationContent.removeEventListener('scroll', listeners.scroll)
        conversationContent.removeEventListener('wheel', listeners.wheel)
        conversationContent.removeEventListener('touchstart', listeners.touchstart)
        conversationContent.removeEventListener('mousedown', listeners.mousedown)
      }
      scrollListenersRef.current.delete(modelId)
      userInteractingRef.current.delete(modelId)
      lastScrollTopRef.current.delete(modelId)
    },
    [scrollListenersRef, userInteractingRef, lastScrollTopRef]
  )

  /**
   * Effect: Scroll all conversations to top when loaded from history
   *
   * ## Why useLayoutEffect?
   * We use useLayoutEffect (not useEffect) because we need to set scroll
   * positions BEFORE the browser paints. With useEffect, users would see
   * a flash of scrolled-to-bottom content before jumping to top.
   *
   * ## Why Retry Logic?
   * When loading history, DOM elements may not be rendered yet. We retry
   * up to 25 times with increasing delays to ensure all cards are found
   * and scrolled to top.
   *
   * ## Why Delayed Flag Reset?
   * The `isScrollingToTopFromHistoryRef` stays true for 1 second to prevent
   * scroll-lock sync from immediately undoing our scroll-to-top operation.
   */
  useLayoutEffect(() => {
    if (justLoadedFromHistoryRef.current && conversations.length > 0 && !isLoadingHistory) {
      // Set flag to prevent scroll syncing from interfering
      isScrollingToTopFromHistoryRef.current = true
      // Temporarily disable scroll syncing immediately
      syncingFromElementRef.current = null

      // Try to scroll immediately
      const scrollImmediately = () => {
        conversations.forEach(conversation => {
          const safeId = getSafeId(conversation.modelId)
          const conversationContent = document.querySelector(
            `#conversation-content-${safeId}`
          ) as HTMLElement
          if (conversationContent) {
            conversationContent.scrollTop = 0
          }
        })
      }

      scrollImmediately()

      // Also use a retry mechanism in case elements aren't rendered yet
      const scrollToTop = (attempts = 0) => {
        const maxAttempts = 25
        const delay = attempts === 0 ? 100 : attempts < 10 ? 50 : 25

        setTimeout(() => {
          const elementsToScroll: HTMLElement[] = []
          let allFound = true

          // Collect all conversation content elements
          conversations.forEach(conversation => {
            const safeId = getSafeId(conversation.modelId)
            const conversationContent = document.querySelector(
              `#conversation-content-${safeId}`
            ) as HTMLElement
            if (conversationContent) {
              // Verify element has content and is visible
              if (conversationContent.scrollHeight > 0 && conversationContent.offsetHeight > 0) {
                elementsToScroll.push(conversationContent)
                // Scroll to top
                conversationContent.scrollTop = 0
              } else {
                allFound = false
              }
            } else {
              allFound = false
            }
          })

          // Retry if not all elements were found
          if (!allFound && attempts < maxAttempts) {
            scrollToTop(attempts + 1)
          } else {
            // Verify all are scrolled to top
            const allScrolledToTop =
              elementsToScroll.length === conversations.length &&
              elementsToScroll.every(el => Math.abs(el.scrollTop) < 1)

            if (!allScrolledToTop && attempts < maxAttempts) {
              scrollToTop(attempts + 1)
            } else {
              // Keep flags set for longer to prevent scroll sync from interfering
              setTimeout(() => {
                justLoadedFromHistoryRef.current = false
                // Keep scroll prevention flag set longer to ensure no sync happens
                setTimeout(() => {
                  isScrollingToTopFromHistoryRef.current = false
                }, 1000) // Keep it set for 1 second total to prevent any sync interference
              }, 600)
            }
          }
        }, delay)
      }

      // Start retry mechanism after a brief delay
      requestAnimationFrame(() => {
        scrollToTop()
      })
    }
    // syncingFromElementRef is a ref (stable reference), but ESLint requires it in deps
  }, [conversations, isLoadingHistory, syncingFromElementRef])

  /**
   * Effect: Keep ref in sync with scroll lock state and align cards when enabled
   *
   * ## Why Sync to Ref?
   * The scroll event handlers need to check isScrollLocked, but they're
   * created with closures. Using a ref ensures they always see the current value.
   *
   * ## Why Align on Enable?
   * When the user enables scroll-lock, all cards should immediately align
   * to a common position. We use the first card as the reference point.
   */
  useEffect(() => {
    isScrollLockedRef.current = isScrollLocked

    // When scroll lock is enabled, align all cards to the first card's scroll position
    // But skip if we just loaded from history (to prevent interference)
    if (isScrollLocked && conversations.length > 0 && !justLoadedFromHistoryRef.current) {
      const allConversations = document.querySelectorAll('[id^="conversation-content-"]')
      if (allConversations.length > 0) {
        const firstCard = allConversations[0] as HTMLElement

        // Mark the first card as the sync source
        syncingFromElementRef.current = firstCard

        const firstScrollHeight = firstCard.scrollHeight - firstCard.clientHeight
        const scrollPercentage = firstScrollHeight > 0 ? firstCard.scrollTop / firstScrollHeight : 0

        // Sync all other cards to the first card's scroll percentage
        allConversations.forEach((element, index) => {
          if (index > 0) {
            const el = element as HTMLElement
            const targetScrollHeight = el.scrollHeight - el.clientHeight
            if (targetScrollHeight > 0) {
              const targetScrollTop = scrollPercentage * targetScrollHeight
              el.scrollTop = targetScrollTop
            }
          }
        })

        // Reset after alignment is complete
        setTimeout(() => {
          syncingFromElementRef.current = null
        }, 100)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScrollLocked, conversations])

  /**
   * Effect: Setup scroll listeners when conversations are rendered
   */
  useEffect(() => {
    conversations.forEach(conversation => {
      // Check if listener is already set up
      if (!scrollListenersRef.current.has(conversation.modelId)) {
        const maxAttempts = 5
        let attempt = 0

        const trySetup = () => {
          attempt++
          const success = setupScrollListener(conversation.modelId)
          if (!success && attempt < maxAttempts) {
            setTimeout(trySetup, 100 * attempt)
          }
        }

        // Try immediately
        trySetup()
      }
    })

    // Clean up listeners for models that are no longer in conversations
    const activeModelIds = new Set(conversations.map(c => c.modelId))
    scrollListenersRef.current.forEach((_, modelId) => {
      if (!activeModelIds.has(createModelId(modelId))) {
        cleanupScrollListener(modelId)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, setupScrollListener, cleanupScrollListener])

  /**
   * Effect: Detect page-level scrolling to prevent card auto-scroll from interfering
   *
   * ## Why Track Page Scrolling?
   * When the user scrolls the page (not a card), our auto-scroll logic should
   * NOT scroll the cards. Otherwise, auto-scroll fights the user while they're
   * scrolling past the results section.
   *
   * ## Edge Case: Card Boundary Overflow
   * When a card is scrolled to its top/bottom edge and the user keeps scrolling
   * in that direction, we want the page to scroll. We detect this by checking
   * if a wheel event is at a card boundary and allow it to propagate.
   */
  useEffect(() => {
    let lastPageScrollTop = window.scrollY || document.documentElement.scrollTop
    let scrollTimeout: number | null = null

    // Detect wheel events on card boundaries - user trying to scroll past card to page
    const handleWheelOnPage = (e: WheelEvent) => {
      const target = e.target as HTMLElement

      // Check if wheel event is happening on a conversation card that's at its boundary
      const conversationContent = target.closest('[id^="conversation-content-"]') as HTMLElement
      if (conversationContent) {
        const isAtTop = conversationContent.scrollTop === 0
        const isAtBottom =
          conversationContent.scrollHeight -
            conversationContent.scrollTop -
            conversationContent.clientHeight <
          1

        // If at boundary and scrolling in that direction, mark as page scrolling
        if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
          isPageScrollingRef.current = true
          if (scrollTimeout) window.clearTimeout(scrollTimeout)
          scrollTimeout = window.setTimeout(() => {
            isPageScrollingRef.current = false
          }, 150)
        }
      } else {
        // Wheel on page body - mark as page scrolling
        isPageScrollingRef.current = true
        if (scrollTimeout) window.clearTimeout(scrollTimeout)
        scrollTimeout = window.setTimeout(() => {
          isPageScrollingRef.current = false
        }, 150)
      }
    }

    // Track actual scroll movement - this is the primary detection method
    const handlePageScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop

      // Only mark as page scrolling if there's actual scroll movement
      if (Math.abs(currentScrollTop - lastPageScrollTop) > 5) {
        isPageScrollingRef.current = true
        lastPageScrollTop = currentScrollTop

        if (scrollTimeout) window.clearTimeout(scrollTimeout)
        scrollTimeout = window.setTimeout(() => {
          isPageScrollingRef.current = false
        }, 150)
      }
    }

    window.addEventListener('wheel', handleWheelOnPage, { passive: true })
    window.addEventListener('scroll', handlePageScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheelOnPage)
      window.removeEventListener('scroll', handlePageScroll)
      if (scrollTimeout) window.clearTimeout(scrollTimeout)
    }
  }, [])

  return {
    setupScrollListener,
    cleanupScrollListener,
    isScrolledToBottom,
    justLoadedFromHistoryRef,
    isScrollingToTopFromHistoryRef,
    isPageScrollingRef,
  }
}
