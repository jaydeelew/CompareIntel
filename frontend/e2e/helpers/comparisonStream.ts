import { expect, type Page } from '@playwright/test'

/**
 * Registers the stream listener, asserts submit is enabled, clicks Compare, then waits until
 * the compare-stream POST body completes (`response.finished()`).
 * By default also waits for `.result-card.conversation-card` in the DOM so Firefox/CI does not
 * assert before React commits. Set `waitForCardAttachment: false` when the test handles missing
 * grids/API skips itself (e.g. optional CI API key).
 */
export async function submitAndAwaitCompareStream(
  page: Page,
  options: { timeoutMs?: number; waitForCardAttachment?: boolean } = {}
): Promise<void> {
  const { timeoutMs = 90000, waitForCardAttachment = true } = options
  const responsePromise = page.waitForResponse(
    res => res.url().includes('compare-stream') && res.request().method() === 'POST',
    { timeout: timeoutMs }
  )
  await expect(page.getByTestId('comparison-submit-button')).toBeEnabled({ timeout: 15000 })
  await page.getByTestId('comparison-submit-button').click()
  const response = await responsePromise
  // Headers can arrive before the SSE body is consumed; Firefox/CI often asserted too early.
  await response.finished()
  if (!waitForCardAttachment) return
  const cardWait = Math.max(5000, Math.min(timeoutMs - 5000, 90000))
  await page
    .locator('.result-card.conversation-card')
    .first()
    .waitFor({ state: 'attached', timeout: cardWait })
}
