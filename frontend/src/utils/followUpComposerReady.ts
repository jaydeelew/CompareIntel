/**
 * Step 7 ("Continue the Conversation") stays hidden until the composer under
 * the results is the one the user can type into. The processing panel and the
 * Comparison Results spotlight stay on the submit step until then.
 */

const PORTALED_FOLLOW_UP_COMPOSER =
  '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'

function hasBox(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 2 && rect.height > 2
}

/** Continue-conversation composer is mounted, visible, and not behind the processing panel. */
export function isFollowUpComposerReady(root: ParentNode = document): boolean {
  const composer = root.querySelector(PORTALED_FOLLOW_UP_COMPOSER)
  if (!hasBox(composer)) return false
  const loading = root.querySelector('.loading-section')
  if (hasBox(loading)) return false
  const textarea = composer.querySelector('textarea')
  if (!(textarea instanceof HTMLTextAreaElement)) return false
  return !textarea.disabled && textarea.getAttribute('aria-disabled') !== 'true'
}

const UNAVAILABLE_ATTR = 'data-tutorial-follow-up-unavailable'

function documentElementOf(root: ParentNode): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (root instanceof Document) return root.documentElement
  return document.documentElement
}

/** The stream finished and the continue-conversation composer is not coming. */
export function setFollowUpComposerUnavailable(
  unavailable: boolean,
  root: ParentNode = document
): void {
  const el = documentElementOf(root)
  if (!el) return
  if (unavailable) el.setAttribute(UNAVAILABLE_ATTR, '')
  else el.removeAttribute(UNAVAILABLE_ATTR)
}

export function isFollowUpComposerUnavailable(root: ParentNode = document): boolean {
  const el = documentElementOf(root)
  return el?.hasAttribute(UNAVAILABLE_ATTR) ?? false
}

export type FollowUpComposerAdvance = 'ready' | 'wait' | 'give-up'

/**
 * `ready` — show step 7.
 * `wait` — stream still running, or results exist and the composer has not portaled yet.
 * `give-up` — the stream ended with nothing to continue (error or cancel before a reply).
 */
export function followUpComposerAdvanceDecision(input: {
  isLoading: boolean
  composerReady: boolean
  hasComparisonResults: boolean
}): FollowUpComposerAdvance {
  if (input.composerReady) return 'ready'
  if (input.isLoading || input.hasComparisonResults) return 'wait'
  return 'give-up'
}
