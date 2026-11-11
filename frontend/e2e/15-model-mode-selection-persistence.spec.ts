/**
 * Text and image model selections survive toggling the model mode switch.
 * Uses a mocked free-tier /auth/me so image models are selectable (anonymous users cannot).
 */
import { dismissTutorialOverlay, ensureUnfoldedNavbar, test, expect } from './fixtures'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const MOCK_FREE_USER = {
  id: 9001,
  email: 'e2e-free-image-mode@example.com',
  is_verified: true,
  is_active: true,
  role: 'user',
  is_admin: false,
  subscription_tier: 'free',
  subscription_status: 'active',
  subscription_period: 'monthly',
  daily_usage_count: 0,
  monthly_overage_count: 0,
  mock_mode_enabled: false,
  created_at: '2026-01-01T00:00:00.000Z',
}

const MIXED_MODELS_RESPONSE = {
  models: [
    {
      id: 'openai/gpt-text',
      name: 'GPT Text',
      provider: 'OpenAI',
      tier_access: 'unregistered',
      supports_temperature: true,
      supports_vision: false,
      supports_image_generation: false,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      is_thinking_model: false,
    },
    {
      id: 'openai/image-gen',
      name: 'GPT Image',
      provider: 'OpenAI',
      tier_access: 'free',
      supports_temperature: false,
      supports_vision: false,
      supports_image_generation: true,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      is_thinking_model: false,
    },
  ],
  models_by_provider: {
    OpenAI: [
      {
        id: 'openai/gpt-text',
        name: 'GPT Text',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_temperature: true,
        supports_vision: false,
        supports_image_generation: false,
        max_input_tokens: 128000,
        max_output_tokens: 16384,
        is_thinking_model: false,
      },
      {
        id: 'openai/image-gen',
        name: 'GPT Image',
        provider: 'OpenAI',
        tier_access: 'free',
        supports_temperature: false,
        supports_vision: false,
        supports_image_generation: true,
        max_input_tokens: 128000,
        max_output_tokens: 16384,
        is_thinking_model: false,
      },
    ],
  },
  user_tier: 'free',
  is_trial_active: false,
}

async function expandProviderAndSelectModel(
  page: import('@playwright/test').Page,
  provider: string,
  modelId: string,
  projectName: string
): Promise<void> {
  const dropdown = page.locator(`.provider-dropdown[data-provider-name="${provider}"]`)
  const header = dropdown.locator('.provider-header')
  const checkbox = page.getByTestId(`model-checkbox-${modelId}`)

  await expect(async () => {
    if ((await header.getAttribute('aria-expanded')) !== 'true') {
      await header.evaluate((el: HTMLElement) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
      })
      await header.click({ timeout: 5000 })
    }
    await expect(header).toHaveAttribute('aria-expanded', 'true', { timeout: 2000 })
  }, `expand ${provider} provider dropdown`).toPass({ timeout: 20000 })

  await expect(checkbox).toBeEnabled({ timeout: 10000 })
  await expect(async () => {
    if (!(await checkbox.isChecked())) {
      await toggleModelCheckbox(checkbox, projectName)
    }
    await expect(checkbox).toBeChecked({ timeout: 2000 })
  }, `select model ${modelId}`).toPass({ timeout: 20000 })
}

async function setupMixedModelsHome(page: import('@playwright/test').Page) {
  await page.route('**/api/models', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MIXED_MODELS_RESPONSE),
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
      body: JSON.stringify(MOCK_FREE_USER),
    })
  })
  await page.route('**/api/credits/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        credits_remaining: 100,
        credits_allocated: 100,
        overage_credits_remaining: 0,
      }),
    })
  })
}

test.describe('Model mode selection persistence', () => {
  test('text selection survives image mode round trip', async ({ page }, testInfo) => {
    const projectName = testInfo.project.name
    await setupMixedModelsHome(page)
    await page.goto('/')
    await dismissTutorialOverlay(page)
    await ensureUnfoldedNavbar(page)
    await dismissMobileBlockers(page)

    await page.getByRole('button', { name: 'Text models' }).waitFor({ state: 'visible' })

    await expandProviderAndSelectModel(page, 'OpenAI', 'openai/gpt-text', projectName)

    await page.getByRole('button', { name: 'Image generation models' }).click()
    await expandProviderAndSelectModel(page, 'OpenAI', 'openai/image-gen', projectName)

    await page.getByRole('button', { name: 'Text models' }).click()
    await expect(async () => {
      const textCheckboxAfter = page.getByTestId('model-checkbox-openai/gpt-text')
      await expect(textCheckboxAfter).toBeChecked({ timeout: 3000 })
    }).toPass({ timeout: 15000 })

    await page.getByRole('button', { name: 'Image generation models' }).click()
    await expect(async () => {
      const imageCheckboxAfter = page.getByTestId('model-checkbox-openai/image-gen')
      await expect(imageCheckboxAfter).toBeChecked({ timeout: 3000 })
    }).toPass({ timeout: 15000 })
  })
})
