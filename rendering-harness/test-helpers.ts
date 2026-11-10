import { Page } from '@playwright/test'
import { harnessRenderReady } from './render-ready.js'

/**
 * Wait until visible text is in the page and KaTeX is no longer mid-layout, or
 * the renderer marked a failure. The wait polls that DOM state. It does not
 * sleep for a fixed delay and does not use networkidle. The timeout is only
 * the failure deadline.
 */
export async function waitForHarnessRender(page: Page): Promise<void> {
  await page.waitForFunction(harnessRenderReady, { timeout: 30000 })
  const failed = page.locator('[data-render-failed]').first()
  if ((await failed.count()) > 0) {
    const reason =
      (await failed.getAttribute('data-render-failed')) ||
      (await page.locator('[data-render-container]').getAttribute('data-render-failed')) ||
      'unknown'
    throw new Error(`Harness render failed: ${reason}`)
  }
}
