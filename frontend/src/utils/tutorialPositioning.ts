import { getComposerCutoutRects, getComposerElement } from '../components/tutorial/tutorialUtils'
import { isSingleProviderSpotlightStep } from '../data/tutorialStepPlan'
import type { StepConfig } from '../data/tutorialSteps'
import type { TutorialStep } from '../hooks/useTutorial'

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

/**
 * Center a highlight in the viewport. A target taller than the screen pins its top
 * just inside the viewport so the framed area still starts on screen.
 * Instant scroll: the tooltip stays hidden until this finishes, and a smooth scroll
 * plus the fade timer is clamped on Mobile Safari.
 */
/**
 * How far to scroll so step 7 keeps the results and the follow-up composer together.
 * The tooltip sits against the composer (below on mobile, above on desktop). When the
 * pair fits, it is centered in the space left beside the tooltip. When it does not,
 * the composer stays against the tooltip and the results fill the rest of the viewport.
 * Positive means scroll content up.
 */
export function followUpScrollDelta(args: {
  blockTop: number
  composerTop: number
  composerBottom: number
  viewportHeight: number
  tooltipHeight: number
  arrowSize: number
  preferred: 'above' | 'below'
  padding?: number
}): number {
  const padding = args.padding ?? 12
  const need = args.tooltipHeight + args.arrowSize + padding
  const blockHeight = args.composerBottom - args.blockTop
  const viewH = args.viewportHeight
  let desiredBlockTop: number
  if (args.preferred === 'below') {
    if (blockHeight + need <= viewH - padding) {
      const available = viewH - need
      desiredBlockTop = Math.max(padding, (available - blockHeight) / 2)
    } else {
      desiredBlockTop = viewH - need - (args.composerBottom - args.blockTop)
    }
  } else if (blockHeight + need <= viewH - padding) {
    const available = viewH - need
    desiredBlockTop = need + Math.max(0, (available - blockHeight) / 2)
  } else {
    desiredBlockTop = need - (args.composerTop - args.blockTop)
  }
  return args.blockTop - desiredBlockTop
}

export function scrollTutorialRectToCenter(rect: { top: number; height: number }): void {
  const root = getTutorialScrollRoot()
  const viewH = window.innerHeight
  const y0 = root.getScrollTop()
  const maxScroll = getTutorialScrollMax()
  const margin = 16
  const desiredTop =
    rect.height >= viewH - margin * 2 ? margin : Math.max(margin, (viewH - rect.height) / 2)
  const nextTop = Math.max(0, Math.min(y0 + rect.top - desiredTop, maxScroll))
  if (Math.abs(nextTop - y0) < 1) return
  root.scrollToTop(nextTop, 'auto')
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
    const composer =
      step === 'follow-up'
        ? ((document.querySelector(
            '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
          ) as HTMLElement | null) ?? getComposerElement())
        : getComposerElement()
    if (!composer) return null
    if (step === 'follow-up') return composer.getBoundingClientRect()
    const parts = getComposerCutoutRects(composer)
    if (step === 'history-dropdown') {
      const panel = composer.querySelector('.history-inline-list')
      if (panel) parts.push(panel.getBoundingClientRect())
    }
    if (step === 'save-selection') {
      const panel = composer.querySelector('.saved-selections-dropdown')
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

/** Results section plus the composer the follow-up tooltip points at. */
export function readFollowUpLayout(): { results: DOMRect | null; composer: DOMRect | null } {
  const resultsEl = document.querySelector('.results-section') as HTMLElement | null
  const resultsRect = resultsEl?.getBoundingClientRect() ?? null
  const composer =
    readPortaledFollowUpComposerRect() ??
    (() => {
      const fallback = getComposerElement()?.getBoundingClientRect() ?? null
      return fallback && fallback.width > 1 && fallback.height > 1 ? fallback : null
    })()
  return {
    results: resultsRect && resultsRect.height > 1 ? resultsRect : null,
    composer,
  }
}

/** Scroll step 7 so the results stay on screen with the composer against the tooltip. */
export function scrollFollowUpHighlightIntoView(options: FollowUpScrollOptions): void {
  const { results, composer } = readFollowUpLayout()
  if (!composer) return
  const blockTop = Math.min(results?.top ?? composer.top, composer.top)
  const delta = followUpScrollDelta({
    blockTop,
    composerTop: composer.top,
    composerBottom: composer.bottom,
    viewportHeight: window.innerHeight,
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
 * Wait until the below-results composer exists, then seat the results with it.
 * The first comparison can finish the tutorial step while the composer is still
 * in the hero; it portals down when loading ends. Centering that composer alone
 * scrolls the results section off the top of the screen.
 */
export async function seatPortaledFollowUpComposer(
  isCancelled: () => boolean,
  placement: FollowUpScrollOptions
): Promise<boolean> {
  const deadline = performance.now() + 700
  while (performance.now() < deadline) {
    if (isCancelled()) return false
    if (readPortaledFollowUpComposerRect()) {
      scrollFollowUpHighlightIntoView(placement)
      await waitForRectStable(readPortaledFollowUpComposerRect, { timeoutMs: 200, quietMs: 48 })
      if (isCancelled()) return false
      scrollFollowUpHighlightIntoView(placement)
      await waitForRectStable(readPortaledFollowUpComposerRect, { timeoutMs: 160, quietMs: 32 })
      return !isCancelled() && readPortaledFollowUpComposerRect() != null
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

/** Layout for tutorial provider steps (step 1 = first provider; step 2 = union of all tutorial providers). */
export function getTutorialProviderStepLayout(
  step: TutorialProviderLayoutStep,
  providerNames: readonly string[]
): TutorialProviderStepLayout {
  const dropdowns = getTutorialProviderDropdowns(providerNames)
  if (dropdowns.length === 0) {
    return { anchor: null, highlights: [], layoutRect: null }
  }
  if (step === 'select-models') {
    return {
      anchor: dropdowns[0],
      highlights: dropdowns,
      layoutRect: getUnionClientRect(dropdowns),
    }
  }
  const primary = dropdowns[0]
  const header = primary.querySelector('.provider-header') as HTMLElement | null
  if (step === 'select-starter-model-1' || step === 'select-starter-model-2') {
    return {
      anchor: primary,
      highlights: [primary],
      layoutRect: primary.getBoundingClientRect(),
    }
  }
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
      top: frameTop - DESKTOP_TUTORIAL_ARROW_PX,
      left,
      effectivePosition: 'top',
    }
  }
  return {
    top: frameBottom + DESKTOP_TUTORIAL_ARROW_PX,
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
