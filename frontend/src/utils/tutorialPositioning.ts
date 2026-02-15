import { getComposerCutoutRects, getComposerElement } from '../components/tutorial/tutorialUtils'
import type { StepConfig } from '../data/tutorialSteps'
import type { TutorialStep } from '../hooks/useTutorial'

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
const TOOLTIP_HEIGHT_SMALL = 160
const TOOLTIP_HEIGHT_LARGE = 210
const MARGIN = 12
const TOP_MARGIN = 80
const BOTTOM_MARGIN = 40

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
  const isTopSteps =
    (step === 'expand-provider' ||
      step === 'select-models' ||
      step === 'follow-up' ||
      step === 'view-follow-up-results' ||
      step === 'history-dropdown' ||
      step === 'save-selection') &&
    config.position === 'top'

  if (isEnterPromptStep) {
    let top = rect.bottom + offset
    const left = rect.left + rect.width / 2
    top = Math.min(top, viewportHeight - estimatedTooltipHeight - MARGIN)
    return {
      top,
      left: Math.max(200, Math.min(left, window.innerWidth - 200)),
      effectivePosition: 'bottom',
    }
  }

  if (isTopSteps) {
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const hasEnoughSpaceAbove = spaceAbove >= minSpaceNeeded
    const hasEnoughSpaceBelow = spaceBelow >= minSpaceNeeded
    const shouldUseBottom = hasEnoughSpaceAbove
      ? false
      : hasEnoughSpaceBelow
        ? true
        : spaceBelow > spaceAbove

    let top: number
    const left = rect.left + rect.width / 2
    if (shouldUseBottom) {
      top = rect.bottom + offset
      top = Math.min(top, viewportHeight - estimatedTooltipHeight - MARGIN)
      return {
        top,
        left: Math.max(200, Math.min(left, window.innerWidth - 200)),
        effectivePosition: 'bottom',
      }
    }
    top = rect.top - offset
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

export function getScrollTargetForStep(step: TutorialStep, targetElement: HTMLElement): number {
  const rect = targetElement.getBoundingClientRect()
  const elementTop = rect.top + window.pageYOffset
  const estimatedTooltipHeight = 210
  const tooltipOffset = 16

  if (step === 'expand-provider' || step === 'select-models') {
    const desiredElementTopInViewport = TOP_MARGIN + tooltipOffset + estimatedTooltipHeight
    return window.pageYOffset + rect.top - desiredElementTopInViewport
  }
  if (step === 'follow-up' || step === 'view-follow-up-results') {
    const desiredElementTopInViewport = TOP_MARGIN + tooltipOffset + estimatedTooltipHeight
    return window.pageYOffset + rect.top - desiredElementTopInViewport
  }
  if (step === 'enter-prompt' || step === 'enter-prompt-2') {
    const desiredComposerBottomInViewport =
      window.innerHeight - BOTTOM_MARGIN - tooltipOffset - estimatedTooltipHeight
    return window.pageYOffset + rect.bottom - desiredComposerBottomInViewport
  }
  const elementCenter = elementTop + rect.height / 2
  const viewportCenter = window.innerHeight / 2
  return elementCenter - viewportCenter
}

export function findTargetForStep(
  step: TutorialStep,
  config: StepConfig
): { element: HTMLElement; highlights: HTMLElement[] } | null {
  let element: HTMLElement | null = null
  let highlights: HTMLElement[] = []

  if (step === 'expand-provider' || step === 'select-models') {
    const googleDropdown = document.querySelector(
      '.provider-dropdown[data-provider-name="Google"]'
    ) as HTMLElement | null
    if (!googleDropdown) return null
    if (step === 'expand-provider') {
      element = googleDropdown.querySelector('.provider-header') as HTMLElement
      highlights = [googleDropdown]
    } else {
      element = googleDropdown
      highlights = [googleDropdown]
    }
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
    element = document.querySelector('.results-section') as HTMLElement | null
    if (element) highlights = [element]
  } else if (step === 'follow-up') {
    const resultsSection = document.querySelector('.results-section') as HTMLElement
    if (resultsSection) highlights = [resultsSection]
    element = document.querySelector(config.targetSelector) as HTMLElement | null
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
