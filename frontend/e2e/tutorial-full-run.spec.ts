
import { test, expect } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  clickTutorialDoneButton,
  completeTutorialPromptInput,
  expandTutorialProvider,
  expectTutorialEnterPromptStep,
  expectTutorialStepTitle,
  runTutorialComparison,
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

test.describe('Onboarding tutorial full run (split model steps)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await mockComparisonStream(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('completes all visible steps through save-selection', async ({
    page,
    browserName: _browserName,
  }, testInfo) => {
    test.setTimeout(180_000)

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    const tooltip = tutorialTooltip(page)
    await expect(tooltip.first()).toBeVisible()
    await dismissMobileBlockers(page)

    await expandTutorialProvider(page, 'Anthropic', testInfo)

    await expectTutorialStepTitle(page, 'Select Claude Sonnet 5.5')
    await expect(tooltip).toContainText('Step 2 of 10')

    await selectTutorialModelCheckbox(
      page,
      TUTORIAL_MODEL_IDS[0],
      MOCK_MODELS_RESPONSE.models.find(m => m.id === TUTORIAL_MODEL_IDS[0])!.provider,
      testInfo
    )

    const secondProvider = TUTORIAL_PROVIDERS[1] ?? 'OpenAI'
    await expectTutorialStepTitle(page, `Expand ${secondProvider}`)
    await expandTutorialProvider(page, secondProvider, testInfo)
    await expectTutorialStepTitle(page, 'Select GPT-5.2')

    await selectTutorialModelCheckbox(
      page,
      TUTORIAL_MODEL_IDS[1],
      MOCK_MODELS_RESPONSE.models.find(m => m.id === TUTORIAL_MODEL_IDS[1])!.provider,
      testInfo,
      { requireMinSelected: 2 }
    )

    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked').length
          ),
        { timeout: 20_000 }
      )
      .toBeGreaterThanOrEqual(2)

    await expectTutorialEnterPromptStep(page, testInfo)

    // Prompt submit and later steps are covered on desktop; mobile model→enter-prompt is
    // asserted above and in tutorial-select-models.spec.ts (Mobile Safari overlay timing).
    if (isMobileE2eProject(testInfo.project.name)) {
      return
    }

    await completeTutorialPromptInput(page, 'Hello from the tutorial E2E test.', testInfo)

    await runTutorialComparison(page, testInfo, 90_000, 'Hello from the tutorial E2E test.')

    await runTutorialComparison(page, testInfo, 120_000, 'Follow-up question for the tutorial.')

    await expectTutorialStepTitle(page, 'Review the New Responses', 60_000)
    await clickTutorialDoneButton(page, testInfo)

    await expectTutorialStepTitle(page, 'Access Your History')
    await page.getByRole('button', { name: 'Load previous conversations' }).first().click()
    await expect(page.locator('.history-inline-list').first()).toBeVisible({ timeout: 15000 })
    await clickTutorialDoneButton(page, testInfo)

    await expectTutorialStepTitle(page, 'Save Model Selections')
    await page.getByRole('button', { name: 'Save or load model selections' }).first().click()
    await expect(page.getByTestId('saved-selections-dropdown').first()).toBeVisible({
      timeout: 15000,
    })
    await clickTutorialDoneButton(page, testInfo)

    await expect(tooltip).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator('.tutorial-backdrop')).toHaveCount(0)
    await expect(page.getByTestId('comparison-input-textarea').first()).toBeVisible()
  })
})
