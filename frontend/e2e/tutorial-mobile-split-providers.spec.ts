import { test, expect } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers } from './helpers/modelCheckbox'
import {
  expandTutorialProvider,
  expectSplitOrCombinedModelStep,
  expectTutorialEnterPromptStep,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

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
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
  OpenAI: [mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI')],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

async function expectTutorialStaysVisible(page: import('@playwright/test').Page, ms = 4000) {
  await page.waitForTimeout(ms)
  await expect(tutorialTooltip(page).first()).toBeVisible()
}

test.describe('Tutorial split providers on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('highlights starter providers and keeps tooltip through expand steps', async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith('Mobile Chrome') &&
        !testInfo.project.name.startsWith('Mobile Safari'),
      'Mobile viewport tutorial regression'
    )

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    const tooltip = tutorialTooltip(page)
    await expect(tooltip).toBeVisible({ timeout: 15000 })
    await dismissMobileBlockers(page)

    const firstProvider = TUTORIAL_PROVIDERS[0] ?? 'Anthropic'
    await expect(tooltip).toContainText(`Expand ${firstProvider}`)
    await expect(tooltip).toContainText('Step 1 of 10')
    await expectTutorialStaysVisible(page)

    await expandTutorialProvider(page, firstProvider, testInfo)
    await expect(tooltip).toContainText('Claude Sonnet 5.5', { timeout: 15000 })

    const mode = await expectSplitOrCombinedModelStep(page)
    expect(mode).toBe('split')
    await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, firstProvider, testInfo)

    const secondProvider = TUTORIAL_PROVIDERS[1] ?? 'OpenAI'
    await expect(tooltip).toContainText(`Expand ${secondProvider}`, { timeout: 15000 })
    await expectTutorialStaysVisible(page)

    await expandTutorialProvider(page, secondProvider, testInfo)
    await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, secondProvider, testInfo, {
      requireMinSelected: 2,
    })

    await expectTutorialEnterPromptStep(page, testInfo)
  })
})