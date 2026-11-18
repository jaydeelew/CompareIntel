import { expect, test, type Page } from '@playwright/test'

import { dismissTutorialOverlay } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const MODEL_ID = 'openai/gpt-4o-mini'

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

const ANSWER_WITH_LINKS = [
  'Python: https://shop.example.com/python',
  '',
  'Also: https://shop.example.com/widget',
].join('\n')

function streamWithLink(models: string[]): string {
  const events: object[] = []
  for (const model of models) {
    events.push({ model, type: 'start' })
    events.push({ model, type: 'chunk', content: ANSWER_WITH_LINKS })
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

async function ensureFirstProviderExpanded(page: Page): Promise<void> {
  const headers = page.locator('.provider-header, button[class*="provider-header"]')
  if ((await headers.count()) === 0) return
  const first = headers.first()
  if ((await first.getAttribute('aria-expanded')) !== 'true') {
    await first.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await first.click({ timeout: 5000 })
    } catch {
      await first.click({ timeout: 5000, force: true })
    }
    await page.waitForTimeout(500)
  }
}

test.describe('Link preview cards', () => {
  test('shows inline preview after link block when web search enabled', async ({ page }, testInfo) => {
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
        body: streamWithLink(models),
      })
    })

    await page.route('**/api/link-preview?**', async route => {
      const reqUrl = new URL(route.request().url())
      const target = reqUrl.searchParams.get('url') ?? ''
      if (target.includes('no-preview')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'Plain',
            site_name: 'example.com',
            image: null,
            description: null,
            price: null,
            currency: null,
            fetched_at: '2026-01-01T00:00:00Z',
            url: target,
            error: 'preview_unavailable',
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Example Widget',
          site_name: 'shop.example.com',
          image: 'https://cdn.example.com/widget.jpg',
          description: null,
          price: '19.99',
          currency: 'USD',
          fetched_at: '2026-01-01T00:00:00Z',
          url: target,
        }),
      })
    })

    await page.route('**/api/link-preview/image?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        ),
      })
    })

    await page.goto('/')
    await dismissTutorialOverlay(page)
    await dismissMobileBlockers(page)

    await page.locator('.loading-message').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

    await page.getByTestId('comparison-input-textarea').fill('Find a widget')
    await ensureFirstProviderExpanded(page)

    const modelCheckbox = page.getByTestId(`model-checkbox-${MODEL_ID}`)
    await expect(modelCheckbox).toBeVisible({ timeout: 15000 })
    await toggleModelCheckbox(modelCheckbox, testInfo.project.name)

    const webSearchButton = page.locator('button.web-search-button').first()
    await expect(webSearchButton).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 })
    await webSearchButton.scrollIntoViewIfNeeded().catch(() => {})
    try {
      await webSearchButton.tap({ timeout: 3000 })
    } catch {
      await webSearchButton.click()
    }
    const confirmTooltip = page.getByTestId('action-tooltip-modal-confirm')
    if (await confirmTooltip.isVisible({ timeout: 2500 }).catch(() => false)) {
      await confirmTooltip.click()
    }

    await submitAndAwaitCompareStream(page)

    const messageContent = page.locator('.conversation-content .message-content').last()
    await expect(messageContent.getByTestId('formatted-answer-with-previews')).toBeVisible({
      timeout: 20_000,
    })
    await expect(messageContent.getByTestId('link-preview-card-inline')).toHaveCount(2, {
      timeout: 30_000,
    })
    await expect(page.getByTestId('link-preview-row')).toHaveCount(0)
    await expect(messageContent.getByTestId('link-preview-card-inline').first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(messageContent.getByText('Example Widget').first()).toBeVisible({
      timeout: 10_000,
    })
  })
})