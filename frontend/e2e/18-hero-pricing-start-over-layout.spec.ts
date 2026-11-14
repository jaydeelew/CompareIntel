/**
 * Hero meta stack (credits → selected-model icons → pricing) must not overlap after
 * "Start over", including the tutorial follow-up / floating-composer path.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import type { Page } from '@playwright/test'

import { TUTORIAL_GOOGLE_MODEL_IDS } from '../src/data/tutorialSteps'

import {
  test,
  expect,
  dismissTutorialOverlay,
  dismissBlockingOnboardingOverlays,
} from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const baselines = JSON.parse(
  readFileSync(join(__dirname, 'layout-regression-baselines.json'), 'utf-8')
)

const MOBILE_WIDTH = 412
const MOBILE_HEIGHT = 915
const HERO_HEIGHT_TOLERANCE = 1

const MOCK_TUTORIAL_MODELS = {
  Google: TUTORIAL_GOOGLE_MODEL_IDS.map((id, i) => ({
    id,
    name: i === 0 ? 'Gemma 3 27B It' : 'Gemini 3.1 Flash Lite Preview',
    provider: 'Google',
    tier_access: 'unregistered',
    supports_temperature: true,
    supports_vision: false,
    supports_image_generation: false,
    max_input_tokens: 128000,
    max_output_tokens: 16384,
    is_thinking_model: false,
  })),
  OpenAI: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: true,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      is_thinking_model: false,
    },
  ],
}

function isMobileChromeOrSafari(projectName: string): boolean {
  return projectName.startsWith('Mobile Chrome') || projectName.startsWith('Mobile Safari')
}

async function mockAnonHome(page: Page, modelsByProvider = MOCK_TUTORIAL_MODELS) {
  const models = Object.values(modelsByProvider).flat()
  await page.route('**/api/models', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models,
        models_by_provider: modelsByProvider,
        user_tier: 'unregistered',
        is_trial_active: false,
      }),
    })
  })
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
    const credits = document.querySelector('.credits-remaining-wrapper')
    const icons = document.querySelector('[data-testid="selected-model-icons"]')
    const pricing = document.querySelector('.hero-pricing-line')
    const box = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    return {
      heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
      credits: box(credits),
      icons: box(icons),
      pricing: box(pricing),
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
  expect(m.pricing, 'pricing line should be present').not.toBeNull()
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
  }).toPass({ timeout: 15000, intervals: [50, 100, 250] })
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
  await expect(
    page.locator('.follow-up-header, h2:has-text("Start over")').first()
  ).toBeVisible({ timeout: 30000 })
}

async function tapStartOver(page: Page): Promise<void> {
  const startOver = page
    .locator('.follow-up-header:has-text("Start over"), h2:has-text("Start over")')
    .first()
  await expect(startOver).toBeVisible({ timeout: 15000 })
  await startOver.click()
  await page
    .waitForFunction(
      () =>
        !document.querySelector('.follow-up-header') &&
        document.querySelector('.hero-pricing-line'),
      null,
      { timeout: 15000 }
    )
    .catch(() => {})
  await expect
    .poll(async () => page.locator('input.model-checkbox:checked').count(), { timeout: 15000 })
    .toBeGreaterThanOrEqual(1)
    .catch(() => {})
  await waitForStableLayout(page)
}

test.describe('Hero pricing stack after Start over', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !isMobileChromeOrSafari(testInfo.project.name),
      'Layout regression runs on Mobile Chrome and Mobile Safari only'
    )
    test.setTimeout(120000)
    await prepareMobileViewport(page)
  })

  test('normal follow-up Start over keeps credits, icons, and pricing separated', async ({
    page,
  }) => {
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
    const productionHeight = baselines.hero.viewports['390x844']?.light ?? baselineHero.heroHeight

    await runComparisonFromHero(page, 'What is photosynthesis in one sentence?')
    await tapStartOver(page)

    const after = await assertHeroMetaSettled(page)
    expect(
      Math.abs(after.heroHeight - baselineHero.heroHeight),
      'hero height should not change across Start over'
    ).toBeLessThanOrEqual(HERO_HEIGHT_TOLERANCE)
    expect(
      after.heroHeight,
      'hero height should match production baseline at mobile width'
    ).toBeGreaterThanOrEqual(productionHeight - HERO_HEIGHT_TOLERANCE)
    expect(after.heroHeight).toBeLessThanOrEqual(productionHeight + HERO_HEIGHT_TOLERANCE)
  })

  test('tutorial follow-up Start over keeps credits, icons, and pricing separated', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.removeItem('compareintel_tutorial_completed')
      localStorage.setItem('compareintel_welcome_dismissed', 'true')
      localStorage.setItem('compareintel_starter_selection_opted_out', 'true')
    })
    await mockAnonHome(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await dismissBlockingOnboardingOverlays(page)

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip').first()).toBeVisible({
      timeout: 10000,
    })

    const googleHeader = page
      .locator('.provider-dropdown[data-provider-name="Google"] .provider-header')
      .first()
    if ((await googleHeader.getAttribute('aria-expanded')) !== 'true') {
      await googleHeader.click()
    }
    await dismissMobileBlockers(page)

    for (const modelId of TUTORIAL_GOOGLE_MODEL_IDS) {
      await toggleModelCheckbox(page.getByTestId(`model-checkbox-${modelId}`), testInfo.project.name)
    }

    const baselineHero = await measureHeroMetaStack(page)

    await runComparisonFromHero(page, 'Compare these models briefly.')
    await tapStartOver(page)

    const after = await assertHeroMetaSettled(page)
    expect(Math.abs(after.heroHeight - baselineHero.heroHeight)).toBeLessThanOrEqual(
      HERO_HEIGHT_TOLERANCE
    )
    expect(after.icons).not.toBeNull()
  })
})