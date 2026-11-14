/**
 * Hero meta stack (credits → selected-model icons → pricing) must not overlap after
 * "Start over", including the follow-up path with a floating composer below the results.
 */
import type { Page } from '@playwright/test'

import { test, expect, dismissTutorialOverlay } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { mockComparisonStream, mockModelsApi } from './helpers/mockModels'
import { dismissMobileBlockers } from './helpers/modelCheckbox'

const MOBILE_WIDTH = 412
const MOBILE_HEIGHT = 915
const HERO_HEIGHT_TOLERANCE = 1

function isMobileChromeOrSafari(projectName: string): boolean {
  return projectName.startsWith('Mobile Chrome') || projectName.startsWith('Mobile Safari')
}

async function mockAnonHome(page: Page): Promise<void> {
  await mockModelsApi(page, 'unregistered')
  await mockComparisonStream(page)
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
}

async function waitForStableLayout(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

type StackMeasurement = {
  heroHeight: number
  credits: { top: number; bottom: number } | null
  icons: { top: number; bottom: number } | null
  pricing: { top: number; bottom: number } | null
}

async function measureHeroMetaStack(page: Page): Promise<StackMeasurement> {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero-section')
    if (!hero) {
      return { heroHeight: 0, credits: null, icons: null, pricing: null }
    }
    const box = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    return {
      heroHeight: Math.round(hero.getBoundingClientRect().height),
      credits: box(hero.querySelector('.credits-remaining-wrapper')),
      icons: box(hero.querySelector('[data-testid="selected-model-icons"]')),
      pricing: box(hero.querySelector('.hero-pricing-line')),
    }
  })
}

function overlap2d(
  a: { top: number; bottom: number; left?: number; right?: number },
  b: { top: number; bottom: number; left?: number; right?: number },
  tolerance = 1
): boolean {
  const horizontal =
    a.left == null ||
    b.left == null ||
    b.right == null ||
    a.right == null ||
    !(a.right <= b.left + tolerance || a.left >= b.right - tolerance)
  const vertical = !(a.bottom <= b.top + tolerance || a.top >= b.bottom - tolerance)
  return horizontal && vertical
}

function assertStackOrder(m: StackMeasurement): void {
  expect(m.credits, 'credits line should be present').not.toBeNull()
  expect(m.pricing, 'pricing line should be present in hero').not.toBeNull()
  const stackBottom = m.icons?.bottom ?? m.credits!.bottom
  expect(
    m.pricing!.top,
    'pricing should sit below credits and selected-model icons'
  ).toBeGreaterThanOrEqual(stackBottom - 1)
  expect(overlap2d(m.credits!, m.pricing!)).toBe(false)
  if (m.icons) {
    expect(overlap2d(m.icons, m.pricing!)).toBe(false)
  }
}

async function assertHeroMetaSettled(page: Page): Promise<StackMeasurement> {
  let last: StackMeasurement | null = null
  await expect(async () => {
    last = await measureHeroMetaStack(page)
    assertStackOrder(last)
  }).toPass({ timeout: 20000, intervals: [50, 100, 250] })
  return last!
}

async function prepareMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT })
}

async function runComparisonFromHero(page: Page, prompt: string): Promise<void> {
  const textarea = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
  await expect(textarea).toBeVisible({ timeout: 20000 })
  await textarea.fill(prompt)
  await dismissMobileBlockers(page)
  await submitAndAwaitCompareStream(page, { timeoutMs: 60000 })
  await expect(page.locator('.follow-up-header, h2:has-text("Start over")').first()).toBeVisible({
    timeout: 30000,
  })
}

/** Exit follow-up via the real control (header h2 is not clickable; hero + floater duplicate the header). */
async function tapStartOver(page: Page, projectName: string): Promise<void> {
  const exitFollowUp = page.getByTestId('exit-follow-up-button').filter({ visible: true }).first()
  await expect(
    page.locator('.follow-up-header:has-text("Start over"), h2:has-text("Start over")').first()
  ).toBeVisible({ timeout: 15000 })
  await expect(exitFollowUp).toBeVisible({ timeout: 15000 })
  await expect(exitFollowUp).toBeEnabled({ timeout: 15000 })
  if (isMobileChromeOrSafari(projectName)) {
    await exitFollowUp.evaluate(el => {
      ;(el as HTMLElement).click()
    })
  } else {
    await exitFollowUp.click()
  }
  await expect(page.getByTestId('exit-follow-up-button').filter({ visible: true })).toHaveCount(0, {
    timeout: 20000,
  })
  await expect(page.locator('.hero-section .hero-pricing-line')).toBeVisible({ timeout: 30000 })
  await page.locator('.hero-section').scrollIntoViewIfNeeded()
  await waitForStableLayout(page)
}

async function scrollPastHeroForFloatingComposer(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(page.locator('.composer-below-results-stack').first()).toBeVisible({
    timeout: 15000,
  })
  await waitForStableLayout(page)
}

test.describe('Hero pricing stack after Start over', () => {
  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !isMobileChromeOrSafari(testInfo.project.name),
      'Layout regression runs on Mobile Chrome and Mobile Safari only'
    )
    test.setTimeout(120000)
  })

  test.beforeEach(async ({ page }) => {
    await prepareMobileViewport(page)
  })

  test('normal follow-up Start over keeps credits, icons, and pricing separated', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dismissed', 'true')
    })
    await mockAnonHome(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await dismissTutorialOverlay(page)
    await waitForStableLayout(page)

    const baselineHero = await measureHeroMetaStack(page)

    await runComparisonFromHero(page, 'What is photosynthesis in one sentence?')
    await tapStartOver(page, testInfo.project.name)

    const after = await assertHeroMetaSettled(page)
    expect(
      Math.abs(after.heroHeight - baselineHero.heroHeight),
      'hero height should not change across Start over'
    ).toBeLessThanOrEqual(HERO_HEIGHT_TOLERANCE)
  })

  test('floating composer after scroll + Start over keeps hero meta stack separated', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dismissed', 'true')
    })
    await mockAnonHome(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await dismissTutorialOverlay(page)
    await waitForStableLayout(page)

    const baselineHero = await measureHeroMetaStack(page)

    await runComparisonFromHero(page, 'Summarize three pros of remote work.')
    await scrollPastHeroForFloatingComposer(page)
    await tapStartOver(page, testInfo.project.name)

    const after = await assertHeroMetaSettled(page)
    expect(Math.abs(after.heroHeight - baselineHero.heroHeight)).toBeLessThanOrEqual(
      HERO_HEIGHT_TOLERANCE
    )
    expect(after.icons).not.toBeNull()
  })
})
