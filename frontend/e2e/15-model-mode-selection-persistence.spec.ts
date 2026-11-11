/**
 * Text and image model selections survive toggling the model mode switch.
 */
import { dismissTutorialOverlay, ensureUnfoldedNavbar, test, expect } from './fixtures'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

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
      tier_access: 'unregistered',
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
        tier_access: 'unregistered',
        supports_temperature: false,
        supports_vision: false,
        supports_image_generation: true,
        max_input_tokens: 128000,
        max_output_tokens: 16384,
        is_thinking_model: false,
      },
    ],
  },
  user_tier: 'unregistered',
  is_trial_active: false,
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
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })
  await page.addInitScript(() => {
    localStorage.setItem('compareintel_starter_selection_opted_out', 'true')
    localStorage.setItem('compareintel_test_comparison_opted_out', 'true')
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

    const openAiDropdown = page.locator('.provider-dropdown[data-provider-name="OpenAI"]')
    const openAiHeader = openAiDropdown.locator('.provider-header')
    await openAiHeader.click()
    const textCheckbox = page.getByTestId('model-checkbox-openai/gpt-text')
    await toggleModelCheckbox(textCheckbox, projectName)
    await expect(textCheckbox).toBeChecked()

    await page.getByRole('button', { name: 'Image generation models' }).click()
    await openAiHeader.click()
    const imageCheckbox = page.getByTestId('model-checkbox-openai/image-gen')
    await toggleModelCheckbox(imageCheckbox, projectName)
    await expect(imageCheckbox).toBeChecked()

    await page.getByRole('button', { name: 'Text models' }).click()
    await openAiHeader.click()
    const textCheckboxAfter = page.getByTestId('model-checkbox-openai/gpt-text')
    await expect(textCheckboxAfter).toBeChecked()

    await page.getByRole('button', { name: 'Image generation models' }).click()
    await openAiHeader.click()
    const imageCheckboxAfter = page.getByTestId('model-checkbox-openai/image-gen')
    await expect(imageCheckboxAfter).toBeChecked()

    testInfo.annotations.push({
      type: 'note',
      description: `project=${testInfo.project.name}`,
    })
  })
})
