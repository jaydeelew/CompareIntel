/**
 * Hero selected-model provider icons.
 *
 * Icons sit in the existing credits→pricing gap (no extra hero height), one
 * carousel ProviderIcon per selected model in selection order.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { MODEL_LIMITS } from '../src/config/constants'

import { dismissTutorialOverlay, ensureUnfoldedNavbar, test, expect } from './fixtures'
import { mockModelsApi } from './helpers/mockModels'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'
import {
  measureHeroHeight,
  measureIconsInViewport,
  prepareHeroForIconLayout,
  selectModelCount,
} from './helpers/selectedModelIconsLayout'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SCREENSHOT_DIR = join(__dirname, '../test-results/selected-model-icons')

async function mockSignedOutHome(page: import('@playwright/test').Page) {
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
  // These tests measure icons from an explicit empty→selected path. Opt out of
  // the anonymous Starter Selection so it cannot pre-check two models.
  await page.addInitScript(() => {
    localStorage.setItem('compareintel_starter_selection_opted_out', 'true')
    localStorage.setItem('compareintel_test_comparison_opted_out', 'true')
  })
}

async function waitForHero(page: import('@playwright/test').Page) {
  await page.locator('.hero-section').waitFor({ state: 'visible', timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

async function measureHeroLayout(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero-section') as HTMLElement | null
    const credits = document.querySelector('.credits-remaining-wrapper') as HTMLElement | null
    const pricing = document.querySelector('.hero-pricing-line') as HTMLElement | null
    const icons = document.querySelector(
      '[data-testid="selected-model-icons"]'
    ) as HTMLElement | null
    if (!hero || !credits) return null
    const heroBox = hero.getBoundingClientRect()
    const creditsBox = credits.getBoundingClientRect()
    const pricingBox = pricing?.getBoundingClientRect() ?? null
    const iconsBox = icons?.getBoundingClientRect() ?? null
    const overlapPricing =
      iconsBox && pricingBox
        ? !(
            iconsBox.bottom <= pricingBox.top + 1 ||
            iconsBox.top >= pricingBox.bottom - 1 ||
            iconsBox.right <= pricingBox.left + 1 ||
            iconsBox.left >= pricingBox.right - 1
          )
        : false
    const shell = document.querySelector('.app-header-shell')
    const shellHeight = shell?.getBoundingClientRect().height ?? 0
    const navbarFolded = shell?.classList.contains('app-header-shell--folded') ?? false
    return {
      heroHeight: Math.round(heroBox.height),
      creditsBottom: creditsBox.bottom,
      pricingTop: pricingBox?.top ?? null,
      iconsTop: iconsBox?.top ?? null,
      iconsBottom: iconsBox?.bottom ?? null,
      overlapPricing,
      // Hero min-height drops --navbar-height while this class is present.
      // Read it in the same frame as heroHeight so the two cannot disagree.
      navbarOpen: !navbarFolded && shellHeight > 40,
    }
  })
}

/** Hero height is only comparable while the navbar is open. Wait until a measurement says so. */
async function measureOpenHeroLayout(page: import('@playwright/test').Page) {
  let layout: Awaited<ReturnType<typeof measureHeroLayout>> = null
  await expect
    .poll(
      async () => {
        layout = await measureHeroLayout(page)
        if (layout?.navbarOpen) return 'open'
        await ensureUnfoldedNavbar(page)
        layout = await measureHeroLayout(page)
        return layout?.navbarOpen ? 'open' : 'closed'
      },
      { timeout: 15000, intervals: [50, 100, 100] }
    )
    .toBe('open')
  return layout
}

test.describe('Hero selected-model icons', () => {
  test('desktop: order, duplicate providers, tooltip, unchanged hero height', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Layout screenshots and height checks run on desktop Chromium CSS width'
    )

    await page.setViewportSize({ width: 1280, height: 800 })
    await mockSignedOutHome(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await waitForHero(page)
    await dismissTutorialOverlay(page)
    // Desktop navbar folds ~5s after load. Folded vs open changes hero
    // min-height by --navbar-height (736 vs 800 at this viewport).
    await expect(page.getByTestId('selected-model-icons')).toHaveCount(0)
    const before = await measureOpenHeroLayout(page)
    expect(before).not.toBeNull()

    await dismissMobileBlockers(page)
    const openaiHeader = page.locator(
      '.provider-dropdown[data-provider-name="OpenAI"] .provider-header'
    )
    await openaiHeader.scrollIntoViewIfNeeded()
    if ((await openaiHeader.getAttribute('aria-expanded')) !== 'true') {
      await openaiHeader.click()
    }
    await expect(openaiHeader).toHaveAttribute('aria-expanded', 'true')

    await toggleModelCheckbox(
      page.getByTestId('model-checkbox-openai/gpt-4o-mini'),
      testInfo.project.name
    )
    await toggleModelCheckbox(
      page.getByTestId('model-checkbox-openai/gpt-3.5-turbo'),
      testInfo.project.name
    )

    const icons = page.getByTestId('selected-model-icon')
    await expect(icons).toHaveCount(2)
    await expect(icons.nth(0)).toHaveAttribute('aria-label', 'GPT-4o Mini')
    await expect(icons.nth(1)).toHaveAttribute('aria-label', 'GPT-3.5 Turbo')
    await expect(icons.nth(0)).toHaveAttribute('data-provider', 'OpenAI')
    await expect(icons.nth(1)).toHaveAttribute('data-provider', 'OpenAI')

    // Re-open the navbar before hover. A fold mid-hover moves the icon out
    // from under the pointer and unmounts the tooltip.
    await ensureUnfoldedNavbar(page)
    await icons.nth(0).hover()
    await expect(page.getByRole('tooltip')).toHaveText('GPT-4o Mini')
    await expect(page.getByRole('tooltip')).not.toHaveText('OpenAI')

    const after = await measureOpenHeroLayout(page)
    expect(after).not.toBeNull()
    expect(after!.heroHeight).toBe(before!.heroHeight)
    expect(after!.iconsTop).not.toBeNull()
    expect(after!.iconsTop!).toBeGreaterThanOrEqual(after!.creditsBottom - 8)
    if (after!.pricingTop != null) {
      expect(after!.iconsTop!).toBeLessThan(after!.pricingTop)
      expect(after!.overlapPricing).toBe(false)
    }

    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const shotPath = join(SCREENSHOT_DIR, 'desktop-1280.png')
    await page.locator('.hero-section').screenshot({ path: shotPath })
    writeFileSync(
      join(SCREENSHOT_DIR, 'desktop-1280-meta.json'),
      JSON.stringify({ before, after }, null, 2)
    )
  })

  test('mobile CSS width: tap shows bottom name, no floating tooltip, unchanged hero height', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Real CSS width (390px), not a zoomed desktop viewport'
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await mockSignedOutHome(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await waitForHero(page)
    await dismissTutorialOverlay(page)

    await expect(page.getByTestId('selected-model-icons')).toHaveCount(0)

    const before = await measureHeroLayout(page)
    expect(before).not.toBeNull()

    await dismissMobileBlockers(page)
    const openaiHeader = page.locator(
      '.provider-dropdown[data-provider-name="OpenAI"] .provider-header'
    )
    await openaiHeader.scrollIntoViewIfNeeded()
    if ((await openaiHeader.getAttribute('aria-expanded')) !== 'true') {
      await openaiHeader.click()
    }
    await expect(openaiHeader).toHaveAttribute('aria-expanded', 'true')
    await toggleModelCheckbox(
      page.getByTestId('model-checkbox-openai/gpt-4o-mini'),
      testInfo.project.name
    )

    const icon = page.getByTestId('selected-model-icon')
    await expect(icon).toHaveCount(1)
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    await icon.click()
    const sheet = page.getByTestId('selected-model-name-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('GPT-4o Mini')
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    const sheetBox = await sheet.boundingBox()
    expect(sheetBox).not.toBeNull()
    const viewport = page.viewportSize()!
    expect(sheetBox!.y + sheetBox!.height).toBeGreaterThan(viewport.height * 0.55)

    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(sheet).toHaveCount(0)

    await icon.click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('selected-model-name-sheet')).toHaveCount(0)

    const after = await measureHeroLayout(page)
    expect(after).not.toBeNull()
    expect(after!.heroHeight).toBe(before!.heroHeight)

    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.locator('.hero-section').screenshot({ path: join(SCREENSHOT_DIR, 'mobile-390.png') })
    writeFileSync(
      join(SCREENSHOT_DIR, 'mobile-390-meta.json'),
      JSON.stringify({ before, after }, null, 2)
    )
  })
})

const MOBILE_VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const

const ICON_COUNTS = [6, 8, 9, 12] as const

test.describe('Hero selected-model icons width fit', () => {
  test('mobile widths: icons stay in viewport and hero height is stable', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Width-fit checks use mobile CSS breakpoints on Chromium'
    )

    for (const viewport of MOBILE_VIEWPORTS) {
      await prepareHeroForIconLayout(page, viewport)
      const baselineHeight = await measureHeroHeight(page)
      expect(baselineHeight).toBeGreaterThan(0)

      for (const count of ICON_COUNTS) {
        await selectModelCount(page, count, testInfo.project.name)
        const icons = page.getByTestId('selected-model-icon')
        await expect(icons).toHaveCount(count)

        await page.evaluate(
          () =>
            new Promise<void>(resolve => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            })
        )

        const layout = await measureIconsInViewport(page)
        expect(layout.iconCount).toBe(count)
        expect(layout.allVisible, JSON.stringify(layout.overflows)).toBe(true)

        const height = await measureHeroHeight(page)
        expect(height).toBe(baselineHeight)

        if (viewport.width === 412 && (count === 9 || count === 12)) {
          mkdirSync(SCREENSHOT_DIR, { recursive: true })
          await page
            .locator('.hero-section')
            .screenshot({ path: join(SCREENSHOT_DIR, `mobile-412-${count}-icons.png`) })
        }
      }
    }
  })

  test('desktop: max models visible without horizontal clip', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop layout checks on Chromium')

    await prepareHeroForIconLayout(page, { width: 1280, height: 800 })
    const before = await measureOpenHeroLayout(page)
    expect(before).not.toBeNull()

    await selectModelCount(page, MODEL_LIMITS.pro_plus, testInfo.project.name)
    await expect(page.getByTestId('selected-model-icon')).toHaveCount(MODEL_LIMITS.pro_plus)
    await ensureUnfoldedNavbar(page)

    const layout = await measureIconsInViewport(page)
    expect(layout.allVisible, JSON.stringify(layout.overflows)).toBe(true)

    const after = await measureOpenHeroLayout(page)
    expect(after).not.toBeNull()
    expect(after!.heroHeight).toBe(before!.heroHeight)

    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page
      .locator('.hero-section')
      .screenshot({ path: join(SCREENSHOT_DIR, 'desktop-1280-max-icons.png') })
  })
})
