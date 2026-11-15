import { test, expect } from '@playwright/test'

import { resolveStarterSelectionModelIds } from '../src/utils/starterSelectionModels'

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

    await expandTutorialProvider(page, 'Google', testInfo)

    await expectTutorialStepTitle(page, 'Select Gemini 2.5 Flash')
    await expect(tooltip).toContainText('Step 2 of 9')

    await selectTutorialModelCheckbox(
      page,
      TUTORIAL_MODEL_IDS[0],
      MOCK_MODELS_RESPONSE.models.find(m => m.id === TUTORIAL_MODEL_IDS[0])!.provider,
      testInfo,
      { afterSelectPartnerModelId: TUTORIAL_MODEL_IDS[1] }
    )

    await expect(page.getByTestId(`model-checkbox-${TUTORIAL_MODEL_IDS[1]}`)).toBeVisible({
      timeout: 15000,
    })

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

    await completeTutorialPromptInput(
      page,
      'Hello from the tutorial E2E test.',
      testInfo
    )

    if (isMobileE2eProject(testInfo.project.name)) {
      const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
      await expect(submit).toBeEnabled({ timeout: 20_000 })
      return
    }

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