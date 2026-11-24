import { useEffect, useRef } from 'react'

import type { TutorialStep } from '../../hooks/useTutorial'
import {
  followUpComposerAdvanceDecision,
  isFollowUpComposerReady,
  isFollowUpComposerUnavailable,
  setFollowUpComposerUnavailable,
} from '../../utils/followUpComposerReady'
import { waitForRectStable } from '../../utils/tutorialSettle'

/**
 * Leave "Run Your Comparison" once the continue-conversation composer is on
 * screen. Waiting here for its box to stop moving stacks the entrance float
 * on the overlay's own settle, and WebKit still has the card hidden when the
 * transition sample ends. The overlay keeps the card transparent until that
 * float finishes. If the stream ends with no results, stay on this step.
 */
export function useAdvanceSubmitWhenFollowUpComposerReady(
  step: TutorialStep | null,
  alreadyCompleted: boolean,
  isLoading: boolean | undefined,
  completeStep: (step: TutorialStep) => void,
  onComparisonComplete?: () => void
): void {
  const onComparisonCompleteRef = useRef(onComparisonComplete)
  onComparisonCompleteRef.current = onComparisonComplete

  useEffect(() => {
    if (step !== 'submit-comparison' || alreadyCompleted) return
    let cancelled = false
    let settling = false

    const attempt = () => {
      if (cancelled || settling) return
      const decision = followUpComposerAdvanceDecision({
        isLoading: Boolean(isLoading),
        composerReady: isFollowUpComposerReady(),
        hasComparisonResults: Boolean(
          document.querySelector('.results-section, .result-card, .loading-section')
        ),
      })
      if (decision === 'ready') {
        setFollowUpComposerUnavailable(false)
      } else if (
        !isFollowUpComposerUnavailable() &&
        (decision === 'give-up' ||
          (!isLoading &&
            !document.querySelector('.loading-section') &&
            document.querySelector('[data-after-results-composer-slot]')))
      ) {
        // The slot staying empty after the stream is the error/cancel fallback.
        // A composer that portals while this runs moves the box and keeps us waiting.
        settling = true
        const slot = document.querySelector('[data-after-results-composer-slot]')
        void waitForRectStable(
          () => (slot instanceof HTMLElement ? slot.getBoundingClientRect() : null),
          { timeoutMs: 800, quietMs: 80 }
        ).then(() => {
          settling = false
          if (cancelled) return
          if (isFollowUpComposerReady()) {
            attempt()
            return
          }
          if (isLoading || document.querySelector('.loading-section')) return
          setFollowUpComposerUnavailable(true)
        })
        return
      } else {
        return
      }
      // Advance as soon as the composer is on screen. Waiting for its box to
      // stop moving stacks the entrance float on top of the overlay's own
      // settle, and WebKit still has the card hidden when the sample ends.
      // The overlay keeps the card transparent until that float finishes.
      settling = true
      if (cancelled || !isFollowUpComposerReady()) return
      completeStep('submit-comparison')
      onComparisonCompleteRef.current?.()
    }

    attempt()
    const observer = new MutationObserver(attempt)
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'disabled', 'aria-disabled'],
      })
    }
    const id = window.setInterval(attempt, 80)
    return () => {
      cancelled = true
      setFollowUpComposerUnavailable(false)
      observer.disconnect()
      window.clearInterval(id)
    }
  }, [step, alreadyCompleted, isLoading, completeStep])
}
