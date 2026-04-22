/**
 * Pure DOM utility functions for the tutorial overlay.
 * Extracted for testability and separation of concerns.
 */

/** Selector for the visible composer (excludes placeholder used when floating) */
export const VISIBLE_COMPOSER_SELECTOR = '.composer:not(.composer-placeholder)'

const AFTER_RESULTS_COMPOSER_SLOT = '[data-after-results-composer-slot]'

export function getComposerElement(): HTMLElement | null {
  // Follow-up layout: interactive composer is portaled below results (not the inert hero mirror).
  const belowResultsComposer = document.querySelector(
    `${AFTER_RESULTS_COMPOSER_SLOT} ${VISIBLE_COMPOSER_SELECTOR}`
  ) as HTMLElement | null
  if (belowResultsComposer) return belowResultsComposer

  // When floating, two elements have .composer: the invisible placeholder in hero
  // and the real composer in the portal. Prefer the visible one.
  const composer = document.querySelector(VISIBLE_COMPOSER_SELECTOR) as HTMLElement | null
  if (composer) return composer
  const textarea = document.querySelector(
    '[data-testid="comparison-input-textarea"]'
  ) as HTMLElement | null
  return (textarea?.closest('.composer') as HTMLElement | null) || null
}

/** Follow-up tutorial target: header in the below-results composer, not the inert hero mirror. */
export function getFollowUpTutorialHeaderElement(): HTMLElement | null {
  const below = document.querySelector(
    `${AFTER_RESULTS_COMPOSER_SLOT} .follow-up-header`
  ) as HTMLElement | null
  if (below && (below.offsetParent !== null || (below.offsetWidth > 0 && below.offsetHeight > 0))) {
    return below
  }
  const headers = document.querySelectorAll('.follow-up-header')
  for (let i = headers.length - 1; i >= 0; i--) {
    const el = headers[i] as HTMLElement
    if (el.closest('.composer-hero-mirror')) continue
    if (el.offsetParent !== null || (el.offsetWidth > 0 && el.offsetHeight > 0)) return el
  }
  return document.querySelector('.follow-up-header') as HTMLElement | null
}

export function getComposerCutoutRects(composerElement: HTMLElement): DOMRect[] {
  const inputWrapper = composerElement.querySelector(
    '.composer-input-wrapper'
  ) as HTMLElement | null
  const toolbar = composerElement.querySelector('.composer-toolbar') as HTMLElement | null
  const parts = [inputWrapper, toolbar].filter(Boolean) as HTMLElement[]
  return (parts.length > 0 ? parts : [composerElement]).map(el => el.getBoundingClientRect())
}
