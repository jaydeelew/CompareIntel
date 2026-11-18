import { test, expect } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  expandTutorialProvider,
  expectTutorialBackdropContinuous,
  expectTutorialTargetProviderInViewport,
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
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

test.describe('Tutorial provider scroll (desktop ~1024px)', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('second expand step keeps provider in viewport before interaction', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000)
    test.skip(isMobileE2eProject(testInfo.project.name), 'Desktop viewport regression')

    const [firstId] = TUTORIAL_MODEL_IDS
    const firstProvider = TUTORIAL_PROVIDERS[0]!
    const secondProvider = TUTORIAL_PROVIDERS[1]!

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(tutorialTooltip(page)).toBeVisible({ timeout: 15000 })
    await dismissMobileBlockers(page)

    await expandTutorialProvider(page, firstProvider, testInfo)
    await selectTutorialModelCheckbox(page, firstId!, firstProvider, testInfo)
    await expectTutorialBackdropContinuous(page)

    await expect(tutorialTooltip(page)).toContainText(`Expand ${secondProvider}`, {
      timeout: 20000,
    })
    await expectTutorialTooltipStaysVisible(page, 1500)
    await expectTutorialTargetProviderInViewport(page, secondProvider)
  })
})
