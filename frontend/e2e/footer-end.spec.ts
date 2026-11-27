/**
 * Desktop page bottom. The footer is the last box in the scroll: body background
 * must not show as a blank band under the copyright. Section heights match the
 * master measurement at 1440×900 with the mocked catalog (hero matches the
 * production layout-regression baseline).
 */

import { test, expect, ensureUnfoldedNavbar } from './fixtures'
import { mockModelsApi } from './helpers/mockModels'

const HEIGHTS = {
  hero: 836,
  models: 816,
  main: 1668,
  composer: 89,
  footer: 144,
} as const

/** Models and main grow with the catalog text. Font swap moves them by a couple of pixels. */
const CONTENT_TOLERANCE = 2

test.describe('Footer ends the desktop page', () => {
  test('1440x900 footer is the last block and section heights match master', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop Chromium only')

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dismissed', 'true')
    })
    await mockModelsApi(page, 'unregistered')
    await page.route('**/api/anonymous-mock-mode-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ anonymous_mock_mode_enabled: false, is_development: false }),
      })
    })
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.hero-section').waitFor({ state: 'visible' })
    await page.locator('.models-section').waitFor({ state: 'visible' })
    await page.locator('footer').waitFor({ state: 'attached' })
    await page.evaluate(() => document.fonts.ready)
    // The desktop bar folds after 5s. Folded, the hero is 100vh (900) instead of
    // 100vh minus the 64px bar (836). Hold it open so this stays the open-navbar baseline.
    await ensureUnfoldedNavbar(page)

    const measured = await page.evaluate(() => {
      const height = (selector: string) => {
        const el = document.querySelector(selector)
        return el ? Math.round(el.getBoundingClientRect().height) : null
      }
      const se = document.scrollingElement
      if (!se) return null
      se.scrollTop = se.scrollHeight
      const footer = document.querySelector('footer')
      if (!(footer instanceof HTMLElement)) return null
      const foot = footer.getBoundingClientRect()
      const footerDocBottom = foot.bottom + window.scrollY
      let pastFooter = 0
      for (const el of document.body.querySelectorAll('*')) {
        const box = el.getBoundingClientRect()
        if (box.height < 1 || box.width < 1) continue
        const bottom = box.bottom + window.scrollY
        if (bottom > footerDocBottom + 1) pastFooter += 1
      }
      return {
        hero: height('.hero-section'),
        models: height('.models-section'),
        main: height('main.app-main'),
        composer: height('.hero-section .composer:not(.composer-placeholder)'),
        footer: Math.round(foot.height),
        gap: Math.round(se.scrollHeight - footerDocBottom),
        pastFooter,
        htmlPad: getComputedStyle(document.documentElement).paddingBottom,
        bodyPad: getComputedStyle(document.body).paddingBottom,
      }
    })

    expect(measured, 'footer measurement').not.toBeNull()
    expect(measured!.gap, 'blank band below the footer').toBeLessThanOrEqual(1)
    expect(measured!.pastFooter, 'elements extending past the footer').toBe(0)
    expect(measured!.htmlPad).toBe('0px')
    expect(measured!.bodyPad).toBe('0px')
    expect(measured!.hero).toBe(HEIGHTS.hero)
    expect(Math.abs((measured!.models ?? 0) - HEIGHTS.models)).toBeLessThanOrEqual(
      CONTENT_TOLERANCE
    )
    expect(Math.abs((measured!.main ?? 0) - HEIGHTS.main)).toBeLessThanOrEqual(CONTENT_TOLERANCE)
    expect(measured!.composer).toBe(HEIGHTS.composer)
    expect(measured!.footer).toBe(HEIGHTS.footer)
  })
})
