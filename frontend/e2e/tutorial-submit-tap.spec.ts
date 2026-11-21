import fs from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  completeTutorialPromptInput,
  expandTutorialProvider,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

const mockModel = (id: string, name: string, provider: string) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: 'unregistered' as const,
})

const fillers = ['Amazon', 'Cohere', 'Google', 'Meta', 'Mistral']
const MOCK_MODELS: Record<string, ReturnType<typeof mockModel>[]> = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
}
for (const name of fillers) {
  MOCK_MODELS[name] = [mockModel(`${name.toLowerCase()}/filler`, `${name} Filler`, name)]
}
MOCK_MODELS.OpenAI = [mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI')]

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    (project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1')
  )
}

/** The visible submit control, not the inert hero mirror. */
async function submitPoint(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="comparison-submit-button"]')
    )
    const button = buttons.find(el => {
      const rect = el.getBoundingClientRect()
      return rect.width > 2 && rect.height > 2 && el.closest('[aria-hidden="true"]') == null
    })
    if (!button) return null
    const rect = button.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
}

async function submitHit(page: Page): Promise<string> {
  const point = await submitPoint(page)
  if (!point) return 'no button'
  return page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)
    if (!hit) return 'nothing'
    if (hit.closest('#tutorial-interaction-shield')) return 'shield'
    if (hit.closest('[data-testid="comparison-submit-button"]')) return 'submit'
    return hit.tagName
  }, point)
}

test('step 6 submit tap works while the prompt is focused', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const project = testInfo.project.name
  test.skip(!projectAllowed(project), 'desktop, Mobile Safari, and opted-in mobile Chromium')
  if (project === 'Mobile Chrome - Pixel 5') {
    await page.setViewportSize({ width: 393, height: 851 })
  } else if (!isMobileE2eProject(project)) {
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Tutorial' }).click()
  await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
  await dismissMobileBlockers(page)

  const first = TUTORIAL_PROVIDERS[0]!
  const second = TUTORIAL_PROVIDERS[1]!
  await expandTutorialProvider(page, first, testInfo)
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
  await expandTutorialProvider(page, second, testInfo)
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
    requireMinSelected: 2,
  })

  await completeTutorialPromptInput(page, 'Sqrt 3?', testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Run Your Comparison', {
    timeout: 20_000,
  })

  const textarea = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
  await textarea.focus()
  await expect.poll(() => submitHit(page), { timeout: 5_000 }).toBe('submit')

  const size = page.viewportSize()
  expect(size).not.toBeNull()
  await page.setViewportSize({ width: size!.width, height: Math.max(480, size!.height - 280) })
  await expect.poll(() => submitHit(page), { timeout: 5_000 }).toBe('submit')

  const point = await submitPoint(page)
  expect(point).not.toBeNull()
  await page.mouse.click(point!.x, point!.y)
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })
  await page.setViewportSize({ width: size!.width, height: size!.height })
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation')

  if (project === 'Mobile Chrome - Pixel 5') {
    try {
      const dir = '/opt/cursor/artifacts/tutorial-submit-tap'
      fs.mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${dir}/pixel5-step7.png` })
    } catch {
      // The artifacts directory is for the PR image. CI does not need the file.
    }
  }
})
