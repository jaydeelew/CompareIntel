import { test, expect } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers } from './helpers/modelCheckbox'
import {
  expandTutorialProvider,
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

/** Jack's dev build: Gemini 2.5 Flash + DeepSeek V4.1 Flash (split providers). */
const MOCK_MODELS = {
  Google: [mockModel('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google')],
  DeepSeek: [
    mockModel('deepseek/deepseek-v4.1-flash-1017', 'DeepSeek V4.1 Flash 1017', 'DeepSeek'),
  ],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function isMobileTutorialProject(projectName: string): boolean {
  return projectName.startsWith('Mobile Chrome') || projectName.startsWith('Mobile Safari')
}

test.describe('Tutorial select steps on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('tooltip stays visible and does not cover checkboxes on both select steps', async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileTutorialProject(testInfo.project.name), 'Mobile viewport only')

    const [firstId, secondId] = TUTORIAL_MODEL_IDS
    const [firstProvider, secondProvider] = TUTORIAL_PROVIDERS
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(tutorialTooltip(page)).toBeVisible({ timeout: 15000 })
    await dismissMobileBlockers(page)

    await expandTutorialProvider(page, firstProvider!, testInfo)
    await expect(tutorialTooltip(page)).toContainText('Gemini', { timeout: 15000 })

    await expectTutorialTooltipStaysVisible(page)
    await expectTutorialTooltipDoesNotOverlapCheckbox(page, firstId!)
    await selectTutorialModelCheckbox(page, firstId!, firstProvider!, testInfo)

    await expandTutorialProvider(page, secondProvider!, testInfo)
    await expectTutorialTooltipStaysVisible(page)
    await expectTutorialTooltipDoesNotOverlapCheckbox(page, secondId!)

    await selectTutorialModelCheckbox(page, secondId!, secondProvider!, testInfo, {
      requireMinSelected: 2,
    })
  })
})
