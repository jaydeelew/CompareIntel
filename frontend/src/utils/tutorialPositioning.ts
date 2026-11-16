import { getComposerCutoutRects, getComposerElement } from '../components/tutorial/tutorialUtils'
import { isSelectModelTutorialStep, isSingleProviderSpotlightStep } from '../data/tutorialStepPlan'
import type { StepConfig } from '../data/tutorialSteps'
import type { TutorialStep } from '../hooks/useTutorial'

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

const TOOLTIP_OFFSET = 16
/** Step 1: distance from highlighted row top to tooltip anchor — tight to cyan ring without covering the arrow. */
const EXPAND_PROVIDER_TOOLTIP_TOP_GAP_PX = 22
const TOOLTIP_HEIGHT_SMALL = 160
const TOOLTIP_HEIGHT_LARGE = 210
const MARGIN = 12
const TOP_MARGIN = 80
const BOTTOM_MARGIN = 40

/**
 * Main page content scrolls in `.app` (see base.css); `window` scroll is often 0.
 * Tutorial scroll and document-Y cutout math must use this root.
 */
export function getTutorialScrollRoot(): {
  getScrollTop: () => number
  scrollToTop: (top: number, behavior?: ScrollBehavior) => void
} {
  const app = document.querySelector('.app') as HTMLElement | null
  if (app && app.scrollHeight > app.clientHeight + 1) {
    return {
      getScrollTop: () => app.scrollTop,
      scrollToTop: (top, behavior = 'auto') => {
        app.scrollTo({ top, left: 0, behavior })
      },
    }
  }
  return {
    getScrollTop: () => window.scrollY || document.documentElement.scrollTop,
    scrollToTop: (top, behavior = 'auto') => {
      window.scrollTo({ top, left: 0, behavior })
    },
  }
}

export function getTutorialScrollMax(): number {
  const app = document.querySelector('.app') as HTMLElement | null
  if (app && app.scrollHeight > app.clientHeight + 1) {
    return Math.max(0, app.scrollHeight - app.clientHeight)
  }
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

const AFTER_RESULTS_COMPOSER_SLOT = '[data-after-results-composer-slot]'
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
    const modelRow = primary.querySelector('.provider-models .model-option') as HTMLElement | null
    const spotlight = modelRow ?? primary
    return {
      anchor: spotlight,
      highlights: [primary],
      layoutRect: spotlight.getBoundingClientRect(),
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

/**
 * Scrolls tutorial provider block(s) into view for the tooltip.
 * - Step 1: vertically center the first tutorial provider card.
 * - Step 2: vertically center the union of all tutorial provider cards (both model rows visible).
 */
export function scrollTutorialProvidersIntoView(
  providerNames: readonly string[],
  providerStep: TutorialProviderLayoutStep = 'expand-provider'
): void {
  const { layoutRect } = getTutorialProviderStepLayout(providerStep, providerNames)
  if (!layoutRect) return
  const root = getTutorialScrollRoot()
  const y0 = root.getScrollTop()
  let nextTop: number
  const viewH = window.innerHeight
  if (providerStep === 'select-starter-model-1' || providerStep === 'select-starter-model-2') {
    const tooltipReserve = getEstimatedTooltipHeight() + TOOLTIP_OFFSET + 48
    nextTop = Math.max(0, y0 + layoutRect.top - tooltipReserve)
  } else if (providerStep === 'select-models') {
    const margin = 80
    if (layoutRect.height > viewH - margin * 2) {
      nextTop = y0 + layoutRect.top - margin
    } else {
      const centeredTop = (viewH - layoutRect.height) / 2
      nextTop = y0 + layoutRect.top - centeredTop
    }
  } else {
    const centeredTop = viewH / 2 - layoutRect.height / 2
    nextTop = y0 + layoutRect.top - centeredTop
  }
  nextTop = Math.max(0, nextTop)
  const maxScroll = getTutorialScrollMax()
  nextTop = Math.min(nextTop, maxScroll)
  root.scrollToTop(nextTop, 'auto')
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
  step: TutorialStep,
  config: StepConfig
): { top: number; left: number; effectivePosition: 'top' | 'bottom' } {
  const offset = TOOLTIP_OFFSET
  const viewportHeight = window.innerHeight
  const estimatedTooltipHeight = getEstimatedTooltipHeight()
  const minSpaceNeeded = estimatedTooltipHeight + offset + 40

  const isEnterPromptStep =
    (step === 'enter-prompt' || step === 'enter-prompt-2') && config.position === 'bottom'

  if (isSelectModelTutorialStep(step)) {
    const selectGap = 18
    const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
    const spaceAbove = rect.top - MARGIN
    const spaceBelow = viewportHeight - MARGIN - rect.bottom
    const needAbove = estimatedTooltipHeight + selectGap
    const needBelow = estimatedTooltipHeight + selectGap

    if (spaceAbove >= needAbove) {
      let top = rect.top - selectGap
      const tooltipTopEdge = top - estimatedTooltipHeight
      if (tooltipTopEdge < MARGIN) {
        top = MARGIN + estimatedTooltipHeight
      }
      return { top, left, effectivePosition: 'top' }
    }
    if (spaceBelow >= needBelow) {
      const top = Math.min(
        rect.bottom + selectGap,
        viewportHeight - estimatedTooltipHeight - MARGIN
      )
      return { top, left, effectivePosition: 'bottom' }
    }
    if (spaceBelow >= spaceAbove) {
      const top = Math.min(
        rect.bottom + selectGap,
        viewportHeight - estimatedTooltipHeight - MARGIN
      )
      return { top, left, effectivePosition: 'bottom' }
    }
    let top = rect.top - selectGap
    top = Math.max(MARGIN + estimatedTooltipHeight, top)
    return { top, left, effectivePosition: 'top' }
  }

  const isTopSteps =
    (step === 'expand-provider' ||
      step === 'expand-starter-provider-2' ||
      step === 'select-models' ||
      step === 'select-starter-model-1' ||
      step === 'select-starter-model-2' ||
      step === 'history-dropdown' ||
      step === 'save-selection') &&
    config.position === 'top'

  // Step 6: tooltip below the results section initially — prefer bottom, fall back to top
  if (step === 'view-follow-up-results' && config.position === 'top') {
    const reviewGap = 18
    const left = rect.left + rect.width / 2
    const clampedLeft = Math.max(200, Math.min(left, window.innerWidth - 200))
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const minAbove = estimatedTooltipHeight + reviewGap + 40
    const minBelow = estimatedTooltipHeight + offset + MARGIN

    if (spaceBelow >= minBelow) {
      return {
        top: rect.bottom + offset,
        left: clampedLeft,
        effectivePosition: 'bottom',
      }
    }

    if (spaceAbove >= minAbove) {
      let top = rect.top - reviewGap
      const tooltipTopEdge = top - estimatedTooltipHeight
      if (tooltipTopEdge < MARGIN) {
        top = MARGIN + estimatedTooltipHeight
      }
      return { top, left: clampedLeft, effectivePosition: 'top' }
    }

    // Not enough room fully above or below — pick the side with more space,
    // but never let the tooltip sit over the vertical center of the section.
    if (spaceBelow >= spaceAbove) {
      const top = Math.max(rect.bottom + offset, viewportHeight - estimatedTooltipHeight - MARGIN)
      return { top, left: clampedLeft, effectivePosition: 'bottom' }
    }
    const top = Math.max(MARGIN + estimatedTooltipHeight, rect.top - reviewGap)
    return { top, left: clampedLeft, effectivePosition: 'top' }
  }

  // Step 5: tooltip above the composer — leave enough clearance so the down-arrow reads between
  // the tooltip and the composer (not sandwiched on the highlight rings).
  if (step === 'follow-up' && config.position === 'top') {
    const followUpGap = 18
    const left = rect.left + rect.width / 2
    const spaceAbove = rect.top
    const minSpaceNeeded = estimatedTooltipHeight + followUpGap + 40
    const hasEnoughSpaceAbove = spaceAbove >= minSpaceNeeded
    let top: number
    if (hasEnoughSpaceAbove) {
      top = rect.top - followUpGap
      const tooltipTopEdge = top - estimatedTooltipHeight
      if (tooltipTopEdge < MARGIN) {
        top = MARGIN + estimatedTooltipHeight
      }
      return {
        top,
        left: Math.max(200, Math.min(left, window.innerWidth - 200)),
        effectivePosition: 'top',
      }
    }
    top = rect.bottom + offset
    top = Math.min(top, viewportHeight - estimatedTooltipHeight - MARGIN)
    return {
      top,
      left: Math.max(200, Math.min(left, window.innerWidth - 200)),
      effectivePosition: 'bottom',
    }
  }

  if (isEnterPromptStep) {
    const viewportMid = viewportHeight / 2
    const composerMidY = rect.top + rect.height / 2
    /** Composer center in upper half → prefer tooltip below (arrow up toward composer); lower half → above. */
    const preferTooltipBelowComposer = composerMidY < viewportMid
    const enterPromptGap = 18
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const needBelow = estimatedTooltipHeight + offset + MARGIN
    const needAbove = estimatedTooltipHeight + enterPromptGap + MARGIN

    let useBottom: boolean
    if (preferTooltipBelowComposer) {
      useBottom =
        spaceBelow >= needBelow ? true : spaceAbove >= needAbove ? false : spaceBelow >= spaceAbove
    } else {
      useBottom =
        spaceAbove >= needAbove ? false : spaceBelow >= needBelow ? true : spaceBelow >= spaceAbove
    }

    const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))

    if (useBottom) {
      let top = rect.bottom + offset
      top = Math.min(top, viewportHeight - estimatedTooltipHeight - MARGIN)
      return { top, left, effectivePosition: 'bottom' }
    }

    let top = rect.top - enterPromptGap
    const tooltipTopEdge = top - estimatedTooltipHeight
    if (tooltipTopEdge < MARGIN) {
      top = MARGIN + estimatedTooltipHeight
    }
    return { top, left, effectivePosition: 'top' }
  }

  if (isTopSteps) {
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const hasEnoughSpaceAbove = spaceAbove >= minSpaceNeeded
    const hasEnoughSpaceBelow = spaceBelow >= minSpaceNeeded
    /** Step 1: default tooltip above the header (arrow down); if anchor sits in upper half of viewport use below (arrow up). */
    const viewportMid = viewportHeight / 2
    const anchorMidY = rect.top + rect.height / 2

    let shouldUseBottom: boolean
    if (step === 'expand-provider' || step === 'expand-starter-provider-2') {
      const preferBelowBecauseUpperHalf = anchorMidY < viewportMid
      const gapAboveNeeded = EXPAND_PROVIDER_TOOLTIP_TOP_GAP_PX
      const needAboveForTop = estimatedTooltipHeight + gapAboveNeeded + MARGIN
      const needBelow = estimatedTooltipHeight + offset + MARGIN

      if (preferBelowBecauseUpperHalf) {
        shouldUseBottom =
          spaceBelow >= needBelow ? true : spaceAbove >= needAboveForTop ? false : true
      } else {
        shouldUseBottom =
          spaceAbove >= needAboveForTop
            ? false
            : spaceBelow >= needBelow
              ? true
              : spaceBelow >= spaceAbove
      }
    } else {
      shouldUseBottom = hasEnoughSpaceAbove
        ? false
        : hasEnoughSpaceBelow
          ? true
          : spaceBelow > spaceAbove
    }

    let top: number
    // Same horizontal anchor for step 1 and 2 (Google column center) so the tooltip does not
    // jump or fight other effects when advancing expand-provider → select-models.
    const left = Math.max(200, Math.min(rect.left + rect.width / 2, window.innerWidth - 200))
    if (shouldUseBottom) {
      top = rect.bottom + offset
      top = Math.min(top, viewportHeight - estimatedTooltipHeight - MARGIN)
      return {
        top,
        left,
        effectivePosition: 'bottom',
      }
    }
    const topPlacementGap =
      step === 'expand-provider' || step === 'expand-starter-provider-2'
        ? EXPAND_PROVIDER_TOOLTIP_TOP_GAP_PX
        : offset
    top = rect.top - topPlacementGap
    const tooltipTopEdge = top - estimatedTooltipHeight
    if (tooltipTopEdge < MARGIN) {
      top = MARGIN + estimatedTooltipHeight
    }
    return {
      top,
      left,
      effectivePosition: 'top',
    }
  }

  let top = 0
  const left = rect.left + rect.width / 2
  switch (config.position) {
    case 'bottom':
      top = rect.bottom + offset
      break
    case 'top':
      top = rect.top - offset
      break
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - offset,
        effectivePosition: 'top',
      }
    case 'right':
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + offset,
        effectivePosition: 'top',
      }
  }
  return {
    top,
    left,
    effectivePosition: config.position as 'top' | 'bottom',
  }
}

export function getScrollTargetForStep(
  step: TutorialStep,
  targetElement: HTMLElement,
  layoutRect?: DOMRect | null
): number {
  const rect = layoutRect ?? targetElement.getBoundingClientRect()
  const y0 = getTutorialScrollRoot().getScrollTop()
  const estimatedTooltipHeight = 210
  const tooltipOffset = 16

  // Provider steps: scroll before tooltip (see useTutorialOverlay).
  if (step === 'expand-provider' || step === 'expand-starter-provider-2') {
    const centeredTop = window.innerHeight / 2 - rect.height / 2
    return Math.max(0, y0 + rect.top - centeredTop)
  }
  if (step === 'select-models') {
    const margin = 80
    const viewH = window.innerHeight
    if (rect.height > viewH - margin * 2) {
      return Math.max(0, y0 + rect.top - margin)
    }
    const centeredTop = (viewH - rect.height) / 2
    return Math.max(0, y0 + rect.top - centeredTop)
  }
  if (step === 'select-starter-model-1' || step === 'select-starter-model-2') {
    const margin = 80
    const desiredViewportTop = margin
    return Math.max(0, y0 + rect.top - desiredViewportTop)
  }
  if (step === 'follow-up') {
    const desiredElementTopInViewport = TOP_MARGIN + tooltipOffset + estimatedTooltipHeight
    return Math.max(0, y0 + rect.top - desiredElementTopInViewport)
  }
  if (step === 'view-follow-up-results') {
    const desiredElementBottomInViewport =
      window.innerHeight - BOTTOM_MARGIN - tooltipOffset - estimatedTooltipHeight
    return Math.max(0, y0 + rect.bottom - desiredElementBottomInViewport)
  }
  if (step === 'enter-prompt' || step === 'enter-prompt-2') {
    const desiredComposerBottomInViewport =
      window.innerHeight - BOTTOM_MARGIN - tooltipOffset - estimatedTooltipHeight
    return Math.max(0, y0 + rect.bottom - desiredComposerBottomInViewport)
  }
  const elementCenter = y0 + rect.top + rect.height / 2
  const viewportCenter = window.innerHeight / 2
  return Math.max(0, elementCenter - viewportCenter)
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
