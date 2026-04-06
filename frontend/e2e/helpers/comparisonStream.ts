import { expect, type Page, type Response } from '@playwright/test'

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
  const submit = page.getByTestId('comparison-submit-button')
  await expect(submit).toBeEnabled({ timeout: 15000 })

  // High z-index "Done Selecting?" card can cover the submit control; a naive click hits the
  // overlay and never runs onSubmitClick(), so no compare-stream POST. Dismiss when visible
  // (do not use a short timeout + silent catch — CI often needs longer than 2s).
  const doneSelectingBtn = page.getByRole('button', { name: 'Done selecting models' })
  if (await doneSelectingBtn.isVisible().catch(() => false)) {
    await doneSelectingBtn.click({ timeout: 15000 })
    await expect(doneSelectingBtn).toBeHidden({ timeout: 15000 })
  }
  await expect(submit).toBeEnabled({ timeout: 5000 })

  const matchesCompareStreamPost = (res: Response) =>
    res.url().includes('compare-stream') && res.request().method() === 'POST'

  // Register the response waiter in the same tick as the click (Promise.all) so nothing can
  // slip between listener setup and navigation; do not start the waiter before the button is ready.
  // force: true ensures the click targets the submit node if any overlay still overlaps.
  const [response] = await Promise.all([
    page.waitForResponse(matchesCompareStreamPost, { timeout: timeoutMs }),
    submit.click({ force: true }),
  ])
  // Headers can arrive before the SSE body is consumed; Firefox/CI often asserted too early.
  await response.finished()
  if (!waitForCardAttachment) return
  const cardWait = Math.max(5000, Math.min(timeoutMs - 5000, 90000))
  await page
    .locator('.result-card.conversation-card')
    .first()
    .waitFor({ state: 'visible', timeout: cardWait })
}
