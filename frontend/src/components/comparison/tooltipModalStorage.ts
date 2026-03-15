/**
 * Storage helpers for composer tooltip modal "Do not show again" preference.
 */

const STORAGE_PREFIX = 'composer-tooltip-modal-suppressed-'

export function getTooltipModalSuppressed(buttonId: string): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(STORAGE_PREFIX + buttonId) === 'true'
}

export function setTooltipModalSuppressed(buttonId: string, suppressed: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (suppressed) {
    localStorage.setItem(STORAGE_PREFIX + buttonId, 'true')
  } else {
    localStorage.removeItem(STORAGE_PREFIX + buttonId)
  }
}
