import type { Page } from '@playwright/test'

import { resolveStarterSelectionModelIds } from '../src/utils/starterSelectionModels'

import { test, expect, dismissTutorialOverlay } from './fixtures'
import { dismissMobileBlockers } from './helpers/modelCheckbox'

/** Footer About avoids header links hidden when the nav shell is folded (common on Firefox CI). */
async function navigateToAboutViaFooter(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await dismissTutorialOverlay(page)
  const aboutLink = page.getByLabel('Footer navigation').getByRole('link', {
    name: 'About',
    exact: true,
  })
  await expect(aboutLink).toBeVisible({ timeout: 10000 })
  try {
    await aboutLink.click({ timeout: 15000 })
  } catch {
    await dismissTutorialOverlay(page)
    await aboutLink.click({ force: true, timeout: 15000 })
  }
  await expect(page).toHaveURL(/\/about/, { timeout: 20000 })
}

async function navigateHomeViaBreadcrumb(page: Page): Promise<void> {
  const homeLink = page.getByLabel('Breadcrumb').getByRole('link', { name: 'Home', exact: true })
  await expect(homeLink).toBeVisible({ timeout: 10000 })
  try {
    await homeLink.click({ timeout: 15000 })
  } catch {
    await homeLink.click({ force: true, timeout: 15000 })
  }
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 })
}

const mockModel = (
  id: string,
  name: string,
  provider: string,
  tier: 'unregistered' | 'free' = 'unregistered'
) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: tier,
  supports_image_generation: false,
  supports_temperature: true,
  supports_vision: false,
})

const MOCK_MODELS = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
  OpenAI: [
    mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI'),
    mockModel('openai/gpt-5-nano', 'GPT-5 Nano', 'OpenAI'),
  ],
  Google: [
    mockModel('google/gemma-4-31b-it', 'Gemma 4 31B It', 'Google'),
    mockModel('google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'Google'),
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
  user_tier: 'unregistered',
  is_trial_active: false,
}

const STARTER_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)

async function dismissOnboarding(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('compareintel_tutorial_completed', 'true')
    localStorage.setItem('compareintel_welcome_dismissed', 'true')
  })
}

async function countCheckedModels(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('input.model-checkbox:checked').length
  )
}

async function getCheckedModelIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked'))
      .map(el => el.getAttribute('data-testid')?.replace(/^model-checkbox-/, '') ?? '')
      .filter(Boolean)
  )
}

async function waitForStarterApplied(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => countCheckedModels(page), { timeout: 20000 })
    .toBeGreaterThanOrEqual(2)
}

function providerForModelId(modelId: string): string {
  const model = MOCK_MODELS_RESPONSE.models.find(m => m.id === modelId)
  if (!model) throw new Error(`unknown model id ${modelId}`)
  return model.provider
}

async function expandProvider(page: import('@playwright/test').Page, provider: string) {
  await dismissTutorialOverlay(page)
  const header = page.locator(`.provider-dropdown[data-provider-name="${provider}"] .provider-header`)
  await expect(header).toBeVisible({ timeout: 15000 })
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click({ timeout: 15000, force: true })
  }
  await expect(header).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 })
}

async function starterCheckbox(page: import('@playwright/test').Page, modelId: string) {
  await expandProvider(page, providerForModelId(modelId))
  return page.getByTestId(`model-checkbox-${modelId}`)
}

test.describe('Starter Selection session behavior', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.route('**/api/auth/me', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Not authenticated"}' })
    )
  })

  test('deselect persists within the same session across in-app navigation', async ({ page }) => {
    const starterToClear = STARTER_IDS[0]
    await page.goto('/')
    await dismissTutorialOverlay(page)
    await waitForStarterApplied(page)

    await dismissMobileBlockers(page)
    const firstStarter = await starterCheckbox(page, starterToClear)
    await expect(firstStarter).toBeChecked({ timeout: 15000 })
    await expect(async () => {
      if (await firstStarter.isChecked()) {
        await firstStarter.click({ timeout: 5000 })
      }
      await expect(firstStarter).not.toBeChecked({ timeout: 1500 })
    }).toPass({ timeout: 20000 })

    await expect
      .poll(async () => countCheckedModels(page), { timeout: 10000 })
      .toBe(1)

    await navigateToAboutViaFooter(page)
    await navigateHomeViaBreadcrumb(page)
    await dismissTutorialOverlay(page)

    const firstAfterNav = await starterCheckbox(page, starterToClear)
    await expect(firstAfterNav).not.toBeChecked({ timeout: 15000 })
    await expect
      .poll(async () => countCheckedModels(page), { timeout: 15000 })
      .toBeLessThan(2)
  })

  test('full page reload restores Starter Selection models', async ({ page }) => {
    const starterToClear = STARTER_IDS[0]
    await page.goto('/')
    await dismissTutorialOverlay(page)
    await waitForStarterApplied(page)

    await dismissMobileBlockers(page)
    const firstStarter = await starterCheckbox(page, starterToClear)
    await expect(async () => {
      if (await firstStarter.isChecked()) {
        await firstStarter.click({ timeout: 5000 })
      }
      await expect(firstStarter).not.toBeChecked({ timeout: 1500 })
    }).toPass({ timeout: 20000 })

    await expect
      .poll(async () => countCheckedModels(page), { timeout: 10000 })
      .toBe(1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await dismissTutorialOverlay(page)
    await waitForStarterApplied(page)

    const firstAfterReload = await starterCheckbox(page, starterToClear)
    await expect(firstAfterReload).toBeChecked({ timeout: 15000 })
    await expect
      .poll(async () => countCheckedModels(page), { timeout: 10000 })
      .toBeGreaterThanOrEqual(2)
  })

  test('user default saved selection overrides Starter on load', async ({ page }) => {
    const anonId = 'e2e_starter_session_anon'
    const userDefaultId = 'user-default-pick'
    const userModelIds = ['google/gemini-2.5-flash', 'google/gemini-3.8-flash']

    await page.addInitScript(
      ({ anon, defaultId, starterModels, userModels }) => {
        localStorage.setItem('compareintel_anonymous_id', anon)
        localStorage.setItem(
          `compareintel_saved_model_selections_${anon}`,
          JSON.stringify([
            {
              id: 'starter-managed',
              name: 'Starter Selection',
              modelIds: starterModels,
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
              systemKey: 'anonymous-starter',
            },
            {
              id: defaultId,
              name: 'My Default',
              modelIds: userModels,
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ])
        )
        localStorage.setItem(`compareintel_default_model_selection_${anon}`, defaultId)
      },
      {
        anon: anonId,
        defaultId: userDefaultId,
        starterModels: STARTER_IDS,
        userModels: userModelIds,
      }
    )

    await page.goto('/')
    await dismissTutorialOverlay(page)

    await expect
      .poll(
        async () => {
          const checked = await getCheckedModelIds(page)
          return (
            checked.length === userModelIds.length &&
            userModelIds.every(id => checked.includes(id))
          )
        },
        { timeout: 20000 }
      )
      .toBe(true)

    const checked = await getCheckedModelIds(page)
    expect(checked.slice().sort()).toEqual([...userModelIds].sort())
    for (const starterOnlyId of STARTER_IDS.filter(id => !userModelIds.includes(id))) {
      expect(checked).not.toContain(starterOnlyId)
    }
  })
})