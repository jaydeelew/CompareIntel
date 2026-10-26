import type { Page } from '@playwright/test'

/**
 * Mock models data for E2E tests
 * These models are consistently available and don't depend on the backend API key
 */
export const MOCK_MODELS_RESPONSE = {
  models: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      is_thinking_model: false,
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      tier_access: 'free',
      supports_temperature: true,
      supports_vision: true,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      is_thinking_model: false,
    },
    {
      id: 'openai/o1-mini',
      name: 'OpenAI o1-mini',
      tier_access: 'free',
      supports_temperature: false,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 65536,
      is_thinking_model: true,
    },
    {
      id: 'openai/gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 16385,
      max_output_tokens: 4096,
      is_thinking_model: false,
    },
  ],
  models_by_provider: {
    openai: [
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        tier_access: 'unregistered',
        supports_temperature: true,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 128000,
        max_output_tokens: 16384,
        is_thinking_model: false,
      },
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        tier_access: 'free',
        supports_temperature: true,
        supports_vision: true,
        supports_image_generation: false,
        max_input_tokens: 128000,
        max_output_tokens: 16384,
        is_thinking_model: false,
      },
      {
        id: 'openai/o1-mini',
        name: 'OpenAI o1-mini',
        tier_access: 'free',
        supports_temperature: false,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 128000,
        max_output_tokens: 65536,
        is_thinking_model: true,
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        tier_access: 'unregistered',
        supports_temperature: true,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 16385,
        max_output_tokens: 4096,
        is_thinking_model: false,
      },
    ],
  },
  user_tier: 'unregistered',
  is_trial_active: false,
}

const MOCK_RESPONSE_TEXT = 'Test response from mocked API.'

/**
 * Builds an SSE body in the same `data: {"type": ...}` shape that
 * backend/app/services/comparison_stream.py emits and sseProcessor.ts parses.
 */
export function buildMockComparisonStream(models: string[]): string {
  const events: object[] = []
  for (const model of models) {
    events.push({ model, type: 'start' })
    for (const word of MOCK_RESPONSE_TEXT.split(' ')) {
      events.push({ model, type: 'chunk', content: `${word} ` })
    }
    events.push({ model, type: 'done', error: false })
  }
  events.push({
    type: 'complete',
    metadata: {
      input_length: 0,
      models_requested: models.length,
      models_successful: models.length,
      models_failed: 0,
      timestamp: new Date().toISOString(),
      processing_time_ms: 10,
    },
  })
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
}

/**
 * Mocks GET /api/models. The models all sit under one provider because specs only expand the
 * first provider dropdown, and the real catalog's first provider (Anthropic) has a single
 * non-paid model.
 */
export async function mockModelsApi(page: Page, userTier: string = 'unregistered'): Promise<void> {
  const mockResponse = {
    ...MOCK_MODELS_RESPONSE,
    user_tier: userTier,
  }

  await page.route('**/api/models', async route => {
    if (process.env.E2E_LOG_API_REQUESTS) {
      console.log(`[MOCK HIT] ${route.request().method()} ${route.request().url()}`)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    })
  })
}

/**
 * Mocks POST /api/compare-stream with a successful response for every requested model.
 */
export async function mockComparisonStream(page: Page): Promise<void> {
  await page.route('**/api/compare-stream', async route => {
    if (process.env.E2E_LOG_API_REQUESTS) {
      console.log(`[MOCK HIT] ${route.request().method()} ${route.request().url()}`)
    }
    let models: string[] = []
    try {
      models = (route.request().postDataJSON() as { models?: string[] })?.models ?? []
    } catch {
      models = []
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: buildMockComparisonStream(models),
    })
  })
}

export async function setupE2EMocks(page: Page, userTier: string = 'unregistered'): Promise<void> {
  await mockModelsApi(page, userTier)
  await mockComparisonStream(page)
}
