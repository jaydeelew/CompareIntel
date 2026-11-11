/**
 * Done Selecting card — close control vs heading layout
 *
 * Loads app styles on the homepage, then mounts the production card markup to
 * assert the dismiss control does not overlap the title text.
 *
 * Run:
 *   npm run test:e2e -- --grep "Done Selecting card layout" --project=chromium
 */

import type { Page } from '@playwright/test'

import { test, expect, dismissTutorialOverlay, waitForReactHydration } from './fixtures'

const VIEWPORTS = [
  { width: 360, height: 740, label: '360px' },
  { width: 412, height: 915, label: '412px' },
  { width: 1280, height: 800, label: 'desktop' },
] as const

const MIN_TEXT_CLOSE_GAP_PX = 8

async function mountDoneSelectingCardForLayoutTest(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('.done-selecting-card').forEach(el => el.remove())

    const card = document.createElement('div')
    card.className = 'done-selecting-card'
    card.innerHTML = `
      <div class="done-selecting-content">
        <button type="button" class="done-selecting-close-button" aria-label="Close done selecting card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h3>Done Selecting?</h3>
        <button type="button" class="done-selecting-button" aria-label="Done selecting models">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L8 20L2 16"></path>
          </svg>
        </button>
      </div>
    `
    document.body.appendChild(card)
  })
}

async function measureHeadingCloseSeparation(page: Page) {
  return page.evaluate((minGap: number) => {
    const heading = document.querySelector('.done-selecting-content h3')
    const close = document.querySelector('.done-selecting-close-button')
    const content = document.querySelector('.done-selecting-content')
    if (!heading || !close || !content) {
      return { ok: false, reason: 'missing-elements' as const }
    }

    const closeRect = close.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(heading)
    const textRect = range.getBoundingClientRect()

    const horizontalGap = closeRect.left - textRect.right
    const verticalOverlap =
      textRect.bottom > closeRect.top + minGap && textRect.top < closeRect.bottom - minGap
    const horizontalClear = horizontalGap >= minGap
    const overlaps = verticalOverlap && !horizontalClear

    const topInset = closeRect.top - contentRect.top
    const rightInset = contentRect.right - closeRect.right

    return {
      ok: !overlaps,
      horizontalGap,
      verticalOverlap,
      topInset,
      rightInset,
      closeWidth: closeRect.width,
      closeHeight: closeRect.height,
    }
  }, MIN_TEXT_CLOSE_GAP_PX)
}

test.describe('Done Selecting card layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`close button does not crowd heading at ${viewport.label}`, async ({ page, context }) => {
      await context.clearCookies()
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await waitForReactHydration(page)
      await dismissTutorialOverlay(page)

      await mountDoneSelectingCardForLayoutTest(page)
      await expect(page.getByRole('heading', { name: 'Done Selecting?' })).toBeVisible()

      const metrics = await measureHeadingCloseSeparation(page)
      expect(metrics.ok, JSON.stringify(metrics)).toBe(true)
      expect(metrics.topInset ?? 0).toBeGreaterThanOrEqual(4)
      expect(metrics.rightInset ?? 0).toBeGreaterThanOrEqual(4)

      const touchTarget = await page.locator('.done-selecting-close-button').evaluate(el => {
        const style = getComputedStyle(el)
        return {
          minWidth: parseFloat(style.minWidth),
          minHeight: parseFloat(style.minHeight),
        }
      })
      expect(touchTarget.minWidth).toBeGreaterThanOrEqual(44)
      expect(touchTarget.minHeight).toBeGreaterThanOrEqual(44)
    })
  }
})
