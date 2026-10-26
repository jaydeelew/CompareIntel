import type { Page } from '@playwright/test'

function mockModel(id: string, name: string, tierAccess: 'unregistered' | 'free') {
  return {
    id,
    name,
    provider: 'OpenAI',
    tier_access: tierAccess,
    supports_temperature: true,
    supports_vision: false,
    supports_image_generation: false,
    max_input_tokens: 128000,
    max_output_tokens: 16384,
    is_thinking_model: false,
  }
}

// One provider holds every model: specs expand only the first provider dropdown. Five
// unregistered-tier models exceed the 3-model limit so the limit test has something to block.
const MOCK_OPENAI_MODELS = [
  mockModel('openai/gpt-4o-mini', 'GPT-4o Mini', 'unregistered'),
  mockModel('openai/gpt-3.5-turbo', 'GPT-3.5 Turbo', 'unregistered'),
  mockModel('openai/gpt-4.1-nano', 'GPT-4.1 Nano', 'unregistered'),
  mockModel('openai/gpt-4.1-mini', 'GPT-4.1 Mini', 'unregistered'),
  mockModel('openai/gpt-oss-20b', 'GPT OSS 20B', 'unregistered'),
  mockModel('openai/gpt-4o', 'GPT-4o', 'free'),
  mockModel('openai/gpt-4.1', 'GPT-4.1', 'free'),
]

export const MOCK_MODELS_RESPONSE = {
  models: MOCK_OPENAI_MODELS,
  models_by_provider: { OpenAI: MOCK_OPENAI_MODELS },
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
