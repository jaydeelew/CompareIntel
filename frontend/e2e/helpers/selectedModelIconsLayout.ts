import type { Page } from '@playwright/test'

import { MODEL_LIMITS } from '../../src/config/constants'
import { dismissTutorialOverlay } from '../fixtures'

import { dismissMobileBlockers, toggleModelCheckbox } from './modelCheckbox'

function tierModel(id: string, name: string, provider: string, tierAccess: 'free' | 'pro_plus') {
  return {
    id,
    name,
    provider,
    tier_access: tierAccess,
    supports_temperature: true,
    supports_vision: false,
    supports_image_generation: false,
    max_input_tokens: 128000,
    max_output_tokens: 16384,
    is_thinking_model: false,
  }
}

/** Twelve distinct models under one provider so the picker stays on one expanded dropdown. */
export function buildTwelveModelCatalog() {
  const models = Array.from({ length: MODEL_LIMITS.pro_plus }, (_, i) =>
    tierModel(`openai/hero-icon-mock-${i}`, `Hero Icon Mock ${i + 1}`, 'OpenAI', 'pro_plus')
  )
  return {
    models,
    models_by_provider: { OpenAI: models },
    user_tier: 'pro_plus',
    is_trial_active: false,
  }
}

export async function mockProPlusHomeForIconLayout(page: Page): Promise<void> {
  const catalog = buildTwelveModelCatalog()
  await page.route('**/api/models', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalog),
    })
  })

  await page.route('**/api/anonymous-mock-mode-status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ anonymous_mock_mode_enabled: false, is_development: false }),
    })
  })

  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: 'pro_plus-icon-layout@test.com',
        is_active: true,
        is_verified: true,
        is_admin: false,
        subscription_tier: 'pro_plus',
        model_limit: MODEL_LIMITS.pro_plus,
        credits_remaining: 5000,
        credits_allocated: 5000,
        credits_used_this_period: 0,
        overage_allowed: true,
        overage_price: 0.013,
        monthly_overage_count: 0,
        reset_time: new Date().toISOString(),
      }),
    })
  })

  await page.addInitScript(() => {
    localStorage.setItem('compareintel_starter_selection_opted_out', 'true')
    localStorage.setItem('compareintel_test_comparison_opted_out', 'true')
  })
}

export async function selectModelCount(
  page: Page,
  count: number,
  projectName: string
): Promise<void> {
  await dismissMobileBlockers(page)
  const openaiHeader = page.locator(
    '.provider-dropdown[data-provider-name="OpenAI"] .provider-header'
  )
  await openaiHeader.scrollIntoViewIfNeeded()
  if ((await openaiHeader.getAttribute('aria-expanded')) !== 'true') {
    await openaiHeader.click()
  }
  await openaiHeader.getAttribute('aria-expanded')
  const checkboxes = page.locator(
    'input.model-checkbox[id^="model-checkbox-openai/hero-icon-mock-"]'
  )
  const available = await checkboxes.count()
  const toSelect = Math.min(count, available)
  for (let i = 0; i < toSelect; i++) {
    const cb = checkboxes.nth(i)
    if (!(await cb.isChecked())) {
      await toggleModelCheckbox(cb, projectName)
    }
  }
}

export async function waitForHeroStable(page: Page): Promise<void> {
  await page.locator('.hero-section').waitFor({ state: 'visible', timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

export async function measureIconsInViewport(page: Page): Promise<{
  allVisible: boolean
  iconCount: number
  trackFit: string | null
  overflows: Array<{ left: number; right: number }>
}> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const icons = Array.from(document.querySelectorAll('[data-testid="selected-model-icon"]'))
    const overflows: Array<{ left: number; right: number }> = []
    let allVisible = true
    for (const el of icons) {
      const r = el.getBoundingClientRect()
      if (r.left < -1 || r.right > viewportWidth + 1) {
        allVisible = false
        overflows.push({ left: r.left, right: r.right })
      }
    }
    const track = document.querySelector('.selected-model-icons-track')
    return {
      allVisible,
      iconCount: icons.length,
      trackFit: track?.getAttribute('data-track-fit') ?? null,
      overflows,
    }
  })
}

export async function measureHeroHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero-section') as HTMLElement | null
    return hero ? Math.round(hero.getBoundingClientRect().height) : 0
  })
}

/** Icons are absolutely positioned below credits; clip captures both for visual regression. */
export async function screenshotCreditsAndIconRow(page: Page, path: string): Promise<void> {
  const clip = await page.evaluate(() => {
    const icons = document
      .querySelector('[data-testid="selected-model-icons"]')
      ?.getBoundingClientRect()
    const credits = document
      .querySelector('.credits-remaining-wrapper, .usage-preview-container')
      ?.getBoundingClientRect()
    if (!icons) return null
    const pad = 6
    const top = Math.max(0, (credits?.top ?? icons.top) - pad)
    const bottom = Math.min(window.innerHeight, icons.bottom + pad)
    return {
      x: Math.max(0, icons.left - pad),
      y: top,
      width: Math.min(window.innerWidth, icons.width + pad * 2),
      height: Math.max(icons.height, bottom - top),
    }
  })
  if (!clip) {
    throw new Error('Could not measure credits/icon row for screenshot')
  }
  await page.screenshot({ path, clip })
}

export async function prepareHeroForIconLayout(
  page: Page,
  viewport: { width: number; height: number }
): Promise<void> {
  await page.setViewportSize(viewport)
  await mockProPlusHomeForIconLayout(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
  await waitForHeroStable(page)
  await dismissTutorialOverlay(page)
}
