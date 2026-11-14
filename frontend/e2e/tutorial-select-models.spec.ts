import { test, expect } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

/**
 * Regression: Starter Selection / restored models must not block picking both tutorial models on step 2.
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

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

async function expandProvider(page: import('@playwright/test').Page, providerName: string) {
  const header = page
    .locator(`.provider-dropdown[data-provider-name="${providerName}"] .provider-header`)
    .first()
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

test.describe('Tutorial step 2 — select starter selection models', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('with Starter Selection timing, both tutorial models stay selectable', async ({
    page,
  }, testInfo) => {
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip').first()).toBeVisible()

    // Give Starter Selection auto-load time to run if the tutorial guard is broken.
    await page.waitForTimeout(800)

    await expandProvider(page, TUTORIAL_PROVIDERS[0] ?? 'Google')

    await expect(
      page
        .locator('.tutorial-tooltip, .mobile-tutorial-tooltip')
        .getByRole('heading', { name: 'Select Models', exact: true })
    ).toBeVisible({ timeout: 10000 })

    await dismissMobileBlockers(page)

    for (const modelId of TUTORIAL_MODEL_IDS) {
      const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
      const provider = MOCK_MODELS_RESPONSE.models.find(m => m.id === modelId)?.provider
      if (provider) {
        const header = page
          .locator(`.provider-dropdown[data-provider-name="${provider}"] .provider-header`)
          .first()
        const expanded = await header.getAttribute('aria-expanded')
        if (expanded !== 'true') {
          await expandProvider(page, provider)
        }
      }
      await expect(checkbox).toBeEnabled()
      await checkbox.scrollIntoViewIfNeeded()
      await toggleModelCheckbox(checkbox, testInfo.project.name)
      await expect(checkbox).toBeChecked()
    }
  })
})