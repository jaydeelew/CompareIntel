/**
 * Pure DOM utility functions for the tutorial overlay.
 * Extracted for testability and separation of concerns.
 */

/** Selector for the visible composer (excludes placeholder used when floating) */
export const VISIBLE_COMPOSER_SELECTOR = '.composer:not(.composer-placeholder)'

export function getComposerElement(): HTMLElement | null {
  // When floating, two elements have .composer: the invisible placeholder in hero
  // and the real composer in the portal. Prefer the visible one.
  const composer = document.querySelector(VISIBLE_COMPOSER_SELECTOR) as HTMLElement | null
  if (composer) return composer
  const textarea = document.querySelector(
    '[data-testid="comparison-input-textarea"]'
  ) as HTMLElement | null
  return (textarea?.closest('.composer') as HTMLElement | null) || null
}

export function getComposerCutoutRects(composerElement: HTMLElement): DOMRect[] {
  const inputWrapper = composerElement.querySelector(
    '.composer-input-wrapper'
  ) as HTMLElement | null
  const toolbar = composerElement.querySelector('.composer-toolbar') as HTMLElement | null
  const parts = [inputWrapper, toolbar].filter(Boolean) as HTMLElement[]
  return (parts.length > 0 ? parts : [composerElement]).map(el => el.getBoundingClientRect())
}
