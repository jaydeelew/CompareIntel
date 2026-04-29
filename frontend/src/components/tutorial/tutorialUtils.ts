/**
 * Pure DOM utility functions for the tutorial overlay.
 * Extracted for testability and separation of concerns.
 */

/** Selector for the visible composer (excludes placeholder used when floating) */
export const VISIBLE_COMPOSER_SELECTOR = '.composer:not(.composer-placeholder)'

const AFTER_RESULTS_COMPOSER_SLOT = '[data-after-results-composer-slot]'
const HERO_MIRROR_ROOT = '.composer-hero-mirror'

function hasHeroMirrorComposer(): boolean {
  return Boolean(document.querySelector(`${HERO_MIRROR_ROOT} ${VISIBLE_COMPOSER_SELECTOR}`))
}

/** Inert hero mirror composer when the real composer is portaled (e.g. follow-up). */
export function getHeroMirrorComposerIfPresent(): HTMLElement | null {
  return document.querySelector(
    `${HERO_MIRROR_ROOT} ${VISIBLE_COMPOSER_SELECTOR}`
  ) as HTMLElement | null
}

/**
 * Composer shell used for tutorial steps 7–8 (history / saved selections).
 * When the real composer is portaled below results, the visible “hero” chrome (and inline history UI)
 * lives in the inert `.composer-hero-mirror`; cutouts must use that node, not the portaled duplicate.
 */
export function getHeroComposerForDropdownSteps(): HTMLElement | null {
  const mirrorComposer = document.querySelector(
    `${HERO_MIRROR_ROOT} ${VISIBLE_COMPOSER_SELECTOR}`
  ) as HTMLElement | null
  if (mirrorComposer) return mirrorComposer
  return getComposerElement()
}

export function getHistoryInlineListForTutorial(): HTMLElement | null {
  const hero = getHeroComposerForDropdownSteps()
  const inHero = hero?.querySelector('.history-inline-list') ?? null
  if (inHero) return inHero as HTMLElement
  return document.querySelector('.history-inline-list') as HTMLElement | null
}

/**
 * Saved-selections panel may portal into the below-results composer only. In that case there is no
 * dropdown node under the hero mirror; returning null avoids unioning hero + distant panel (full-page cutout).
 */
export function getSavedSelectionsDropdownForTutorial(): HTMLElement | null {
  const hero = getHeroComposerForDropdownSteps()
  const inHero = hero?.querySelector('.saved-selections-dropdown') ?? null
  if (inHero) return inHero as HTMLElement
  if (hasHeroMirrorComposer()) return null
  return document.querySelector('.saved-selections-dropdown') as HTMLElement | null
}

/** Toggle button the user sees in the hero row (inert mirror when composer is floated). */
export function getHistoryToggleButtonForTutorial(): HTMLElement | null {
  const mirrorBtn = document.querySelector(
    `${HERO_MIRROR_ROOT} .history-toggle-button`
  ) as HTMLElement | null
  if (mirrorBtn) return mirrorBtn
  return document.querySelector('.history-toggle-button') as HTMLElement | null
}

export function getSavedSelectionsButtonForTutorial(): HTMLElement | null {
  const mirrorBtn = document.querySelector(
    `${HERO_MIRROR_ROOT} .saved-selections-button`
  ) as HTMLElement | null
  if (mirrorBtn) return mirrorBtn
  return document.querySelector('.saved-selections-button') as HTMLElement | null
}

/** Receives real clicks when the hero mirror is inert (follow-up / floating layout). */
export function getBelowResultsHistoryToggleButton(): HTMLElement | null {
  const below = document.querySelector(
    `${AFTER_RESULTS_COMPOSER_SLOT} .history-toggle-button`
  ) as HTMLElement | null
  if (below) return below
  return document.querySelector('.history-toggle-button') as HTMLElement | null
}

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
