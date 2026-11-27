/**
 * Mobile results card: the model pager sits halfway between the response box
 * and the bottom edge of the Comparison Results card. Pixel 5 and iPhone 12
 * resolve the gap above the pager differently, so both are checked.
 */

import { expect, test, type Page } from '@playwright/test'

import { buildMockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers } from './helpers/modelCheckbox'

const REPLY = '√6 ≈ 2.45. A few useful approximations.'

const models = [
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'mini',
    category: 'openai',
    provider: 'OpenAI',
    available: true,
    tier_access: 'unregistered' as const,
    supports_temperature: true,
    supports_vision: false,
    supports_image_generation: false,
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT 5.2',
    description: 'gpt',
    category: 'openai',
    provider: 'OpenAI',
    available: true,
    tier_access: 'unregistered' as const,
    supports_temperature: true,
    supports_vision: false,
    supports_image_generation: false,
  },
]

const catalog = {
  models,
  models_by_provider: { OpenAI: models },
  user_tier: 'unregistered',
  is_trial_active: false,
}

function phoneProject(name: string): boolean {
  return name === 'Mobile Safari - iPhone 12' || name === 'Mobile Chrome - Pixel 5'
}

async function installRoutes(page: Page): Promise<void> {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }
    if (url.pathname.startsWith('/api/models') && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog),
      })
      return
    }
    if (url.pathname === '/api/compare-stream') {
      let ids = models.map(model => model.id)
      try {
        const body = route.request().postDataJSON() as { models?: string[] } | null
        if (body?.models?.length) ids = body.models
      } catch {
        ids = models.map(model => model.id)
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: buildMockComparisonStream(ids, REPLY),
      })
      return
    }
    if (url.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
      return
    }
    if (url.pathname.startsWith('/api/credits/balance')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          credits_allocated: 50,
          credits_remaining: 50,
          period_type: 'daily',
          subscription_tier: 'unregistered',
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ anonymous_mock_mode_enabled: false, is_development: false }),
    })
  })
}

test.describe('mobile results pager spacing', () => {
  test('gap below the pager matches the gap above it', async ({ page }, testInfo) => {
    test.skip(!phoneProject(testInfo.project.name), 'Pixel 5 and iPhone 12 only')
    test.setTimeout(60_000)

    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dont_show_again', 'true')
      localStorage.setItem('compareintel_welcome_dismissed', 'true')
    })
    await installRoutes(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissMobileBlockers(page)

    const input = page.getByTestId('comparison-input-textarea')
    await expect(input).toBeVisible()
    await input.fill('What is the square root of 6?')
    await dismissMobileBlockers(page)
    await page.getByTestId('comparison-submit-button').click()

    const pager = page.getByTestId('results-model-pager')
    await expect(pager).toBeVisible({ timeout: 30_000 })
    await expect(pager).toContainText('1 / 2')
    await page.evaluate(() => document.fonts.ready)

    const readGaps = () =>
      page.evaluate(() => {
        const messages = [...document.querySelectorAll('.results-section-tabbed .message-content')]
        const message = messages[messages.length - 1]
        const pagerEl = document.querySelector('.results-model-pager')
        const outer = document.querySelector('.results-section')
        const conversation = message?.closest('.conversation-content')
        if (
          !(message instanceof HTMLElement) ||
          !(pagerEl instanceof HTMLElement) ||
          !(outer instanceof HTMLElement)
        ) {
          return null
        }
        const messageBox = message.getBoundingClientRect()
        const responseBottom =
          conversation instanceof HTMLElement
            ? Math.min(messageBox.bottom, conversation.getBoundingClientRect().bottom)
            : messageBox.bottom
        const pagerBox = pagerEl.getBoundingClientRect()
        const above = pagerBox.top - responseBottom
        const below = outer.getBoundingClientRect().bottom - pagerBox.bottom
        return { above, below, diff: Math.abs(above - below), messageHeight: messageBox.height }
      })

    await expect
      .poll(async () => (await readGaps())?.diff ?? 999, { timeout: 5_000 })
      .toBeLessThanOrEqual(2)

    const measured = await readGaps()
    expect(measured, 'pager gap measurement').not.toBeNull()
    expect(measured!.above, 'gap above the pager').toBeGreaterThan(0)
    expect(measured!.messageHeight, 'response box keeps its height').toBeGreaterThan(40)
  })
})
