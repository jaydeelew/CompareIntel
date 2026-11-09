import { Page } from '@playwright/test'

/**
 * Wait until the harness actually finished rendering, or failed with a reason.
 * A timeout here is a diagnostic failure, never treated as success.
 */
export async function waitForHarnessRender(page: Page): Promise<void> {
  await page.waitForSelector('[data-render-complete], [data-render-failed]', {
    timeout: 30000,
  })
  const failed = page.locator('[data-render-failed]').first()
  if ((await failed.count()) > 0) {
    const reason =
      (await failed.getAttribute('data-render-failed')) ||
      (await page.locator('[data-render-container]').getAttribute('data-render-failed')) ||
      'unknown'
    throw new Error(`Harness render failed: ${reason}`)
  }
}
