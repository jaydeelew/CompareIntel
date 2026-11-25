import { mkdirSync } from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

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
    project === 'Mobile Chrome - Pixel 5'
  )
}

type SubmitMetrics = {
  width: number
  height: number
  borderRadius: string
  animation: string
  className: string
  step: string | null
}

async function reachEnterPrompt(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
    await page.setViewportSize({ width: 360, height: 800 })
  } else if (!isMobileE2eProject(testInfo.project.name)) {
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
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
  await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
    timeout: 15_000,
  })
}

async function readSubmit(page: Page): Promise<SubmitMetrics> {
  const metrics = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="comparison-submit-button"]')
    )
    const button = buttons.find(candidate => {
      const rect = candidate.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (!button) return null
    const style = getComputedStyle(button)
    const rect = button.getBoundingClientRect()
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      borderRadius: style.borderTopLeftRadius,
      animation: style.animationName,
      className: button.className,
      step: document.documentElement.getAttribute('data-tutorial-step'),
    }
  })
  expect(metrics, 'visible comparison submit button').not.toBeNull()
  return metrics!
}

function expectCircular(metrics: SubmitMetrics, size: number): void {
  expect(metrics.width, metrics.className).toBe(size)
  expect(metrics.height, metrics.className).toBe(size)
  const radius = Number.parseFloat(metrics.borderRadius)
  const circular =
    metrics.borderRadius === '50%' || (Number.isFinite(radius) && radius >= size / 2 - 0.5)
  expect(circular, `border-radius ${metrics.borderRadius} on ${metrics.className}`).toBe(true)
}

async function waitForOpaqueTooltip(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tip = document.querySelector(
            '.mobile-tutorial-tooltip, .tutorial-tooltip'
          ) as HTMLElement | null
          if (!tip) return 0
          const style = getComputedStyle(tip)
          if (style.display === 'none' || style.visibility === 'hidden') return 0
          return Number(style.opacity)
        }),
      { timeout: 8_000 }
    )
    .toBeGreaterThan(0.9)
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await waitForOpaqueTooltip(page)
  const root = process.env.TUTORIAL_SUBMIT_SHOTS
  if (!root) return
  if (name === 'step6') {
    // The attention ring expands and fades. Catch a frame where the spread is visible.
    await page
      .waitForFunction(
        () => {
          const button = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[data-testid="comparison-submit-button"]')
          ).find(candidate => candidate.getBoundingClientRect().width > 0)
          if (!button) return false
          const match = getComputedStyle(button).boxShadow.match(/0px 0px 0px ([0-9.]+)px/)
          if (!match) return false
          const spread = Number(match[1])
          return spread > 2 && spread < 8
        },
        undefined,
        { timeout: 3_000 }
      )
      .catch(() => {})
  }
  const folder = isMobileE2eProject(testInfo.project.name)
    ? testInfo.project.name.includes('Pixel')
      ? 'android360'
      : 'iphone'
    : 'desktop'
  const dir = `${root}/${folder}`
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${name}.png` })
}

test('mobile steps 5 and 6 keep the submit button a circle at its normal size', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
  const size = isMobileE2eProject(testInfo.project.name) ? 32 : 36

  await reachEnterPrompt(page, testInfo)
  const step5 = await readSubmit(page)
  expect(step5.step).toBe('enter-prompt')
  expectCircular(step5, size)
  expect(step5.className).not.toContain('mobile-tutorial-highlight')
  expect(step5.className).not.toContain('tutorial-highlight')
  await shot(page, testInfo, 'step5')

  await completeTutorialPromptInput(page, 'Compare these two models on a short prompt.', testInfo)
  await expect
    .poll(async () => (await readSubmit(page)).animation, { timeout: 5_000 })
    .toContain('tutorial-submit-attention')
  const step6 = await readSubmit(page)
  expect(step6.step).toBe('submit-comparison')
  expectCircular(step6, size)
  expect(step6.width).toBe(step5.width)
  expect(step6.height).toBe(step5.height)
  expect(step6.className).toContain('tutorial-submit-attention')
  expect(step6.className).not.toContain('mobile-tutorial-highlight')
  expect(step6.className).not.toContain('tutorial-highlight')
  expect(step6.animation).not.toContain('mobile-tutorial-pulse')
  await expect(tutorialTooltip(page).first()).toContainText('Run Your Comparison')
  await shot(page, testInfo, 'step6')
})
