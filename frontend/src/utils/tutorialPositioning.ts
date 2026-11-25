import { getComposerCutoutRects, getComposerElement } from '../components/tutorial/tutorialUtils'
import { isSingleProviderSpotlightStep } from '../data/tutorialStepPlan'
import type { StepConfig } from '../data/tutorialSteps'
import type { TutorialStep } from '../hooks/useTutorial'

import { isFollowUpComposerReady } from './followUpComposerReady'
import { waitForRectStable } from './tutorialSettle'

export type TutorialProviderLayoutStep = Extract<
  TutorialStep,
  | 'expand-provider'
  | 'expand-starter-provider-2'
  | 'select-models'
  | 'select-starter-model-1'
  | 'select-starter-model-2'
>

export interface RectCutout {
  top: number
  left: number
  width: number
  height: number
}

export interface ButtonCutout {
  top: number
  left: number
  radius: number
}

export interface TargetCutout extends RectCutout {
  borderRadius: number
}

export function computeRectUnion(rects: DOMRect[], padding: number): RectCutout | null {
  if (rects.length === 0) return null
  const minTop = Math.min(...rects.map(r => r.top)) - padding
  const minLeft = Math.min(...rects.map(r => r.left)) - padding
  const maxRight = Math.max(...rects.map(r => r.right)) + padding
  const maxBottom = Math.max(...rects.map(r => r.bottom)) + padding
  return {
    top: minTop,
    left: minLeft,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  }
}

export function computeTextareaCutout(
  composerElement: HTMLElement,
  padding = 8
): RectCutout | null {
  const rects = getComposerCutoutRects(composerElement)
  return computeRectUnion(rects, padding)
}

export function computeDropdownCutout(
  composerElement: HTMLElement,
  dropdownElement: HTMLElement | null,
  padding = 8
): RectCutout | null {
  // Use same rects as computeTextareaCutout (step 3) for consistent cutout size
  const cutoutRects = getComposerCutoutRects(composerElement)
  const allRects: DOMRect[] = [...cutoutRects]
  if (dropdownElement) {
    allRects.push(dropdownElement.getBoundingClientRect())
  }
  return computeRectUnion(allRects, padding)
}

/**
 * Unpadded composer frame shared by the history step and the saved-selections
 * step: input + toolbar, plus the open history list or saved-selections panel.
 * Both steps draw the same ring from this box. The panel grows the frame
 * downward; it does not move the frame's top.
 */
export function readHistoryComposerFrame(): RectCutout | null {
  const composer = getComposerElement()
  if (!composer) return null
  const rects = getComposerCutoutRects(composer)
  const list = composer.querySelector('.history-inline-list, .saved-selections-dropdown')
  if (list) rects.push(list.getBoundingClientRect())
  return computeRectUnion(rects, 0)
}

/** Blue frame for the last tutorial step: the visible bookmark button, plus its panel once open. */
export function computeSavedSelectionCutout(padding = 8): RectCutout | null {
  const frame = readSavedSelectionSpotlightRect(getComposerElement())
  if (!frame) return null
  return {
    top: frame.top - padding,
    left: frame.left - padding,
    width: frame.width + padding * 2,
    height: frame.height + padding * 2,
  }
}

function readSavedSelectionSpotlightRect(composer: HTMLElement | null): DOMRect | null {
  if (!composer) return null
  const button = composer.querySelector('.saved-selections-button')
  if (!button) return null
  const rects = [button.getBoundingClientRect()]
  const panel = composer.querySelector('.saved-selections-dropdown')
  if (panel) rects.push(panel.getBoundingClientRect())
  return unionViewportRects(rects)
}

export function computeButtonCutout(buttonElement: HTMLElement): ButtonCutout {
  const rect = buttonElement.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const radius = Math.max(rect.width, rect.height) / 2 + 2
  return { top: centerY, left: centerX, radius }
}

export function computeTargetCutout(
  elements: HTMLElement[],
  padding: number,
  borderRadius: number
): TargetCutout | null {
  if (elements.length === 0) return null
  let minTop = Infinity
  let minLeft = Infinity
  let maxRight = -Infinity
  let maxBottom = -Infinity
  elements.forEach(el => {
    const rect = el.getBoundingClientRect()
    minTop = Math.min(minTop, rect.top)
    minLeft = Math.min(minLeft, rect.left)
    maxRight = Math.max(maxRight, rect.right)
    maxBottom = Math.max(maxBottom, rect.bottom)
  })
  if (minTop === Infinity) return null
  return {
    top: minTop - padding,
    left: minLeft - padding,
    width: maxRight - minLeft + padding * 2,
    height: maxBottom - minTop + padding * 2,
    borderRadius,
  }
}

const TOOLTIP_HEIGHT_SMALL = 160
const TOOLTIP_HEIGHT_LARGE = 210
const MARGIN = 12
/** Blue frame sits this far outside the highlighted element on both overlays. */
export const TUTORIAL_FRAME_OUTSET_PX = 8
export const DESKTOP_TUTORIAL_ARROW_PX = 8
export const MOBILE_TUTORIAL_ARROW_PX = 10

/**
 * Main page content scrolls in `.app` (see base.css); `window` scroll is often 0.
 * Tutorial scroll and document-Y cutout math must use this root.
 */
function tutorialPageScroller(): HTMLElement {
  const app = document.querySelector('.app') as HTMLElement | null
  if (app && app.scrollHeight > app.clientHeight + 1) return app
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function getTutorialScrollRoot(): {
  getScrollTop: () => number
  scrollToTop: (top: number, behavior?: ScrollBehavior) => void
} {
  const scroller = tutorialPageScroller()
  return {
    getScrollTop: () => scroller.scrollTop,
    scrollToTop: (top, behavior = 'auto') => {
      scroller.scrollTo({ top, left: 0, behavior })
    },
  }
}

export function getTutorialScrollMax(): number {
  const scroller = tutorialPageScroller()
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
}

/** Scroll an element using the real page scroll root (`.app`), not `scrollIntoView` (window quirks). */
export function scrollTutorialElementToViewportY(
  element: HTMLElement,
  desiredTopInViewportPx: number
): void {
  const root = getTutorialScrollRoot()
  const rect = element.getBoundingClientRect()
  const y0 = root.getScrollTop()
  const maxScroll = getTutorialScrollMax()
  const nextTop = Math.max(0, Math.min(y0 + rect.top - desiredTopInViewportPx, maxScroll))
  root.scrollToTop(nextTop, 'auto')
}

function tutorialTooltipCoversContent(node: Element): boolean {
  if (!(node instanceof HTMLElement)) return false
  const style = getComputedStyle(node)
  if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none')
    return false
  const box = node.getBoundingClientRect()
  return box.height > 2 && box.width > 2
}

/**
 * Viewport Y for the top of the streaming results card.
 * Sits under the sticky header. A visible desktop card also keeps the room the
 * review tooltip uses; the mobile card is hidden during this handoff.
 */
export function streamingResultsTopInViewport(): number {
  const visualTop = window.visualViewport?.offsetTop ?? 0
  const header = document.querySelector('.app-header-shell')
  const headerBottom =
    header instanceof HTMLElement ? header.getBoundingClientRect().bottom : visualTop
  let cover = Math.max(visualTop, headerBottom)
  const desktopTip = document.querySelector('.tutorial-tooltip')
  if (window.innerWidth > 768 && desktopTip && tutorialTooltipCoversContent(desktopTip)) {
    cover = Math.max(cover, desktopResultsTooltipMinTop() - 12)
  }
  const mobileTip = document.querySelector('.mobile-tutorial-tooltip')
  if (mobileTip && tutorialTooltipCoversContent(mobileTip)) {
    const bottom = mobileTip.getBoundingClientRect().bottom
    if (bottom > cover && mobileTip.getBoundingClientRect().top < cover + 220) {
      cover = bottom
    }
  }
  return cover + 12
}

/**
 * Center a highlight in the viewport. A target taller than the screen pins its top
 * just inside the viewport so the framed area still starts on screen.
 * Instant scroll: the tooltip stays hidden until this finishes, and a smooth scroll
 * plus the fade timer is clamped on Mobile Safari.
 */
/**
 * How far to scroll the below-results composer on step 7.
 * Mobile (tooltip below) only moves when the composer does not have room under it,
 * which is what kept that composer and the results on screen before the transition work.
 * Desktop parks the composer just under the tooltip. Positive scrolls content up.
 * The hero composer is not a target: passing its box scrolls the results off the bottom.
 */
export function followUpScrollDelta(args: {
  composerTop: number
  composerBottom: number
  viewportHeight: number
  tooltipHeight: number
  arrowSize: number
  preferred: 'above' | 'below'
  padding?: number
}): number {
  const padding = args.padding ?? 12
  const gap = 8
  if (args.preferred === 'below') {
    const needBelow = args.tooltipHeight + args.arrowSize + gap + padding
    const spaceBelow = args.viewportHeight - args.composerBottom
    if (spaceBelow < needBelow) return needBelow - spaceBelow
    if (args.composerTop < padding) return args.composerTop - padding
    return 0
  }
  // Desktop, pre-transition: TOP_MARGIN 80 + tooltip offset 16 + estimated tooltip 210.
  return args.composerTop - 306
}

export function scrollTutorialRectToCenter(
  rect: { top: number; height: number },
  minTopPx?: number,
  viewport?: { top?: number; height: number }
): void {
  const root = getTutorialScrollRoot()
  const viewTop = viewport?.top ?? 0
  const viewH = viewport?.height ?? window.innerHeight
  const y0 = root.getScrollTop()
  const maxScroll = getTutorialScrollMax()
  const margin = 16
  const minTop = minTopPx ?? viewTop + margin
  const desiredTop =
    rect.height >= viewH - margin * 2
      ? minTop
      : Math.max(minTop, viewTop + (viewH - rect.height) / 2)
  const nextTop = Math.max(0, Math.min(y0 + rect.top - desiredTop, maxScroll))
  if (Math.abs(nextTop - y0) < 1) return
  root.scrollToTop(nextTop, 'auto')
}

const SCROLL_TAIL_ATTR = 'data-tutorial-scroll-tail'

/**
 * History and saved selections sit at the end of the page. Extra padding lets
 * scrollTutorialRectToCenter place them in the vertical middle, the same way
 * earlier steps center a target that still has room below it.
 */
export function ensureTutorialScrollTail(
  rect: { top: number; height: number },
  viewport?: { top?: number; height: number }
): void {
  const scroller = tutorialPageScroller()
  const viewTop = viewport?.top ?? 0
  const viewH = viewport?.height ?? window.innerHeight
  const margin = 16
  const desiredTop =
    rect.height >= viewH - margin * 2
      ? viewTop + margin
      : Math.max(viewTop + margin, viewTop + (viewH - rect.height) / 2)
  const existing = Number(scroller.getAttribute(SCROLL_TAIL_ATTR) || '0')
  const documentTop = scroller.scrollTop + rect.top
  const desiredScroll = documentTop - desiredTop
  const maxWithoutTail = Math.max(0, scroller.scrollHeight - existing - scroller.clientHeight)
  const next = Math.max(0, Math.ceil(desiredScroll - maxWithoutTail))
  if (next <= 0) {
    if (existing > 0) clearTutorialScrollTail()
    return
  }
  if (Math.abs(next - existing) < 1) return
  scroller.setAttribute(SCROLL_TAIL_ATTR, String(next))
  scroller.style.paddingBottom = `${next}px`
}

export function clearTutorialScrollTail(): void {
  const nodes = new Set<HTMLElement>()
  nodes.add(tutorialPageScroller())
  const app = document.querySelector('.app')
  if (app instanceof HTMLElement) nodes.add(app)
  for (const node of nodes) {
    if (!node.hasAttribute(SCROLL_TAIL_ATTR)) continue
    node.style.paddingBottom = ''
    node.removeAttribute(SCROLL_TAIL_ATTR)
  }
}

export function centerTutorialStepRect(
  step: string,
  rect: { top: number; height: number },
  minTopPx?: number,
  viewport?: { top?: number; height: number }
): void {
  if (step === 'history-dropdown' || step === 'save-selection') {
    ensureTutorialScrollTail(rect, viewport)
  }
  scrollTutorialRectToCenter(rect, minTopPx, viewport)
}

export interface TooltipBoxPlacement {
  /** Viewport Y of the tooltip box's top edge. */
  top: number
  /** `down` when the tooltip sits above the frame (arrow points at the frame). */
  arrowDirection: 'up' | 'down'
}

/**
 * Place the tooltip so its arrow tip meets the framed highlight.
 * The frame edges already include the cutout outset. No viewport clamp: clamping
 * is what left the card on a screen edge while the arrow pointed at nothing.
 */
export function placeTooltipBoxAgainstFrame(args: {
  frameTop: number
  frameBottom: number
  tooltipHeight: number
  arrowSize: number
  viewportHeight: number
  padding?: number
  preferred: 'above' | 'below'
  /** Keep the requested side. Follow-up uses this so the card does not flip onto the results. */
  lockSide?: boolean
}): TooltipBoxPlacement {
  const padding = args.padding ?? MARGIN
  const need = args.tooltipHeight + args.arrowSize
  const roomAbove = args.frameTop - padding
  const roomBelow = args.viewportHeight - padding - args.frameBottom
  const aboveFits = roomAbove >= need
  const belowFits = roomBelow >= need
  let above = args.preferred === 'above'
  if (!args.lockSide) {
    if (above && !aboveFits && belowFits) above = false
    else if (!above && !belowFits && aboveFits) above = true
    else if (!aboveFits && !belowFits) above = roomAbove >= roomBelow
  }

  if (above) {
    return {
      top: args.frameTop - args.tooltipHeight - args.arrowSize,
      arrowDirection: 'down',
    }
  }
  return {
    top: args.frameBottom + args.arrowSize,
    arrowDirection: 'up',
  }
}

/**
 * Scroll delta that gives the preferred side enough room for the tooltip.
 * Zero when either side already fits — placement will use that side.
 * Positive delta scrolls content up (the frame moves up).
 */
export function scrollDeltaToFitTooltip(args: {
  frameTop: number
  frameBottom: number
  tooltipHeight: number
  arrowSize: number
  viewportHeight: number
  padding?: number
  preferred: 'above' | 'below'
}): number {
  const padding = args.padding ?? MARGIN
  const need = args.tooltipHeight + args.arrowSize + padding
  const roomAbove = args.frameTop
  const roomBelow = args.viewportHeight - args.frameBottom
  const aboveFits = roomAbove >= need
  const belowFits = roomBelow >= need
  if (aboveFits || belowFits) return 0
  if (roomAbove >= roomBelow) return -(need - roomAbove)
  return need - roomBelow
}

function unionViewportRects(rects: DOMRect[]): DOMRect | null {
  const visible = rects.filter(rect => rect.width > 1 && rect.height > 1)
  if (visible.length === 0) return null
  const top = Math.min(...visible.map(rect => rect.top))
  const left = Math.min(...visible.map(rect => rect.left))
  const right = Math.max(...visible.map(rect => rect.right))
  const bottom = Math.max(...visible.map(rect => rect.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

export function elementHasSpotlightBox(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 2 && rect.height > 2
}

/**
 * Processing panel until the first streamed answer token, then Comparison Results.
 * An empty results card is on screen as soon as the request starts; it must not
 * take the spotlight while the loading panel is still the only feedback.
 */
export function readStreamingComparisonSpotlight(streamAnswerStarted: boolean): {
  kind: 'loading' | 'results'
  element: HTMLElement
} | null {
  const loading = document.querySelector('.loading-section')
  const results = document.querySelector('.results-section')
  if (!streamAnswerStarted && elementHasSpotlightBox(loading)) {
    return { kind: 'loading', element: loading }
  }
  if (elementHasSpotlightBox(results)) return { kind: 'results', element: results }
  if (elementHasSpotlightBox(loading)) return { kind: 'loading', element: loading }
  return null
}

function paintTutorialSpotlight(el: HTMLElement | null, on: boolean): void {
  if (!el) return
  if (on) {
    el.classList.add('tutorial-highlight')
    el.style.pointerEvents = 'auto'
    el.style.position = 'relative'
    return
  }
  el.classList.remove('tutorial-highlight')
  el.style.pointerEvents = ''
  el.style.position = ''
}

/** Exclusive desktop highlight: loading panel or results, never both. */
export function applyStreamingComparisonHighlight(
  streamAnswerStarted: boolean
): 'loading' | 'results' | null {
  const loading = document.querySelector('.loading-section')
  const results = document.querySelector('.results-section')
  const spot = readStreamingComparisonSpotlight(streamAnswerStarted)
  if (!spot) return null
  paintTutorialSpotlight(loading instanceof HTMLElement ? loading : null, spot.kind === 'loading')
  paintTutorialSpotlight(results instanceof HTMLElement ? results : null, spot.kind === 'results')
  return spot.kind
}

/**
 * Step 7's follow-up request uses the same processing-then-results spotlight as
 * the first comparison. The first comparison can still be loading when step 7
 * opens; that tail is not this round. Once a new request starts, the round
 * stays active until the step changes so the results pin survives the first token.
 */
export function advanceFollowUpStreamingRound(state: {
  step: string | null
  loading: boolean
  followUpSubmitStarted: boolean
  streamAnswerStarted: boolean
  sawIdle: boolean
  round: boolean
}): { sawIdle: boolean; round: boolean; startedRound: boolean } {
  if (state.step !== 'follow-up') {
    return { sawIdle: false, round: false, startedRound: false }
  }
  const sawIdle = state.sawIdle || (!state.loading && !state.followUpSubmitStarted)
  const rising = state.loading && (state.followUpSubmitStarted || sawIdle)
  // Cancel before any token: release the round so the composer can seat again.
  // A finished stream keeps streamAnswerStarted, so the results pin stays up
  // until the step changes.
  const round = (state.round || rising) && (state.loading || state.streamAnswerStarted || rising)
  return {
    sawIdle,
    round,
    startedRound: rising && !state.round,
  }
}

/**
 * The element box the blue frame is drawn around. Tooltip placement and scroll
 * centering both use this so the arrow meets the highlight the user sees.
 */
export function readTutorialSpotlightRect(
  step: TutorialStep,
  providerNames: readonly string[]
): DOMRect | null {
  if (
    step === 'expand-provider' ||
    step === 'expand-starter-provider-2' ||
    step === 'select-models' ||
    step === 'select-starter-model-1' ||
    step === 'select-starter-model-2'
  ) {
    return getTutorialProviderStepLayout(scrollLayoutForTutorialStep(step), providerNames)
      .layoutRect
  }

  if (
    step === 'enter-prompt' ||
    step === 'enter-prompt-2' ||
    step === 'submit-comparison' ||
    step === 'submit-comparison-2' ||
    step === 'follow-up' ||
    step === 'history-dropdown' ||
    step === 'save-selection'
  ) {
    if (step === 'follow-up') {
      const portaled = document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) as HTMLElement | null
      if (!portaled) return null
      const portaledRect = portaled.getBoundingClientRect()
      return portaledRect.width > 1 && portaledRect.height > 1 ? portaledRect : null
    }
    const composer = getComposerElement()
    if (!composer) return null
    const parts = getComposerCutoutRects(composer)
    // History and saved selections share one composer frame, so the arrow meets
    // the same ring on both steps. An open history list or saved-selections
    // panel grows that ring downward.
    if (step === 'history-dropdown' || step === 'save-selection') {
      const panel = composer.querySelector('.history-inline-list, .saved-selections-dropdown')
      if (panel) parts.push(panel.getBoundingClientRect())
    }
    return unionViewportRects(parts)
  }

  if (step === 'view-follow-up-results') {
    const section = document.querySelector('.results-section') as HTMLElement | null
    return section?.getBoundingClientRect() ?? null
  }

  return null
}

const AFTER_RESULTS_COMPOSER_SLOT = '[data-after-results-composer-slot]'
const PORTALED_FOLLOW_UP_COMPOSER = `${AFTER_RESULTS_COMPOSER_SLOT} .composer:not(.composer-placeholder)`

/** Interactive follow-up composer, once it has portaled below the results. */
export function readPortaledFollowUpComposerRect(): DOMRect | null {
  const el = document.querySelector(PORTALED_FOLLOW_UP_COMPOSER) as HTMLElement | null
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  return rect
}

export interface FollowUpScrollOptions {
  tooltipHeight: number
  arrowSize: number
  preferred: 'above' | 'below'
}

/** The height the user can actually see. On iPhone, the visual viewport is shorter than layout. */
export function visibleViewportHeight(): number {
  if (typeof window === 'undefined') return 0
  const layout = window.innerHeight
  const visual = window.visualViewport?.height
  if (visual == null || visual <= 0) return layout
  return Math.min(layout, visual)
}

/** Layout-viewport box the user can see. `top` is visualViewport.offsetTop. */
export function readVisualViewportBox(): { top: number; height: number } {
  if (typeof window === 'undefined') return { top: 0, height: 0 }
  return {
    top: window.visualViewport?.offsetTop ?? 0,
    height: visibleViewportHeight(),
  }
}

/**
 * Keep a tooltip box inside the visible viewport. Placement still prefers the
 * arrow against the highlight; this only pulls a box back in when that seat
 * would sit under the browser chrome or past the screen edge.
 */
export function clampTooltipTop(args: {
  top: number
  height: number
  viewportTop: number
  viewportHeight: number
  padding?: number
}): number {
  const padding = args.padding ?? MARGIN
  if (!(args.height > 0)) return args.top
  const min = args.viewportTop + padding
  const max = args.viewportTop + args.viewportHeight - args.height - padding
  if (max < min) return min
  return Math.min(Math.max(args.top, min), max)
}

export interface HistoryPairScrollArgs {
  composerTop: number
  composerHeight: number
  tooltipHeight: number
  arrowSize: number
  viewportTop: number
  viewportHeight: number
}

/**
 * How far the history composer must move up so the tooltip (above it) and the
 * composer share the visual viewport's vertical middle.
 * Positive means move the composer up.
 */
export function historyPairScrollDelta(args: HistoryPairScrollArgs): number {
  const above = args.tooltipHeight + args.arrowSize
  const viewCenter = args.viewportTop + args.viewportHeight / 2
  const desiredTop = viewCenter - (args.composerHeight - above) / 2
  return args.composerTop - desiredTop
}

const HISTORY_LIFT_ATTR = 'data-tutorial-history-lift'

export function readHistoryComposerLift(composer: HTMLElement): number {
  const value = Number(composer.getAttribute(HISTORY_LIFT_ATTR) || '0')
  return Number.isFinite(value) ? value : 0
}

/** Shift the composer with the CSS `translate` property so the float animation name stays put. */
export function setHistoryComposerLift(composer: HTMLElement, translateY: number): void {
  const next = Math.round(translateY)
  if (Math.abs(next) < 1) {
    clearHistoryComposerLift(composer)
    return
  }
  composer.setAttribute(HISTORY_LIFT_ATTR, String(next))
  composer.style.translate = `0 ${next}px`
}

export function clearHistoryComposerLift(composer?: HTMLElement | null): void {
  const nodes: Element[] = composer
    ? [composer]
    : Array.from(document.querySelectorAll(`[${HISTORY_LIFT_ATTR}]`))
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    node.style.translate = ''
    node.removeAttribute(HISTORY_LIFT_ATTR)
  }
}

/**
 * Scroll the history composer until the tooltip+composer pair is centered in the
 * visual viewport. Returns the leftover upward pixels when scroll cannot finish
 * the move (a fixed composer, or no scroll room). Callers apply that leftover
 * with setHistoryComposerLift.
 */
export function scrollHistoryComposerPair(args: {
  composer: HTMLElement
  tooltipHeight: number
  arrowSize: number
}): number {
  const view = readVisualViewportBox()
  const measureDelta = () => {
    const rect = args.composer.getBoundingClientRect()
    return historyPairScrollDelta({
      composerTop: rect.top,
      composerHeight: rect.height,
      tooltipHeight: args.tooltipHeight,
      arrowSize: args.arrowSize,
      viewportTop: view.top,
      viewportHeight: view.height,
    })
  }
  const rect = args.composer.getBoundingClientRect()
  const above = args.tooltipHeight + args.arrowSize
  ensureTutorialScrollTail({ top: rect.top - above, height: rect.height + above }, view)
  const before = args.composer.getBoundingClientRect().top
  const delta = measureDelta()
  if (Math.abs(delta) >= 1) {
    const root = getTutorialScrollRoot()
    const start = root.getScrollTop()
    const nextTop = Math.max(0, Math.min(start + delta, getTutorialScrollMax()))
    if (Math.abs(nextTop - start) >= 1) root.scrollToTop(nextTop, 'auto')
    const afterRoot = args.composer.getBoundingClientRect().top
    if (Math.abs(afterRoot - before) < 1) {
      window.scrollBy(0, delta)
    }
  }
  return measureDelta()
}

export type ScrollBackDirection = 'up' | 'down'

export interface VerticalBox {
  top: number
  bottom: number
  width: number
  height: number
}

function fullyOutsideLayoutViewport(
  box: VerticalBox,
  viewportHeight: number
): ScrollBackDirection | null {
  if (box.width < 2 || box.height < 2) return null
  if (box.bottom <= 1) return 'up'
  if (box.top >= viewportHeight - 1) return 'down'
  return null
}

/**
 * Scroll-back hint when the spotlight and the tooltip are both fully outside the
 * layout viewport. The visual viewport shrinks when the keyboard opens and must
 * not count. Once the hint is showing, it stays until the spotlight intersects
 * the layout viewport again, even if the tooltip has unmounted.
 */
export function scrollBackDirectionForTarget(
  target: VerticalBox | null,
  tooltip: VerticalBox | null,
  alreadyShowing: boolean
): ScrollBackDirection | null {
  if (typeof window === 'undefined' || !target) return null
  const targetOff = fullyOutsideLayoutViewport(target, window.innerHeight)
  if (!targetOff) return null
  if (alreadyShowing) return targetOff
  if (!tooltip || !fullyOutsideLayoutViewport(tooltip, window.innerHeight)) return null
  return targetOff
}

/** Scroll the below-results composer into place. Does nothing while it is still in the hero. */
export function scrollFollowUpHighlightIntoView(options: FollowUpScrollOptions): void {
  const composer = readPortaledFollowUpComposerRect()
  if (!composer) return
  const delta = followUpScrollDelta({
    composerTop: composer.top,
    composerBottom: composer.bottom,
    viewportHeight: visibleViewportHeight(),
    tooltipHeight: options.tooltipHeight,
    arrowSize: options.arrowSize,
    preferred: options.preferred,
  })
  if (Math.abs(delta) < 1) return
  const root = getTutorialScrollRoot()
  const maxScroll = getTutorialScrollMax()
  root.scrollToTop(Math.max(0, Math.min(root.getScrollTop() + delta, maxScroll)), 'auto')
}

/**
 * Scroll after the next frame. Callers must use the returned cancel.
 * Mobile Safari does not run requestAnimationFrame while Playwright is waiting,
 * so an uncancelled callback fires later — after the follow-up composer is seated —
 * and `scrollIntoView` on the results pins that tall section to the top.
 */
export function deferScroll(scroll: () => void, delayMs = 100): () => void {
  let timeoutId: number | null = null
  let cancelled = false
  const frameId = requestAnimationFrame(() => {
    if (cancelled) return
    timeoutId = window.setTimeout(() => {
      timeoutId = null
      if (!cancelled) scroll()
    }, delayMs)
  })
  return () => {
    cancelled = true
    cancelAnimationFrame(frameId)
    if (timeoutId != null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
  }
}

/**
 * Wait until the composer under the results exists, then scroll it the way step 7
 * did before the transition work. The step can start while that composer is still
 * in the hero; it portals down when loading ends.
 */
export async function seatPortaledFollowUpComposer(
  isCancelled: () => boolean,
  placement: FollowUpScrollOptions
): Promise<boolean> {
  const deadline = performance.now() + 12000
  while (performance.now() < deadline) {
    if (isCancelled()) return false
    if (readPortaledFollowUpComposerRect() && isFollowUpComposerReady()) {
      scrollFollowUpHighlightIntoView(placement)
      await waitForRectStable(readPortaledFollowUpComposerRect, { timeoutMs: 200, quietMs: 48 })
      if (!isCancelled() && isFollowUpComposerReady()) {
        scrollFollowUpHighlightIntoView(placement)
        await waitForRectStable(readPortaledFollowUpComposerRect, { timeoutMs: 160, quietMs: 32 })
        if (
          !isCancelled() &&
          isFollowUpComposerReady() &&
          readPortaledFollowUpComposerRect() != null
        ) {
          return true
        }
      }
    }
    await new Promise<void>(resolve => {
      window.setTimeout(resolve, 32)
    })
  }
  return false
}
const COMPARISON_TEXTAREA = '[data-testid="comparison-input-textarea"]'

function hasBlockingOverlayForComposerFocus(): boolean {
  return Boolean(
    document.querySelector(
      '.tutorial-welcome-backdrop, .tutorial-backdrop, .mobile-tutorial-backdrop, [role="dialog"]'
    )
  )
}

/** Focus the follow-up composer textarea (below results when portaled). */
export function focusFollowUpComposerTextarea(): boolean {
  if (typeof document === 'undefined' || hasBlockingOverlayForComposerFocus()) {
    return false
  }

  const textarea =
    (document.querySelector(
      `${AFTER_RESULTS_COMPOSER_SLOT} ${COMPARISON_TEXTAREA}`
    ) as HTMLTextAreaElement | null) ??
    (document.querySelector(COMPARISON_TEXTAREA) as HTMLTextAreaElement | null)

  if (!textarea || textarea.disabled) return false

  const rect = textarea.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false

  textarea.focus()
  return true
}

/**
 * After onboarding on mobile, scroll to the page bottom and focus the follow-up composer —
 * mirrors desktop post-tutorial landing (scroll + cursor in the below-results composer).
 */
export function landOnFollowUpComposerAfterTutorial(): void {
  const root = getTutorialScrollRoot()
  const maxScroll = getTutorialScrollMax()

  root.scrollToTop(maxScroll, 'auto')

  const scheduleFocusAttempts = () => {
    requestAnimationFrame(() => {
      if (focusFollowUpComposerTextarea()) return
      setTimeout(() => {
        if (focusFollowUpComposerTextarea()) return
        setTimeout(focusFollowUpComposerTextarea, 400)
      }, 200)
    })
  }

  scheduleFocusAttempts()

  requestAnimationFrame(() => {
    root.scrollToTop(maxScroll, 'smooth')
    setTimeout(scheduleFocusAttempts, 350)
  })
}

export function escapeProviderNameForSelector(providerName: string): string {
  if (typeof CSS !== 'undefined' && 'escape' in CSS) {
    return CSS.escape(providerName)
  }
  return providerName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function getProviderDropdownByName(providerName: string): HTMLElement | null {
  return document.querySelector(
    `.provider-dropdown[data-provider-name="${escapeProviderNameForSelector(providerName)}"]`
  ) as HTMLElement | null
}

export function getTutorialProviderDropdowns(providerNames: readonly string[]): HTMLElement[] {
  return providerNames.map(getProviderDropdownByName).filter((el): el is HTMLElement => el != null)
}

export function getUnionClientRect(elements: HTMLElement[]): DOMRect | null {
  const rects = elements.map(el => el.getBoundingClientRect())
  const union = computeRectUnion(rects, 0)
  if (!union) return null
  return new DOMRect(union.left, union.top, union.width, union.height)
}

export interface TutorialProviderStepLayout {
  anchor: HTMLElement | null
  highlights: HTMLElement[]
  layoutRect: DOMRect | null
}

function tutorialTargetModelIds(): string[] {
  if (typeof document === 'undefined') return []
  return (document.documentElement.getAttribute('data-tutorial-target-models') ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
}

/**
 * When a provider lists more models than the step asks for, frame those model
 * rows. A filtered list (one row per target) keeps the whole provider card.
 */
function frameTutorialModelRows(dropdowns: HTMLElement[]): HTMLElement[] {
  const ids = tutorialTargetModelIds()
  if (ids.length === 0) return dropdowns
  const rows: HTMLElement[] = []
  let optionCount = 0
  for (const dropdown of dropdowns) {
    optionCount += dropdown.querySelectorAll('.model-option').length
    for (const id of ids) {
      const checkbox = dropdown.querySelector(`#${CSS.escape(`model-checkbox-${id}`)}`)
      const row = checkbox?.closest('.model-option')
      if (row instanceof HTMLElement && !rows.includes(row)) rows.push(row)
    }
  }
  if (rows.length === 0 || optionCount <= rows.length) return dropdowns
  return rows
}

/** Layout for tutorial provider steps (step 1 = first provider; step 2 = union of all tutorial providers). */
export function getTutorialProviderStepLayout(
  step: TutorialProviderLayoutStep,
  providerNames: readonly string[]
): TutorialProviderStepLayout {
  const dropdowns = getTutorialProviderDropdowns(providerNames)
  if (dropdowns.length === 0) {
    return { anchor: null, highlights: [], layoutRect: null }
  }
  if (
    step === 'select-models' ||
    step === 'select-starter-model-1' ||
    step === 'select-starter-model-2'
  ) {
    const pool = step === 'select-models' ? dropdowns : [dropdowns[0]]
    const highlights = frameTutorialModelRows(pool)
    const anchor = highlights[0] ?? dropdowns[0]
    return {
      anchor,
      highlights,
      layoutRect:
        highlights.length > 1 ? getUnionClientRect(highlights) : anchor.getBoundingClientRect(),
    }
  }
  const primary = dropdowns[0]
  const header = primary.querySelector('.provider-header') as HTMLElement | null
  const anchor =
    step === 'expand-provider' || step === 'expand-starter-provider-2'
      ? (header ?? primary)
      : primary
  return {
    anchor,
    highlights: [primary],
    layoutRect: primary.getBoundingClientRect(),
  }
}

export function scrollLayoutForTutorialStep(step: TutorialStep | null): TutorialProviderLayoutStep {
  if (step === 'select-models') return 'select-models'
  if (step === 'select-starter-model-2') return 'select-starter-model-2'
  if (step === 'select-starter-model-1') return 'select-starter-model-1'
  if (step === 'expand-starter-provider-2') return 'expand-starter-provider-2'
  return 'expand-provider'
}

/** Centers the framed provider card for the current tutorial step. */
export function scrollTutorialProvidersIntoView(
  providerNames: readonly string[],
  providerStep: TutorialProviderLayoutStep = 'expand-provider'
): void {
  const { layoutRect } = getTutorialProviderStepLayout(providerStep, providerNames)
  if (!layoutRect) return
  scrollTutorialRectToCenter(layoutRect)
}

/** @deprecated Use getProviderDropdownByName or getTutorialProviderStepLayout */
export function getGoogleProviderTutorialAnchor(): HTMLElement | null {
  return getProviderDropdownByName('Google')
}

/** @deprecated Use scrollTutorialProvidersIntoView */
export function scrollGoogleProviderTutorialIntoCenter(
  providerStep: 'expand-provider' | 'select-models' = 'expand-provider'
): void {
  scrollTutorialProvidersIntoView(['Google'], providerStep)
}

function getEstimatedTooltipHeight(): number {
  return window.innerHeight < 700 ? TOOLTIP_HEIGHT_SMALL : TOOLTIP_HEIGHT_LARGE
}

/**
 * Viewport Y where a tall Comparison Results card must start so the desktop
 * review tooltip fits above its top edge instead of sitting off-screen.
 */
export function desktopResultsTooltipMinTop(): number {
  const reserve =
    getEstimatedTooltipHeight() + DESKTOP_TUTORIAL_ARROW_PX + TUTORIAL_FRAME_OUTSET_PX + MARGIN
  const viewH = window.innerHeight
  const maxTop = Math.max(MARGIN, viewH - 180)
  return Math.min(reserve, maxTop)
}

function clampDesktopTooltipTop(
  top: number,
  effectivePosition: 'top' | 'bottom',
  tooltipHeight: number
): number {
  const view = readVisualViewportBox()
  const min = view.top + MARGIN
  const maxBottom = view.top + view.height - MARGIN
  if (effectivePosition === 'top') {
    const visualTop = top - tooltipHeight
    if (visualTop < min) return min + tooltipHeight
    if (top > maxBottom) return maxBottom
    return top
  }
  if (top < min) return min
  if (top + tooltipHeight > maxBottom) return Math.max(min, maxBottom - tooltipHeight)
  return top
}

export function computeTooltipPosition(
  rect: DOMRect,
  _step: TutorialStep,
  config: StepConfig
): { top: number; left: number; effectivePosition: 'top' | 'bottom' } {
  // Desktop `top` is the edge that faces the target (translate -100% when above).
  // The 8px arrow extends past that edge, and the blue frame is 8px outside the element.
  const frameTop = rect.top - TUTORIAL_FRAME_OUTSET_PX
  const frameBottom = rect.bottom + TUTORIAL_FRAME_OUTSET_PX
  const estimatedTooltipHeight = getEstimatedTooltipHeight()
  const placed = placeTooltipBoxAgainstFrame({
    frameTop,
    frameBottom,
    tooltipHeight: estimatedTooltipHeight,
    arrowSize: DESKTOP_TUTORIAL_ARROW_PX,
    viewportHeight: window.innerHeight,
    preferred: config.position === 'bottom' ? 'below' : 'above',
  })
  const centerX = rect.left + rect.width / 2
  const left = Math.max(180, Math.min(centerX, window.innerWidth - 180))
  if (placed.arrowDirection === 'down') {
    return {
      top: clampDesktopTooltipTop(
        frameTop - DESKTOP_TUTORIAL_ARROW_PX,
        'top',
        estimatedTooltipHeight
      ),
      left,
      effectivePosition: 'top',
    }
  }
  return {
    top: clampDesktopTooltipTop(
      frameBottom + DESKTOP_TUTORIAL_ARROW_PX,
      'bottom',
      estimatedTooltipHeight
    ),
    left,
    effectivePosition: 'bottom',
  }
}

export function getScrollTargetForStep(
  _step: TutorialStep,
  targetElement: HTMLElement,
  layoutRect?: DOMRect | null
): number {
  const rect = layoutRect ?? targetElement.getBoundingClientRect()
  const y0 = getTutorialScrollRoot().getScrollTop()
  const viewH = window.innerHeight
  const margin = 16
  const desiredTop =
    rect.height >= viewH - margin * 2 ? margin : Math.max(margin, (viewH - rect.height) / 2)
  const maxScroll = getTutorialScrollMax()
  return Math.max(0, Math.min(y0 + rect.top - desiredTop, maxScroll))
}

export function findTargetForStep(
  step: TutorialStep,
  config: StepConfig,
  tutorialProviderNames: readonly string[] = []
): { element: HTMLElement; highlights: HTMLElement[] } | null {
  let element: HTMLElement | null = null
  let highlights: HTMLElement[] = []

  if (isSingleProviderSpotlightStep(step) || step === 'select-models') {
    const layout = getTutorialProviderStepLayout(
      step as TutorialProviderLayoutStep,
      tutorialProviderNames
    )
    if (!layout.anchor || layout.highlights.length === 0) return null
    element =
      step === 'expand-provider' || step === 'expand-starter-provider-2'
        ? layout.anchor
        : layout.highlights[0]
    highlights = layout.highlights
  } else if (step === 'history-dropdown') {
    element = document.querySelector(config.targetSelector) as HTMLElement | null
    const historyDropdown = document.querySelector('.history-inline-list') as HTMLElement
    if (historyDropdown) highlights = [historyDropdown]
  } else if (step === 'save-selection') {
    element = document.querySelector(config.targetSelector) as HTMLElement | null
    const savedSelectionsDropdown = document.querySelector(
      '.saved-selections-dropdown'
    ) as HTMLElement
    if (savedSelectionsDropdown) highlights = [savedSelectionsDropdown]
  } else if (step === 'enter-prompt' || step === 'enter-prompt-2') {
    element = getComposerElement()
    if (step === 'enter-prompt' && element) highlights = [element]
  } else if (step === 'submit-comparison') {
    const composerElement = getComposerElement()
    if (composerElement) highlights = [composerElement]
    element = document.querySelector(config.targetSelector) as HTMLElement | null
  } else if (step === 'submit-comparison-2') {
    const resultsSection = document.querySelector('.results-section') as HTMLElement
    const loadingSection = document.querySelector('.loading-section') as HTMLElement
    if (loadingSection) highlights.push(loadingSection)
    if (resultsSection) highlights.push(resultsSection)
    element = document.querySelector(config.targetSelector) as HTMLElement | null
  } else if (step === 'view-follow-up-results') {
    element = document.querySelector(config.targetSelector) as HTMLElement | null
    if (!element) {
      element = document.querySelector('.results-section') as HTMLElement | null
    }
    if (element) highlights = [element]
  } else if (step === 'follow-up') {
    element = getComposerElement()
    const resultsSection = document.querySelector('.results-section') as HTMLElement | null
    highlights = resultsSection ? [resultsSection] : []
  } else {
    element = document.querySelector(config.targetSelector) as HTMLElement | null
  }

  if (!element) return null
  const isVisible =
    element.offsetParent !== null || (element.offsetWidth > 0 && element.offsetHeight > 0)
  if (!isVisible) return null
  return { element, highlights }
}

export { getComposerElement, getComposerCutoutRects }
