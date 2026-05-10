import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { minViewportWidthForResultsSingleRow } from '../../config/constants'
import { useResponsive } from '../../hooks'
import { RESULT_TAB, createModelId } from '../../types'
import type { ModelConversation, ActiveResultTabs, ResultTab } from '../../types'
import { isErrorMessage } from '../../utils/error'

import { ResultCard, type Model } from './ResultCard'

/** Resolve reasoning text when map keys differ slightly from conversation.modelId (e.g. whitespace). */
function getStreamingReasoningForModel(modelId: string, byModel: Record<string, string>): string {
  const direct = byModel[modelId]
  if (direct?.trim()) return direct
  const target = createModelId(modelId)
  for (const [k, v] of Object.entries(byModel)) {
    if (!v?.trim()) continue
    if (createModelId(k) === target) return v
  }
  return ''
}

function streamAnswerStartedForModel(modelId: string, byModel: Record<string, boolean>): boolean {
  if (byModel[modelId]) return true
  const target = createModelId(modelId)
  for (const [k, v] of Object.entries(byModel)) {
    if (!v) continue
    if (createModelId(k) === target) return true
  }
  return false
}

function modelHasStreamingReasoning(modelId: string, byModel: Record<string, string>): boolean {
  return getStreamingReasoningForModel(modelId, byModel).length > 0
}

/** Duration aligned with `.results-tab-content-slide--*` CSS in results.css (fallback if `animationend` does not fire). */
const MODEL_TAB_SLIDE_ANIM_MS = 480

/** Min horizontal swipe (px); scales slightly with viewport. */
function mobileModelTabSwipeThreshold(width: number): number {
  return Math.max(64, Math.min(104, Math.round(width * 0.14)))
}

/** Skip changing model tabs when the gesture began on code or a horizontally scrollable block. */
function shouldSuppressMobileModelTabSwipe(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null
  if (!el) return false

  if (
    el.closest(
      [
        '.code-block',
        '.code-block-direct',
        '.message-content .latex-content pre',
        '.latex-content pre',
        'pre.raw-output',
        '.result-output.raw-output',
      ].join(', ')
    )
  ) {
    return true
  }

  let node: Element | null = el
  while (node && !node.classList.contains('results-tabs-container')) {
    const { overflowX } = window.getComputedStyle(node)
    if (
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      node.scrollWidth > node.clientWidth + 2
    ) {
      return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * Center the active tab inside the horizontal tab strip only.
 * Do not use `Element.scrollIntoView` on tab buttons: it scrolls ancestor chains and can shift the whole page horizontally.
 */
function scrollActiveModelTabIntoStrip(
  strip: HTMLDivElement | null,
  button: HTMLButtonElement | null,
  behavior: 'smooth' | 'instant'
) {
  if (!strip || !button) return
  const stripRect = strip.getBoundingClientRect()
  const btnRect = button.getBoundingClientRect()
  const buttonMidX = btnRect.left + btnRect.width / 2
  const stripMidX = stripRect.left + stripRect.width / 2
  const delta = buttonMidX - stripMidX
  const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth)
  const targetLeft = Math.max(0, Math.min(strip.scrollLeft + delta, maxScroll))
  if (behavior === 'instant') {
    strip.scrollLeft = targetLeft
  } else {
    strip.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }
}

export interface ResultsDisplayProps {
  conversations: ModelConversation[]
  closedCards: Set<string>
  allModels: Model[]
  activeResultTabs: ActiveResultTabs
  processingTime?: number
  metadata?: {
    models_completed: number
    models_failed: number
    total_tokens_used: number
  }
  modelProcessingStates?: Record<string, boolean>
  /** Override error state per model (e.g. from backend errors, timeouts) */
  modelErrorStates?: Record<string, boolean>
  /** Current breakout animation phase */
  breakoutPhase?: 'idle' | 'fading-out' | 'hidden' | 'fading-in'
  onScreenshot?: (modelId: string) => void
  onCopyResponse?: (modelId: string) => void
  onCloseCard?: (modelId: string) => void
  onSwitchTab?: (modelId: string, tab: ResultTab) => void
  onBreakout?: (modelId: string) => void
  onHideOthers?: (modelId: string) => void
  onCopyMessage?: (modelId: string, messageId: string, content: string) => void
  className?: string
  /** When true, disables card action buttons (not model tabs or formatted/raw tabs) */
  isTutorialActive?: boolean
  streamingReasoningByModel?: Record<string, string>
  streamAnswerStartedByModel?: Record<string, boolean>
  highlightMobileCapabilityDemoModelTabs?: boolean
  onDismissMobileCapabilityDemoModelTabsHighlight?: () => void
}

// Renders comparison results as a grid when all cards fit one row, otherwise model-name tabs
export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  conversations,
  closedCards,
  allModels,
  activeResultTabs,
  processingTime,
  metadata,
  modelProcessingStates = {},
  modelErrorStates = {},
  breakoutPhase = 'idle',
  onScreenshot,
  onCopyResponse,
  onCloseCard,
  onSwitchTab,
  onBreakout,
  onHideOthers,
  onCopyMessage,
  className = '',
  isTutorialActive = false,
  streamingReasoningByModel = {},
  streamAnswerStartedByModel = {},
  highlightMobileCapabilityDemoModelTabs = false,
  onDismissMobileCapabilityDemoModelTabsHighlight,
}) => {
  const visibleConversations = useMemo(
    () => conversations.filter(conv => Boolean(conv?.modelId) && !closedCards.has(conv.modelId)),
    [conversations, closedCards]
  )

  const { viewportWidth } = useResponsive()
  const useTabbedMultiModelResults =
    visibleConversations.length > 1 &&
    viewportWidth < minViewportWidthForResultsSingleRow(visibleConversations.length)

  // State for active tab when multiple models don't fit side-by-side (index of the visible card)
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)
  /** Slide-in direction for tab changes; `'none'` = initial / no animation. */
  const [slideEnter, setSlideEnter] = useState<'none' | 'from-right' | 'from-left'>('none')
  const mobileTabsAttentionScrollRef = useRef<HTMLDivElement>(null)
  const modelTabsHeaderRef = useRef<HTMLDivElement>(null)
  const modelTabButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const swipeTouchStartRef = useRef<{
    x: number
    y: number
    target: EventTarget | null
  } | null>(null)
  /** Mobile tabbed UI: first model to emit answer/reasoning tokens this round (pin resets when answer-started map clears). */
  const firstMobileStreamerPinnedRef = useRef<string | null>(null)
  const prevStreamAnswerStartedRef = useRef<Record<string, boolean>>({})
  const prevStreamingReasoningNonemptyRef = useRef<Record<string, boolean>>({})

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (activeTabIndex >= visibleConversations.length && visibleConversations.length > 0) {
      setActiveTabIndex(0)
    }
  }, [activeTabIndex, visibleConversations.length])

  useLayoutEffect(() => {
    if (!highlightMobileCapabilityDemoModelTabs || !useTabbedMultiModelResults) return
    mobileTabsAttentionScrollRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [highlightMobileCapabilityDemoModelTabs, useTabbedMultiModelResults])

  const modelTabStripKey = useMemo(
    () => visibleConversations.map(c => c.modelId).join('\0'),
    [visibleConversations]
  )

  useLayoutEffect(() => {
    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return
    const strip = modelTabsHeaderRef.current
    const btn = modelTabButtonRefs.current[activeTabIndex]
    if (!strip || !btn) return
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.requestAnimationFrame(() => {
      scrollActiveModelTabIntoStrip(strip, btn, reducedMotion ? 'instant' : 'smooth')
    })
    return () => window.cancelAnimationFrame(id)
  }, [useTabbedMultiModelResults, activeTabIndex, modelTabStripKey, visibleConversations.length])

  useEffect(() => {
    if (slideEnter === 'none') return
    const id = window.setTimeout(() => setSlideEnter('none'), MODEL_TAB_SLIDE_ANIM_MS + 40)
    return () => window.clearTimeout(id)
  }, [slideEnter])

  useEffect(() => {
    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return

    if (Object.keys(streamAnswerStartedByModel).length === 0) {
      firstMobileStreamerPinnedRef.current = null
      prevStreamAnswerStartedRef.current = {}
      prevStreamingReasoningNonemptyRef.current = {}
    }

    const syncPrevRefs = () => {
      for (const conv of visibleConversations) {
        const mid = conv.modelId
        prevStreamAnswerStartedRef.current[mid] = streamAnswerStartedForModel(
          mid,
          streamAnswerStartedByModel
        )
        prevStreamingReasoningNonemptyRef.current[mid] = modelHasStreamingReasoning(
          mid,
          streamingReasoningByModel
        )
      }
    }

    if (firstMobileStreamerPinnedRef.current !== null) {
      syncPrevRefs()
      return
    }

    for (let i = 0; i < visibleConversations.length; i++) {
      const mid = visibleConversations[i].modelId
      const answerNow = streamAnswerStartedForModel(mid, streamAnswerStartedByModel)
      const reasoningNow = modelHasStreamingReasoning(mid, streamingReasoningByModel)
      const answerPrev = prevStreamAnswerStartedRef.current[mid] ?? false
      const reasoningPrev = prevStreamingReasoningNonemptyRef.current[mid] ?? false
      const becameActive = (answerNow && !answerPrev) || (reasoningNow && !reasoningPrev)
      if (becameActive) {
        firstMobileStreamerPinnedRef.current = mid
        setSlideEnter('none')
        setActiveTabIndex(i)
        onDismissMobileCapabilityDemoModelTabsHighlight?.()
        break
      }
    }

    syncPrevRefs()
  }, [
    useTabbedMultiModelResults,
    visibleConversations,
    streamAnswerStartedByModel,
    streamingReasoningByModel,
    onDismissMobileCapabilityDemoModelTabsHighlight,
  ])

  if (visibleConversations.length === 0) return null

  // Compute breakout animation class from phase
  const getBreakoutClass = () => {
    switch (breakoutPhase) {
      case 'fading-out':
        return 'breakout-fade-out'
      case 'hidden':
        return 'breakout-hidden'
      case 'fading-in':
        return 'breakout-fade-in'
      default:
        return ''
    }
  }

  const formatProcessingTime = (time: number): string => {
    if (time < 1000) {
      return `${time}ms`
    } else if (time < 60000) {
      return `${(time / 1000).toFixed(1)}s`
    } else {
      const minutes = Math.floor(time / 60000)
      const seconds = Math.floor((time % 60000) / 1000)
      return `${minutes}m ${seconds}s`
    }
  }

  if (useTabbedMultiModelResults) {
    const activeConversation = visibleConversations[activeTabIndex]
    const activeModel = allModels.find(m => m.id === activeConversation.modelId)
    const latestMessage = activeConversation.messages[activeConversation.messages.length - 1]
    const hasErrorContent = isErrorMessage(latestMessage?.content)
    const isError = modelErrorStates[activeConversation.modelId] || hasErrorContent
    const activeTab = activeResultTabs[activeConversation.modelId] || RESULT_TAB.FORMATTED

    const goToModelTab = (nextIndex: number) => {
      const n = visibleConversations.length
      if (n < 2 || nextIndex < 0 || nextIndex >= n || nextIndex === activeTabIndex) return
      const direction: 'forward' | 'backward' = nextIndex > activeTabIndex ? 'forward' : 'backward'
      setSlideEnter(direction === 'forward' ? 'from-right' : 'from-left')
      setActiveTabIndex(nextIndex)
      onDismissMobileCapabilityDemoModelTabsHighlight?.()
    }

    const handleSwipeTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length !== 1) {
        swipeTouchStartRef.current = null
        return
      }
      swipeTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        target: e.target,
      }
    }

    const handleSwipeTouchEnd = (e: React.TouchEvent) => {
      const start = swipeTouchStartRef.current
      swipeTouchStartRef.current = null
      if (!start || e.changedTouches.length !== 1) return
      if (shouldSuppressMobileModelTabSwipe(start.target)) return
      const dx = e.changedTouches[0].clientX - start.x
      const dy = e.changedTouches[0].clientY - start.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const threshold = mobileModelTabSwipeThreshold(viewportWidth)
      if (absDx < threshold) return
      /* Require a clearer horizontal intent than a shallow diagonal (avoids conflict with vertical reading). */
      if (absDx < absDy * 1.35) return

      if (dx < 0) {
        goToModelTab(activeTabIndex + 1)
      } else {
        goToModelTab(activeTabIndex - 1)
      }
    }

    const slidePanelClass =
      slideEnter !== 'none'
        ? `results-tab-content-slide results-tab-content-slide--${slideEnter}`
        : 'results-tab-content-slide'

    return (
      <section className={`results-section results-section-tabbed ${className}`.trim()}>
        {metadata && (
          <div className="response-metadata">
            <div className="metadata-item">
              <span className="metadata-label">Models Completed:</span>
              <span className="metadata-value success">{metadata.models_completed}</span>
            </div>
            {metadata.models_failed > 0 && (
              <div className="metadata-item">
                <span className="metadata-label">Models Failed:</span>
                <span className="metadata-value failed">{metadata.models_failed}</span>
              </div>
            )}
            {processingTime && (
              <div className="metadata-item">
                <span className="metadata-label">Processing Time:</span>
                <span className="metadata-value">{formatProcessingTime(processingTime)}</span>
              </div>
            )}
          </div>
        )}

        <div className="results-tabs-container" ref={mobileTabsAttentionScrollRef}>
          <div
            ref={modelTabsHeaderRef}
            className={`results-tabs-header ${
              highlightMobileCapabilityDemoModelTabs
                ? 'results-tabs-header--capability-demo-attention'
                : ''
            }`.trim()}
            role="tablist"
            aria-label="Compared models"
          >
            {visibleConversations.map((conversation, index) => {
              const model = allModels.find(m => m.id === conversation.modelId)
              const isActive = index === activeTabIndex
              const latestMsg = conversation.messages[conversation.messages.length - 1]
              const hasError =
                modelErrorStates[conversation.modelId] || isErrorMessage(latestMsg?.content)

              return (
                <button
                  key={conversation.modelId}
                  ref={el => {
                    modelTabButtonRefs.current[index] = el
                  }}
                  className={`results-tab-button ${isActive ? 'active' : ''}`}
                  onClick={() => goToModelTab(index)}
                  aria-label={`View results for ${model?.name || conversation.modelId}`}
                  aria-selected={isActive}
                  role="tab"
                >
                  <span className="results-tab-name">{model?.name || conversation.modelId}</span>
                  {hasError && (
                    <span className="results-tab-error-indicator" aria-label="Error">
                      ⚠
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {visibleConversations.length > 2 && (
            <div className="results-tab-pager" aria-hidden="true">
              {visibleConversations.map((conv, index) => (
                <span
                  key={conv.modelId}
                  className={`results-tab-pager-dot${index === activeTabIndex ? ' results-tab-pager-dot--active' : ''}`}
                />
              ))}
            </div>
          )}

          <div
            className="results-tab-content results-tab-content--swipe-zone"
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <div key={activeConversation.modelId} className={slidePanelClass}>
              <ResultCard
                modelId={activeConversation.modelId}
                model={activeModel}
                messages={activeConversation.messages}
                activeTab={activeTab}
                isError={isError}
                isProcessing={modelProcessingStates[activeConversation.modelId] || false}
                breakoutClassName={getBreakoutClass()}
                onScreenshot={onScreenshot}
                onCopyResponse={onCopyResponse}
                onClose={onCloseCard}
                onSwitchTab={onSwitchTab}
                onBreakout={onBreakout}
                onHideOthers={onHideOthers}
                onCopyMessage={onCopyMessage}
                showBreakoutButton={visibleConversations.length > 1 && !isError}
                isTutorialActive={isTutorialActive}
                streamingReasoning={getStreamingReasoningForModel(
                  activeConversation.modelId,
                  streamingReasoningByModel
                )}
                streamAnswerStarted={streamAnswerStartedForModel(
                  activeConversation.modelId,
                  streamAnswerStartedByModel
                )}
              />
            </div>
          </div>
        </div>
      </section>
    )
  }

  // Render grid layout for desktop or single card
  return (
    <section className={`results-section ${className}`.trim()}>
      {metadata && (
        <div className="response-metadata">
          <div className="metadata-item">
            <span className="metadata-label">Models Completed:</span>
            <span className="metadata-value success">{metadata.models_completed}</span>
          </div>
          {metadata.models_failed > 0 && (
            <div className="metadata-item">
              <span className="metadata-label">Models Failed:</span>
              <span className="metadata-value failed">{metadata.models_failed}</span>
            </div>
          )}
          {processingTime && (
            <div className="metadata-item">
              <span className="metadata-label">Processing Time:</span>
              <span className="metadata-value">{formatProcessingTime(processingTime)}</span>
            </div>
          )}
        </div>
      )}

      <div className="results-grid">
        {visibleConversations.map(conversation => {
          const model = allModels.find(m => m.id === conversation.modelId)
          const latestMessage = conversation.messages[conversation.messages.length - 1]
          const hasErrorContent = isErrorMessage(latestMessage?.content)
          const isError = modelErrorStates[conversation.modelId] || hasErrorContent
          const activeTab = activeResultTabs[conversation.modelId] || RESULT_TAB.FORMATTED

          return (
            <ResultCard
              key={conversation.modelId}
              modelId={conversation.modelId}
              model={model}
              messages={conversation.messages}
              activeTab={activeTab}
              isError={isError}
              isProcessing={modelProcessingStates[conversation.modelId] || false}
              breakoutClassName={getBreakoutClass()}
              onScreenshot={onScreenshot}
              onCopyResponse={onCopyResponse}
              onClose={onCloseCard}
              onSwitchTab={onSwitchTab}
              onBreakout={onBreakout}
              onHideOthers={onHideOthers}
              onCopyMessage={onCopyMessage}
              showBreakoutButton={visibleConversations.length > 1 && !isError}
              isTutorialActive={isTutorialActive}
              streamingReasoning={getStreamingReasoningForModel(
                conversation.modelId,
                streamingReasoningByModel
              )}
              streamAnswerStarted={streamAnswerStartedForModel(
                conversation.modelId,
                streamAnswerStartedByModel
              )}
            />
          )
        })}
      </div>
    </section>
  )
}

ResultsDisplay.displayName = 'ResultsDisplay'
