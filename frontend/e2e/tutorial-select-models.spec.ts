import { test, expect } from '@playwright/test'

import { TUTORIAL_GOOGLE_MODEL_IDS } from '../src/data/tutorialSteps'

/**
 * Regression: Starter Selection / restored models must not block picking both tutorial Google models on step 2.
 */

const mockModel = (
  id: string,
  name: string,
  provider: string,
  tier: 'unregistered' | 'free' | 'paid' = 'unregistered'
) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: tier,
})

const MOCK_MODELS = {
  Google: [
    mockModel('google/gemma-3-27b-it', 'Gemma 3 27B It', 'Google'),
    mockModel('google/gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite Preview', 'Google'),
    mockModel('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google'),
  ],
  DeepSeek: [
    mockModel('deepseek/deepseek-v4.1-flash-1017', 'DeepSeek V4.1 Flash', 'DeepSeek'),
    mockModel('deepseek/deepseek-v4-flash', 'DeepSeek V4 Flash', 'DeepSeek'),
  ],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

async function expandGoogleProvider(page: import('@playwright/test').Page) {
  const googleHeader = page
    .locator('.provider-dropdown[data-provider-name="Google"] .provider-header')
    .first()
  await googleHeader.click()
  await expect(googleHeader).toHaveAttribute('aria-expanded', 'true')
}

test.describe('Tutorial step 2 — select both Google models', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('with Starter Selection timing, both tutorial Google models stay selectable', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip').first()).toBeVisible()

    // Give Starter Selection auto-load time to run if the tutorial guard is broken.
    await page.waitForTimeout(800)

    await expandGoogleProvider(page)

    await expect(
      page
        .locator('.tutorial-tooltip, .mobile-tutorial-tooltip')
        .getByRole('heading', { name: 'Select Models', exact: true })
    ).toBeVisible({ timeout: 10000 })

    const googleSection = page.locator('.provider-dropdown[data-provider-name="Google"]')
    for (const modelId of TUTORIAL_GOOGLE_MODEL_IDS) {
      const checkbox = googleSection.locator(`#model-checkbox-${CSS.escape(modelId)}`)
      await expect(checkbox).toBeEnabled()
      await checkbox.click({ force: true })
      await expect(checkbox).toBeChecked()
    }
  })
})
