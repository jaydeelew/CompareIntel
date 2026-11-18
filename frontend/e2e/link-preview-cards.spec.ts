import { expect, test } from '@playwright/test'

import { submitAndAwaitCompareStream } from './helpers/comparisonStream'

const WEB_SEARCH_MODEL = {
  id: 'openai/gpt-4o-mini',
  name: 'GPT-4o Mini',
  provider: 'OpenAI',
  tier_access: 'unregistered',
  supports_temperature: true,
  supports_vision: false,
  supports_image_generation: false,
  supports_web_search: true,
  max_input_tokens: 128000,
  max_output_tokens: 16384,
  is_thinking_model: false,
}

const ANSWER_WITH_LINK =
  'Here is a product: https://shop.example.com/widget — see [details](https://shop.example.com/widget).'

function streamWithLink(models: string[]): string {
  const events: object[] = []
  for (const model of models) {
    events.push({ model, type: 'start' })
    events.push({ model, type: 'chunk', content: ANSWER_WITH_LINK })
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

test.describe('Link preview cards', () => {
  test('shows preview row after stream when web search enabled', async ({ page }) => {
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
        }),
      })
    })

    await page.route('**/api/compare-stream', async route => {
      const models = (route.request().postDataJSON() as { models?: string[] })?.models ?? [
        'openai/gpt-4o-mini',
      ]
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: streamWithLink(models),
      })
    })

    await page.route('**/api/link-preview?**', async route => {
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
          url: 'https://shop.example.com/widget',
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

    await page.locator('textarea').first().fill('Find a widget')
    await page.locator('input.model-checkbox').first().check()

    const webSearchButton = page.locator('button.web-search-button').first()
    await expect(webSearchButton).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 })
    await webSearchButton.click()
    const confirmTooltip = page.getByTestId('action-tooltip-modal-confirm')
    if (await confirmTooltip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmTooltip.click()
    }

    await submitAndAwaitCompareStream(page)

    await expect(page.getByTestId('link-preview-row')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Example Widget')).toBeVisible()
  })
})
