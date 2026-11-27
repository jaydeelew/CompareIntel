import Hand from 'lucide-react/dist/esm/icons/hand'
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import {
  RESULT_GRID_LAYOUT_SLACK_PX,
  minResultsHostWidthForGridColumns,
} from '../../config/constants'
import { useResponsive } from '../../hooks'
import { RESULT_TAB, createModelId } from '../../types'
import type { ModelConversation, ActiveResultTabs, ResultTab } from '../../types'
import { isErrorMessage } from '../../utils/error'
import { shouldSuppressMobileModelTabSwipe } from '../../utils/mobileModelTabSwipe'
import {
  modelDisplayLabel,
  partitionAgainstKnownModels,
  retiredFollowUpNotice,
} from '../../utils/retiredConversationModels'

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

function modelIsProcessing(
  modelId: string,
  modelProcessingStates: Record<string, boolean>
): boolean {
  if (modelProcessingStates[modelId]) return true
  const target = createModelId(modelId)
  for (const [k, v] of Object.entries(modelProcessingStates)) {
    if (!v) continue
    if (createModelId(k) === target) return true
  }
  return false
}

/** Tab strip: show spinner while this model is still processing (including before the first token). */
function modelTabIsStillStreaming(
  conversation: ModelConversation,
  modelProcessingStates: Record<string, boolean>
): boolean {
  return modelIsProcessing(conversation.modelId, modelProcessingStates)
}

/** Duration aligned with `.results-tab-content-slide--*` CSS in results.css (fallback if `animationend` does not fire). */
const MODEL_TAB_SLIDE_ANIM_MS = 480

const pagerGapSize = new WeakMap<HTMLElement, { message: number; conversation: number }>()

/**
 * Bottom of the response box the reader can see, ignoring transforms that
 * are still running. `.conversation-message` fades in with translateY, and
 * that moves the box toward the pager for 0.3s without a resize event.
 * A tall reply also scrolls inside `.conversation-content`, so the message
 * border can sit below that clip.
 */
function visibleResponseBottom(message: HTMLElement, boundary: HTMLElement): number {
  let bottom = message.getBoundingClientRect().bottom
  let node: HTMLElement | null = message
  while (node) {
    const transform = getComputedStyle(node).transform
    if (transform && transform !== 'none') {
      bottom -= new DOMMatrixReadOnly(transform).m42
    }
    if (node === boundary) break
    node = node.parentElement
  }
  const conversation = message.closest('.conversation-content')
  if (!(conversation instanceof HTMLElement)) return bottom
  return Math.min(bottom, conversation.getBoundingClientRect().bottom)
}

function clearMobilePagerGap(inner: HTMLElement): void {
  pagerGapSize.delete(inner)
  inner.style.paddingBottom = ''
  const tabs = inner.querySelector('.results-tabs-container')
  if (tabs instanceof HTMLElement) tabs.style.marginBottom = ''
  const outer = inner.parentElement?.closest('.results-section')
  if (outer instanceof HTMLElement && outer !== inner) outer.style.paddingBottom = ''
}

/**
 * The gap above the pager is whatever sits between the response box and the
 * buttons (conversation padding plus the pager's top margin). Chrome and
 * WebKit resolve that flex padding differently, so a fixed bottom padding
 * cannot match both. Measure it and give the inner card the same amount
 * under the pager, after the stacked mobile spacers are removed.
 */
function equalizeMobilePagerGap(inner: HTMLElement): void {
  const outer = inner.parentElement?.closest('.results-section')
  const tabs = inner.querySelector('.results-tabs-container')
  const pager = inner.querySelector('.results-model-pager')
  const messages = inner.querySelectorAll('.message-content')
  const message = messages[messages.length - 1]
  if (
    !(outer instanceof HTMLElement) ||
    outer === inner ||
    !(pager instanceof HTMLElement) ||
    !(message instanceof HTMLElement)
  ) {
    clearMobilePagerGap(inner)
    return
  }

  if (tabs instanceof HTMLElement) tabs.style.marginBottom = '0px'
  outer.style.paddingBottom = '0px'

  const conversation = message.closest('.conversation-content')
  const messageHeight = message.getBoundingClientRect().height
  const conversationHeight =
    conversation instanceof HTMLElement ? conversation.getBoundingClientRect().height : 0
  const previous = pagerGapSize.get(inner)
  // Scrolling the page does not change these heights, but it does change the
  // rects. Rewriting padding from that noise moves the composer while a
  // tutorial cutout is mid-scroll.
  if (
    previous &&
    Math.abs(previous.message - messageHeight) < 1 &&
    Math.abs(previous.conversation - conversationHeight) < 1
  ) {
    return
  }

  const above = pager.getBoundingClientRect().top - visibleResponseBottom(message, inner)
  const below = outer.getBoundingClientRect().bottom - pager.getBoundingClientRect().bottom
  const delta = below - above
  if (!Number.isFinite(delta)) return
  if (Math.abs(delta) <= 0.5) {
    pagerGapSize.set(inner, { message: messageHeight, conversation: conversationHeight })
    return
  }

  const current = parseFloat(getComputedStyle(inner).paddingBottom) || 0
  const next = Math.max(0, current - delta)
  if (Math.abs(next - current) <= 0.5) {
    pagerGapSize.set(inner, { message: messageHeight, conversation: conversationHeight })
    return
  }
  inner.style.paddingBottom = `${Math.round(next * 100) / 100}px`
  pagerGapSize.set(inner, { message: messageHeight, conversation: conversationHeight })
}

/** Min horizontal swipe (px); scales slightly with viewport. */
function mobileModelTabSwipeThreshold(width: number): number {
  return Math.max(64, Math.min(104, Math.round(width * 0.14)))
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

function pointerOnModelPager(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.results-model-pager'))
}

/** Pill under the card header. The response body is never a safe place for this hint. */
function MobileModelSwipeHint() {
  return (
    <div className="results-tab-swipe-hint" data-testid="results-tab-swipe-hint" role="note">
      <span className="results-tab-swipe-hint-hand" aria-hidden="true">
        <Hand strokeWidth={1.75} className="results-tab-swipe-hint-hand-icon" aria-hidden />
      </span>
      <span className="results-tab-swipe-hint-label">Swipe or tap ‹ › to switch models</span>
    </div>
  )
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
  /** Bumps whenever guided tutorial starts (finger-swipe hint resets until first swipe). */
  tutorialSwipeHintNonce?: number
  /** Bumps when a capability “Try a comparison” run finishes with tabbed multi-model results. */
  capabilitySwipeHintNonce?: number
  /** True while a comparison is in flight (drives model-tab auto-focus). */
  isComparisonLoading?: boolean
  /** Web search was enabled for the active comparison session. */
  webSearchEnabled?: boolean
}

type TabChangeSource = 'swipe-touch' | 'tab-click' | 'programmatic'

// Grid when the results host fits ≥2 columns at min track width (else model-name tabs); grid caps at 3 columns in CSS.
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
  tutorialSwipeHintNonce = 0,
  capabilitySwipeHintNonce = 0,
  isComparisonLoading = false,
  webSearchEnabled = false,
}) => {
  const visibleConversations = useMemo(
    () => conversations.filter(conv => Boolean(conv?.modelId) && !closedCards.has(conv.modelId)),
    [conversations, closedCards]
  )

  const retiredPartition = useMemo(() => {
    const knownModels = allModels.length > 0 ? allModels : null
    return partitionAgainstKnownModels(
      conversations.map(conversation => String(conversation.modelId)),
      knownModels
    )
  }, [allModels, conversations])

  const retiredModelIds = useMemo(
    () => new Set(retiredPartition.removed),
    [retiredPartition.removed]
  )

  const labelForModel = (modelId: string, storedName?: string | null) =>
    modelDisplayLabel(modelId, allModels.length > 0 ? allModels : null, storedName)

  const retiredNotice = useMemo(() => {
    if (!retiredPartition.catalogReady || retiredPartition.removed.length === 0) return null
    const labels = retiredPartition.removed.map(modelId => {
      const storedName = conversations.find(
        conversation => String(conversation.modelId) === modelId
      )?.modelName
      return modelDisplayLabel(modelId, allModels, storedName)
    })
    return retiredFollowUpNotice(labels, retiredPartition.available.length)
  }, [allModels, conversations, retiredPartition])

  const sectionRef = useRef<HTMLElement | null>(null)
  const [layoutContentWidth, setLayoutContentWidth] = useState(0)
  const { viewportWidth, isMobileLayout } = useResponsive()

  const minWidthForTwoGridColumns = minResultsHostWidthForGridColumns(2)
  const layoutHostWidth =
    layoutContentWidth > 0
      ? layoutContentWidth
      : Math.max(0, viewportWidth - RESULT_GRID_LAYOUT_SLACK_PX)
  const useTabbedMultiModelResults =
    visibleConversations.length > 1 &&
    (isMobileLayout || layoutHostWidth < minWidthForTwoGridColumns)

  useLayoutEffect(() => {
    if (visibleConversations.length === 0) {
      setLayoutContentWidth(0)
      return
    }

    const el = sectionRef.current
    if (!el) return

    const measure = () => {
      const cs = getComputedStyle(el)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      setLayoutContentWidth(Math.max(0, el.clientWidth - padX))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [visibleConversations.length, viewportWidth])

  /**
   * Active model tab index in tabbed layout. `-1` = no card selected yet (awaiting first stream
   * or immediate completion) after a new comparison starts.
   */
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)
  /** Slide-in direction for tab changes; `'none'` = initial / no animation. */
  const [slideEnter, setSlideEnter] = useState<'none' | 'from-right' | 'from-left'>('none')
  const [tutorialFingerSwipeDismissed, setTutorialFingerSwipeDismissed] = useState(false)
  const [capabilityFingerSwipeDismissed, setCapabilityFingerSwipeDismissed] = useState(false)
  const mobileTabsAttentionScrollRef = useRef<HTMLDivElement>(null)
  const modelTabsHeaderRef = useRef<HTMLDivElement>(null)
  const modelTabButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const resultsTabSwipeZoneRef = useRef<HTMLDivElement>(null)
  const swipeTouchStartRef = useRef<{
    x: number
    y: number
    lastX: number
    lastY: number
    suppress: boolean
    /** Fires if Chrome drops touchend after the node under the finger is replaced. */
    fallback?: ReturnType<typeof window.setTimeout>
  } | null>(null)
  const goToModelTabRef = useRef<(nextIndex: number, source?: TabChangeSource) => void>(() => {})
  const activeTabIndexRef = useRef(activeTabIndex)
  const viewportWidthRef = useRef(viewportWidth)
  /** Mobile tabbed UI: first model to emit answer/reasoning tokens this round (pin resets when answer-started map clears). */
  const firstMobileStreamerPinnedRef = useRef<string | null>(null)
  const prevStreamAnswerStartedRef = useRef<Record<string, boolean>>({})
  const prevStreamingReasoningNonemptyRef = useRef<Record<string, boolean>>({})
  const prevIsComparisonLoadingRef = useRef(false)
  /** After the first model finishes processing this run, auto-focus runs at most once. */
  const firstCompleterFocusedRef = useRef(false)
  const prevProcessingByModelRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    setTutorialFingerSwipeDismissed(false)
  }, [tutorialSwipeHintNonce])

  useEffect(() => {
    setCapabilityFingerSwipeDismissed(false)
  }, [capabilitySwipeHintNonce])

  useEffect(() => {
    const wasLoading = prevIsComparisonLoadingRef.current
    prevIsComparisonLoadingRef.current = isComparisonLoading

    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return

    if (isComparisonLoading && !wasLoading) {
      setActiveTabIndex(-1)
      setSlideEnter('none')
      firstCompleterFocusedRef.current = false
      firstMobileStreamerPinnedRef.current = null
      prevStreamAnswerStartedRef.current = {}
      prevStreamingReasoningNonemptyRef.current = {}
      prevProcessingByModelRef.current = {}
    }
  }, [isComparisonLoading, useTabbedMultiModelResults, visibleConversations.length])

  // If automation left no selection after loading ends, fall back to the first tab.
  useEffect(() => {
    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return
    if (!isComparisonLoading && activeTabIndex < 0) {
      setActiveTabIndex(0)
    }
  }, [useTabbedMultiModelResults, visibleConversations.length, isComparisonLoading, activeTabIndex])

  // Reset active tab index if it's out of bounds
  useEffect(() => {
    if (visibleConversations.length === 0) return
    if (activeTabIndex >= visibleConversations.length) {
      setActiveTabIndex(Math.max(0, visibleConversations.length - 1))
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

  /** Auto-focus the first model tab that finishes processing (once per comparison run). */
  useEffect(() => {
    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return

    const completionAutomationAllowed = !firstCompleterFocusedRef.current

    if (completionAutomationAllowed) {
      for (let i = 0; i < visibleConversations.length; i++) {
        const mid = visibleConversations[i].modelId
        const now = modelIsProcessing(mid, modelProcessingStates)
        const prev = prevProcessingByModelRef.current[mid]
        if (prev === true && now === false) {
          firstCompleterFocusedRef.current = true
          if (activeTabIndex >= 0 && i !== activeTabIndex) {
            setSlideEnter(i > activeTabIndex ? 'from-right' : 'from-left')
          } else {
            setSlideEnter('none')
          }
          setActiveTabIndex(i)
          onDismissMobileCapabilityDemoModelTabsHighlight?.()
          break
        }
      }
    }

    for (const conv of visibleConversations) {
      prevProcessingByModelRef.current[conv.modelId] = modelIsProcessing(
        conv.modelId,
        modelProcessingStates
      )
    }
  }, [
    useTabbedMultiModelResults,
    visibleConversations,
    modelProcessingStates,
    activeTabIndex,
    onDismissMobileCapabilityDemoModelTabsHighlight,
  ])

  const goToModelTab = (nextIndex: number, source: TabChangeSource = 'programmatic') => {
    const n = visibleConversations.length
    if (n < 2 || nextIndex < 0 || nextIndex >= n || nextIndex === activeTabIndex) return

    const direction: 'forward' | 'backward' =
      activeTabIndex < 0 || nextIndex > activeTabIndex ? 'forward' : 'backward'

    setSlideEnter(direction === 'forward' ? 'from-right' : 'from-left')
    setActiveTabIndex(nextIndex)
    onDismissMobileCapabilityDemoModelTabsHighlight?.()

    if (source === 'swipe-touch') {
      if (isTutorialActive) {
        setTutorialFingerSwipeDismissed(true)
      } else if (capabilitySwipeHintNonce > 0) {
        setCapabilityFingerSwipeDismissed(true)
      }
    }
  }

  goToModelTabRef.current = goToModelTab
  activeTabIndexRef.current = activeTabIndex
  viewportWidthRef.current = viewportWidth

  useLayoutEffect(() => {
    if (!useTabbedMultiModelResults || visibleConversations.length < 2) return

    const zone = resultsTabSwipeZoneRef.current
    if (!zone) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        swipeTouchStartRef.current = null
        return
      }
      swipeTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        lastX: e.touches[0].clientX,
        lastY: e.touches[0].clientY,
        suppress: shouldSuppressMobileModelTabSwipe(e.target) || pointerOnModelPager(e.target),
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const start = swipeTouchStartRef.current
      if (!start || start.suppress || e.touches.length !== 1) return
      start.lastX = e.touches[0].clientX
      start.lastY = e.touches[0].clientY
      armSwipeReleaseFallback()
    }

    // Replacing the node under the finger (streaming) drops the gesture: touchend
    // often arrives with no changedTouches, or the browser sends touchcancel
    // instead. The last move on window still has the release point.
    const finishSwipe = (release: { x: number; y: number } | null, endGesture: boolean) => {
      const start = swipeTouchStartRef.current
      if (!start || start.suppress) return
      if (start.fallback != null) {
        window.clearTimeout(start.fallback)
        start.fallback = undefined
      }
      const endX = release ? release.x : start.lastX
      const endY = release ? release.y : start.lastY
      const dx = endX - start.x
      const dy = endY - start.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const threshold = mobileModelTabSwipeThreshold(viewportWidthRef.current)
      const horizontal = absDx >= threshold && absDx >= absDy * 1.35
      if (!horizontal) {
        if (endGesture) swipeTouchStartRef.current = null
        return
      }
      swipeTouchStartRef.current = null

      const tabIndex = activeTabIndexRef.current
      if (dx < 0) {
        const next = tabIndex < 0 ? 0 : tabIndex + 1
        goToModelTabRef.current(next, 'swipe-touch')
      } else {
        goToModelTabRef.current(tabIndex - 1, 'swipe-touch')
      }
    }

    // Replacing the formatted renderer (or a streaming node) can drop touchend
    // and touchcancel. Once the drag is already horizontal, commit from the
    // last move if the release never arrives.
    const armSwipeReleaseFallback = () => {
      const start = swipeTouchStartRef.current
      if (!start || start.suppress) return
      if (start.fallback != null) window.clearTimeout(start.fallback)
      start.fallback = window.setTimeout(() => {
        const current = swipeTouchStartRef.current
        if (!current) return
        current.fallback = undefined
        const dx = current.lastX - current.x
        const dy = current.lastY - current.y
        const absDx = Math.abs(dx)
        const threshold = mobileModelTabSwipeThreshold(viewportWidthRef.current)
        // A pause before the drag is horizontal is not a release. Leave the
        // gesture open so the next move can still finish it.
        if (absDx < threshold || absDx < Math.abs(dy) * 1.35) return
        finishSwipe({ x: current.lastX, y: current.lastY }, true)
      }, 120)
    }

    // Chrome drops the rest of a touch sequence (no touchend, no touchcancel)
    // once streaming replaces the node that received touchstart. Capturing the
    // pointer on the zone, which stays mounted, keeps the move and the release.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      // A swipe that starts on wide code, a table, or other horizontal overflow
      // must stay with that element. Capturing the pointer here would take the
      // pan away from the browser, so the block could not scroll.
      if (shouldSuppressMobileModelTabSwipe(e.target) || pointerOnModelPager(e.target)) return
      if (zone.hasPointerCapture(e.pointerId)) return
      try {
        zone.setPointerCapture(e.pointerId)
      } catch {
        // The pointer can already be gone if the hit node was removed this turn.
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      const start = swipeTouchStartRef.current
      if (!start || start.suppress || e.pointerType !== 'touch') return
      start.lastX = e.clientX
      start.lastY = e.clientY
      armSwipeReleaseFallback()
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const start = swipeTouchStartRef.current
      if (!start || start.suppress) return
      start.lastX = e.clientX
      start.lastY = e.clientY
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      const absDx = Math.abs(dx)
      const threshold = mobileModelTabSwipeThreshold(viewportWidthRef.current)
      // A capture boundary can emit pointerup at the press point before the
      // real touchend. Clearing the gesture there drops a swipe that Chrome
      // does still deliver. Only a drag that is already horizontal finishes
      // here, which is the path where touchend never arrives.
      if (absDx < threshold || absDx < Math.abs(dy) * 1.35) return
      finishSwipe({ x: e.clientX, y: e.clientY }, true)
    }

    const onTouchRelease = (e: TouchEvent) => {
      const point = e.changedTouches.length === 1 ? e.changedTouches[0] : null
      finishSwipe(point ? { x: point.clientX, y: point.clientY } : null, e.type === 'touchend')
    }

    zone.addEventListener('touchstart', onTouchStart, { passive: true })
    zone.addEventListener('touchend', onTouchRelease, { passive: true })
    zone.addEventListener('pointerdown', onPointerDown)
    zone.addEventListener('pointermove', onPointerMove)
    zone.addEventListener('pointerup', onPointerUp)
    zone.addEventListener('pointercancel', onPointerUp)
    // Streaming replaces nodes under the finger; detached targets do not bubble to `zone`.
    window.addEventListener('touchmove', onTouchMove, { passive: true, capture: true })
    window.addEventListener('touchend', onTouchRelease, { passive: true })
    window.addEventListener('touchcancel', onTouchRelease, { passive: true })

    return () => {
      const pending = swipeTouchStartRef.current
      if (pending?.fallback != null) {
        window.clearTimeout(pending.fallback)
        pending.fallback = undefined
      }
      zone.removeEventListener('touchstart', onTouchStart)
      zone.removeEventListener('touchend', onTouchRelease)
      zone.removeEventListener('pointerdown', onPointerDown)
      zone.removeEventListener('pointermove', onPointerMove)
      zone.removeEventListener('pointerup', onPointerUp)
      zone.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('touchmove', onTouchMove, { capture: true })
      window.removeEventListener('touchend', onTouchRelease)
      window.removeEventListener('touchcancel', onTouchRelease)
    }
  }, [useTabbedMultiModelResults, visibleConversations.length, modelTabStripKey])

  useLayoutEffect(() => {
    const inner = sectionRef.current
    if (!inner) return
    if (!isMobileLayout || !useTabbedMultiModelResults) {
      clearMobilePagerGap(inner)
      return
    }

    let frame = 0
    const run = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => equalizeMobilePagerGap(inner))
    }
    const observer = new ResizeObserver(run)
    const watch = () => {
      observer.observe(inner)
      inner.querySelectorAll('.conversation-content, .message-content').forEach(node => {
        observer.observe(node)
      })
    }
    watch()
    run()
    // New message nodes and font swaps change the box without resizing the
    // card that the observer was attached to.
    const mutation = new MutationObserver(() => {
      watch()
      run()
    })
    mutation.observe(inner, { childList: true, subtree: true })
    const fontsReady = document.fonts?.ready.then(() => {
      if (!sectionRef.current) return
      watch()
      run()
    })
    return () => {
      cancelAnimationFrame(frame)
      void fontsReady
      mutation.disconnect()
      observer.disconnect()
      clearMobilePagerGap(inner)
    }
  }, [isMobileLayout, useTabbedMultiModelResults, activeTabIndex])

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

  const activeConversation =
    activeTabIndex >= 0 && activeTabIndex < visibleConversations.length
      ? visibleConversations[activeTabIndex]
      : undefined
  const showAwaitingFirstPanel = activeTabIndex < 0

  const activeModel = activeConversation
    ? allModels.find(m => m.id === activeConversation.modelId)
    : undefined
  const latestMessage = activeConversation
    ? activeConversation.messages[activeConversation.messages.length - 1]
    : undefined
  const hasErrorContent = latestMessage ? isErrorMessage(latestMessage.content) : false
  const isError = activeConversation
    ? modelErrorStates[activeConversation.modelId] || hasErrorContent
    : false
  const activeTab = activeConversation
    ? activeResultTabs[activeConversation.modelId] || RESULT_TAB.FORMATTED
    : RESULT_TAB.FORMATTED

  const slidePanelClass =
    slideEnter !== 'none'
      ? `results-tab-content-slide results-tab-content-slide--${slideEnter}`
      : 'results-tab-content-slide'

  const showFingerSwipeTutorialOverlay =
    activeTabIndex >= 0 &&
    !showAwaitingFirstPanel &&
    isTutorialActive &&
    !tutorialFingerSwipeDismissed

  const showFingerSwipeCapabilityDemoOverlay =
    activeTabIndex >= 0 &&
    !showAwaitingFirstPanel &&
    !isTutorialActive &&
    capabilitySwipeHintNonce > 0 &&
    !capabilityFingerSwipeDismissed

  const showFingerSwipeOverlay =
    visibleConversations.length >= 2 &&
    (showFingerSwipeTutorialOverlay || showFingerSwipeCapabilityDemoOverlay)

  const modelCount = visibleConversations.length
  const modelPager =
    useTabbedMultiModelResults && modelCount >= 2 ? (
      <div className="results-model-pager" data-testid="results-model-pager" role="group">
        <button
          type="button"
          className="results-model-pager-button"
          aria-label="Previous model"
          disabled={activeTabIndex <= 0}
          onClick={() => goToModelTab(activeTabIndex - 1, 'tab-click')}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="results-model-pager-position">
          <span aria-hidden="true">
            {Math.max(activeTabIndex, 0) + 1} / {modelCount}
          </span>
          <span className="sr-only">
            Model {Math.max(activeTabIndex, 0) + 1} of {modelCount}
          </span>
        </span>
        <button
          type="button"
          className="results-model-pager-button"
          aria-label="Next model"
          disabled={activeTabIndex < 0 || activeTabIndex >= modelCount - 1}
          onClick={() => goToModelTab(activeTabIndex + 1, 'tab-click')}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    ) : null

  const metadataSection = metadata && (
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
  )

  const sectionSurfaceClass =
    `results-section${useTabbedMultiModelResults ? ' results-section-tabbed' : ''} ${className}`.trim()

  return (
    <section ref={sectionRef} className={sectionSurfaceClass}>
      {metadataSection}

      {retiredNotice && (
        <p className="retired-models-notice" role="status" data-testid="retired-models-notice">
          {retiredNotice}
        </p>
      )}

      {useTabbedMultiModelResults ? (
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
              const retired = retiredModelIds.has(String(conversation.modelId))
              const tabLabel =
                model?.name || labelForModel(conversation.modelId, conversation.modelName)
              const isActive = index === activeTabIndex
              const latestMsg = conversation.messages[conversation.messages.length - 1]
              const hasError =
                modelErrorStates[conversation.modelId] || isErrorMessage(latestMsg?.content)
              const showStreamingIndicator = modelTabIsStillStreaming(
                conversation,
                modelProcessingStates
              )

              return (
                <button
                  key={conversation.modelId}
                  ref={el => {
                    modelTabButtonRefs.current[index] = el
                  }}
                  className={`results-tab-button ${isActive ? 'active' : ''}`}
                  onClick={() => goToModelTab(index, 'tab-click')}
                  aria-label={`View results for ${tabLabel}`}
                  aria-selected={isActive}
                  aria-busy={showStreamingIndicator}
                  role="tab"
                >
                  <span className="results-tab-name">{tabLabel}</span>
                  {retired && <span className="results-tab-retired">Retired</span>}
                  {showStreamingIndicator && (
                    <span
                      className="results-tab-streaming-spinner"
                      aria-hidden="true"
                      title="Still generating"
                    >
                      <span className="modern-spinner results-tab-streaming-spinner-icon" />
                    </span>
                  )}
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
            ref={resultsTabSwipeZoneRef}
            className="results-tab-content results-tab-content--swipe-zone"
          >
            {showAwaitingFirstPanel ? (
              <div key="results-awaiting-first-stream" className={slidePanelClass}>
                <div
                  className="results-tab-awaiting-first-response"
                  role="status"
                  aria-live="polite"
                >
                  <p className="results-tab-awaiting-first-response-message">
                    Waiting for the first response…
                  </p>
                </div>
              </div>
            ) : activeConversation ? (
              <div key={activeConversation.modelId} className={slidePanelClass}>
                <ResultCard
                  modelId={activeConversation.modelId}
                  model={activeModel}
                  displayName={labelForModel(
                    activeConversation.modelId,
                    activeConversation.modelName
                  )}
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
                  swipeHint={showFingerSwipeOverlay ? <MobileModelSwipeHint /> : null}
                  streamingReasoning={getStreamingReasoningForModel(
                    activeConversation.modelId,
                    streamingReasoningByModel
                  )}
                  streamAnswerStarted={streamAnswerStartedForModel(
                    activeConversation.modelId,
                    streamAnswerStartedByModel
                  )}
                  webSearchEnabled={webSearchEnabled}
                  retired={retiredModelIds.has(String(activeConversation.modelId))}
                />
              </div>
            ) : null}
          </div>
          {!showAwaitingFirstPanel && activeConversation ? modelPager : null}
        </div>
      ) : (
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
                displayName={labelForModel(conversation.modelId, conversation.modelName)}
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
                webSearchEnabled={webSearchEnabled}
                retired={retiredModelIds.has(String(conversation.modelId))}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}

ResultsDisplay.displayName = 'ResultsDisplay'
