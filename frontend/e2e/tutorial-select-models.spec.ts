
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
  expectTutorialTooltipDoesNotOverlapCheckbox,
  expectTutorialTooltipStaysVisible,
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

test.describe('Tutorial model selection steps', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('both starter models selectable through split or combined steps', async ({
    page,
    browserName: _browserName,
  }, testInfo) => {
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(tutorialTooltip(page).first()).toBeVisible()
    await page.waitForTimeout(800)
    await expandTutorialProvider(page, TUTORIAL_PROVIDERS[0] ?? 'Google', testInfo)

    const tooltip = tutorialTooltip(page)
    const mode = await expectSplitOrCombinedModelStep(page)
    await expect(tooltip).not.toContainText('Starter Selection')
    await dismissMobileBlockers(page)

    if (mode === 'split') {
      const first = TUTORIAL_MODEL_IDS[0]
      const second = TUTORIAL_MODEL_IDS[1]
      await expectTutorialTooltipStaysVisible(page, 2000)
      await expectTutorialTooltipDoesNotOverlapCheckbox(page, first)
      const p0 = MOCK_MODELS_RESPONSE.models.find(m => m.id === first)!.provider
      const p1 = MOCK_MODELS_RESPONSE.models.find(m => m.id === second)!.provider

      await selectTutorialModelCheckbox(page, first, p0, testInfo, {
        afterSelectPartnerModelId: second,
      })
      await expandTutorialProvider(page, p1, testInfo)
      await expect(page.getByTestId(`model-checkbox-${second}`)).toBeVisible({ timeout: 15000 })
      await expectTutorialTooltipStaysVisible(page, 2000)
      await expectTutorialTooltipDoesNotOverlapCheckbox(page, second)
      await selectTutorialModelCheckbox(page, second, p1, testInfo, { requireMinSelected: 2 })
    } else {
      for (const modelId of TUTORIAL_MODEL_IDS) {
        const provider = MOCK_MODELS_RESPONSE.models.find(m => m.id === modelId)!.provider
        await selectTutorialModelCheckbox(page, modelId, provider, testInfo)
      }
    }

    await expectTutorialEnterPromptStep(page, testInfo)
  })
})
