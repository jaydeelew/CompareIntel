/**
 * Manual / agent evidence only — hits live /api/link-preview (no mocks).
 * Run when backend is up: npx playwright test e2e/link-preview-real-screenshots.spec.ts
 */
import { expect, test } from '@playwright/test'

import { dismissTutorialOverlay } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const MODEL_ID = 'openai/gpt-4o-mini'
const REAL_LINKS_ANSWER = `Sources cited:
- https://www.python.org/
- https://en.wikipedia.org/wiki/Coffee
- https://www.apple.com/shop/buy-iphone`

const WEB_SEARCH_MODEL = {
  id: MODEL_ID,
  name: 'GPT-4o Mini',
  provider: 'OpenAI',
  tier_access: 'unregistered',
  available: true,
  supports_temperature: true,
  supports_vision: false,
  supports_image_generation: false,
  supports_web_search: true,
  max_input_tokens: 128000,
  max_output_tokens: 16384,
  is_thinking_model: false,
}

function streamWithLinks(models: string[]): string {
  const events: object[] = []
  for (const model of models) {
    events.push({ model, type: 'start' })
    events.push({ model, type: 'chunk', content: REAL_LINKS_ANSWER })
    events.push({ model, type: 'done', error: false })
  }
  events.push({
    type: 'complete',
    metadata: {
      models_requested: models.length,
      models_successful: models.length,
      models_failed: 0,
      processing_time_ms: 5,
    },
  })
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
}

async function ensureFirstProviderExpanded(page: import('@playwright/test').Page): Promise<void> {
  const headers = page.locator('.provider-header, button[class*="provider-header"]')
  if ((await headers.count()) === 0) return
  const first = headers.first()
  if ((await first.getAttribute('aria-expanded')) !== 'true') {
    await first.scrollIntoViewIfNeeded().catch(() => {})
    await first.click({ timeout: 5000 }).catch(() => first.click({ force: true }))
    await page.waitForTimeout(400)
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Link preview real image evidence', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    })
    await page.route('**/api/anonymous-mock-mode-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      })
    })
    await page.route('**/api/models', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [WEB_SEARCH_MODEL],
          models_by_provider: { OpenAI: [WEB_SEARCH_MODEL] },
          user_tier: 'unregistered',
          is_trial_active: false,
        }),
      })
    })
    await page.route('**/api/compare-stream', async route => {
      const models = (route.request().postDataJSON() as { models?: string[] })?.models ?? [MODEL_ID]
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: streamWithLinks(models),
      })
    })
  })

  test('desktop screenshot with proxied remote preview images', async ({ page }, testInfo) => {
    test.skip(!!process.env.CI, 'Evidence spec — network + live backend only')

    await page.goto('/')
    await dismissTutorialOverlay(page)
    await dismissMobileBlockers(page)
    await page.getByTestId('comparison-input-textarea').fill('Compare Python, coffee, and iPhone pages')
    await ensureFirstProviderExpanded(page)
    const checkbox = page.getByTestId(`model-checkbox-${MODEL_ID}`)
    await expect(checkbox).toBeVisible({ timeout: 15000 })
    await toggleModelCheckbox(checkbox, testInfo.project.name)
    const webSearchButton = page.locator('button.web-search-button').first()
    await expect(webSearchButton).toHaveAttribute('aria-disabled', 'false', { timeout: 15000 })
    await webSearchButton.click()
  const confirmTooltip = page.getByTestId('action-tooltip-modal-confirm')
    if (await confirmTooltip.isVisible({ timeout: 2500 }).catch(() => false)) {
      await confirmTooltip.click()
    }
    await submitAndAwaitCompareStream(page)
    await expect(page.getByTestId('link-preview-row')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.link-preview-card__image')).toHaveCount(3, { timeout: 60000 })
    await page.waitForFunction(
      () => {
        const imgs = Array.from(
          document.querySelectorAll<HTMLImageElement>('.link-preview-card__image')
        )
        return imgs.length >= 3 && imgs.every(img => img.naturalWidth > 0)
      },
      { timeout: 60000 }
    )
    await page.screenshot({
      path: '/opt/cursor/artifacts/link-preview-real-desktop.png',
      fullPage: false,
    })
  })

  test('mobile screenshot with proxied remote preview images', async ({ page }, testInfo) => {
    test.skip(!!process.env.CI, 'Evidence spec — network + live backend only')
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/')
    await dismissTutorialOverlay(page)
    await dismissMobileBlockers(page)
    await page.getByTestId('comparison-input-textarea').fill('Compare Python, coffee, and iPhone pages')
    await ensureFirstProviderExpanded(page)
    const checkbox = page.getByTestId(`model-checkbox-${MODEL_ID}`)
    await toggleModelCheckbox(checkbox, testInfo.project.name)
    await page.locator('button.web-search-button').first().click()
    const confirmTooltip = page.getByTestId('action-tooltip-modal-confirm')
    if (await confirmTooltip.isVisible({ timeout: 2500 }).catch(() => false)) {
      await confirmTooltip.click()
    }
    await submitAndAwaitCompareStream(page)
    await expect(page.locator('.link-preview-card__image')).toHaveCount(3, { timeout: 60000 })
    await page.waitForFunction(
      () => {
        const imgs = Array.from(
          document.querySelectorAll<HTMLImageElement>('.link-preview-card__image')
        )
        return imgs.length >= 3 && imgs.every(img => img.naturalWidth > 0)
      },
      { timeout: 60000 }
    )
    const row = page.getByTestId('link-preview-row')
    await row.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: '/opt/cursor/artifacts/link-preview-real-mobile.png',
      fullPage: false,
    })
  })
})