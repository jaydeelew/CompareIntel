import { expect, type Page, type Response } from '@playwright/test'

/**
 * The compare-stream POST returns SSE. In Chromium/CI, `response.finished()` often never resolves
 * after the UI is done (streaming fetch + proxy quirks). Do not rely on it alone.
 *
 * We resolve as soon as any of these wins:
 * - Results UI appears — matches when React commits the results area (do not use generic
 *   `.error-message`; it is shared with credit/vision banners and can false-positive)
 * - Loading banner shows then hides
 * - Submit goes aria-disabled during load then back to false (slow path)
 * - `response.finished()` if the runtime actually closes the body
 */
function raceCompareStreamSettled(
  page: Page,
  response: Response,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const remaining = () => Math.max(1000, deadline - Date.now())

  const resultsUi = page.locator(
    '.results-section .results-grid, .results-section .result-card.conversation-card, .results-section [data-testid^="result-card-"]'
  )

  return new Promise((resolve, reject) => {
    let settled = false
    const succeed = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    const timer = setTimeout(
      () => fail(new Error(`compare-stream did not settle within ${timeoutMs}ms`)),
      timeoutMs
    )

    // Optional: helps when the body fully completes; must not reject — UI may still succeed.
    response
      .finished()
      .then(succeed)
      .catch(() => {})

    resultsUi
      .first()
      .waitFor({ state: 'visible', timeout: remaining() })
      .then(succeed)
      .catch(() => {})

    const loading = page.locator('.loading-section')
    loading
      .waitFor({ state: 'visible', timeout: Math.min(20000, remaining()) })
      .then(() => loading.waitFor({ state: 'hidden', timeout: remaining() }))
      .then(succeed)
      .catch(() => {})

    page
      .waitForFunction(
        () => {
          const buttons = document.querySelectorAll('[data-testid="comparison-submit-button"]')
          for (const el of buttons) {
            if (!(el instanceof HTMLButtonElement)) continue
            if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue
            return el.getAttribute('aria-disabled') === 'true'
          }
          return false
        },
        { timeout: Math.min(20000, remaining()) }
      )
      .then(() =>
        page.waitForFunction(
          () => {
            const buttons = document.querySelectorAll('[data-testid="comparison-submit-button"]')
            for (const el of buttons) {
              if (!(el instanceof HTMLButtonElement)) continue
              if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue
              return el.getAttribute('aria-disabled') === 'false'
            }
            return false
          },
          { timeout: remaining() }
        )
      )
      .then(succeed)
      .catch(() => {})
  })
}

/**
 * WebKit (especially mobile) often reports fixed/sticky composer buttons as outside the viewport for
 * Playwright pointer clicks even with `force: true` after scroll. A DOM `click()` on the visible
 * node avoids that and still runs React's onClick.
 */
async function clickVisibleCompareSubmitButton(page: Page): Promise<void> {
  await page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="comparison-submit-button"]'
    )
    for (const btn of nodes) {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue
      const cs = window.getComputedStyle(btn)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      const rect = btn.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      if (typeof btn.checkVisibility === 'function' && !btn.checkVisibility()) continue
      btn.scrollIntoView({ block: 'center', inline: 'nearest' })
      btn.click()
      return
    }
    throw new Error('No visible comparison-submit-button to click')
  })
}

/**
 * Registers the stream listener, asserts submit is enabled, clicks Compare, then waits until
 * the stream is settled (network body finished and/or UI shows comparison finished).
 * By default also waits for `.result-card.conversation-card` in the DOM so Firefox/CI does not
 * assert before React commits. Set `waitForCardAttachment: false` when the test handles missing
 * grids/API skips itself (e.g. optional CI API key).
 */
export async function submitAndAwaitCompareStream(
  page: Page,
  options: { timeoutMs?: number; waitForCardAttachment?: boolean } = {}
): Promise<void> {
  // Default below typical 120s describe timeout so settle + card attachment can still run.
  const { timeoutMs = 110000, waitForCardAttachment = true } = options
  // Prefer the visible control (floating composer / responsive branches can leave extra nodes in DOM).
  const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
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

  await submit.scrollIntoViewIfNeeded().catch(() => {})

  // Register the response waiter in the same tick as the submit action (Promise.all) so nothing can
  // slip between listener setup and navigation; do not start the waiter before the button is ready.
  const [response] = await Promise.all([
    page.waitForResponse(matchesCompareStreamPost, { timeout: timeoutMs }),
    clickVisibleCompareSubmitButton(page),
  ])

  await raceCompareStreamSettled(page, response, timeoutMs)

  if (!waitForCardAttachment) return
  const cardWait = Math.max(5000, Math.min(timeoutMs - 5000, 90000))
  await page
    .locator('.result-card.conversation-card')
    .first()
    .waitFor({ state: 'visible', timeout: cardWait })
}
