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
      id: 'anthropic/claude-3.5-haiku',
      name: 'Claude 3.5 Haiku',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 200000,
      max_output_tokens: 8192,
      is_thinking_model: false,
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B Instruct',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 32768,
      is_thinking_model: false,
    },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      name: 'Gemini 2.0 Flash (free)',
      tier_access: 'free',
      supports_temperature: true,
      supports_vision: true,
      supports_image_generation: false,
      max_input_tokens: 1048576,
      max_output_tokens: 8192,
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
    ],
    anthropic: [
      {
        id: 'anthropic/claude-3.5-haiku',
        name: 'Claude 3.5 Haiku',
        tier_access: 'unregistered',
        supports_temperature: true,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 200000,
        max_output_tokens: 8192,
        is_thinking_model: false,
      },
    ],
    'meta-llama': [
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B Instruct',
        tier_access: 'unregistered',
        supports_temperature: true,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 128000,
        max_output_tokens: 32768,
        is_thinking_model: false,
      },
    ],
    google: [
      {
        id: 'google/gemini-2.0-flash-exp:free',
        name: 'Gemini 2.0 Flash (free)',
        tier_access: 'free',
        supports_temperature: true,
        supports_vision: true,
        supports_image_generation: false,
        max_input_tokens: 1048576,
        max_output_tokens: 8192,
        is_thinking_model: false,
      },
    ],
  },
  user_tier: 'unregistered',
  is_trial_active: false,
}

/**
 * Mock comparison stream response
 * Returns a deterministic SSE stream
 */
export const MOCK_COMPARISON_STREAM = `event: status
data: {"model":"openai/gpt-4o-mini","status":"starting"}

event: chunk
data: {"model":"openai/gpt-4o-mini","content":"Test "}

event: chunk
data: {"model":"openai/gpt-4o-mini","content":"response "}

event: chunk
data: {"model":"openai/gpt-4o-mini","content":"from "}

event: chunk
data: {"model":"openai/gpt-4o-mini","content":"mocked "}

event: chunk
data: {"model":"openai/gpt-4o-mini","content":"API"}

event: status
data: {"model":"openai/gpt-4o-mini","status":"completed"}

event: done
data: {"conversation_id":"test-conversation-123"}

`

/**
 * Set up mocks for /api/models endpoint
 * This makes tests deterministic and independent of backend API keys
 */
export async function mockModelsApi(page: Page, userTier: string = 'unregistered'): Promise<void> {
  const mockResponse = {
    ...MOCK_MODELS_RESPONSE,
    user_tier: userTier,
  }

  await page.route('**/api/models', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    })
  })
}

/**
 * Set up mocks for /api/compare-stream endpoint
 * This prevents real API calls and makes tests fast and deterministic
 */
export async function mockComparisonStream(page: Page): Promise<void> {
  await page.route('**/api/compare-stream', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: MOCK_COMPARISON_STREAM,
    })
  })
}

/**
 * Set up all necessary mocks for E2E tests
 */
export async function setupE2EMocks(page: Page, userTier: string = 'unregistered'): Promise<void> {
  await mockModelsApi(page, userTier)
  await mockComparisonStream(page)
}
