import { mkdirSync } from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

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
  runTutorialComparison,
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

async function readTooltipViewport(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tips = Array.from(
      document.querySelectorAll<HTMLElement>('.mobile-tutorial-tooltip, .tutorial-tooltip')
    )
    const tip = tips.find(el => {
      const style = getComputedStyle(el)
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.9
      )
    })
    if (!tip) return 'hidden'
    const rect = tip.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return 'empty'
    const view = window.visualViewport
    const top = view?.offsetTop ?? 0
    const left = view?.offsetLeft ?? 0
    const height = view?.height ?? window.innerHeight
    const width = view?.width ?? window.innerWidth
    const pad = 4
    const inside =
      rect.top >= top - pad &&
      rect.left >= left - pad &&
      rect.bottom <= top + height + pad &&
      rect.right <= left + width + pad
    if (inside) return 'ok'
    return `outside top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} left=${Math.round(rect.left)} right=${Math.round(rect.right)} view=${Math.round(top)}-${Math.round(top + height)}x${Math.round(width)}`
  })
}

async function expectTooltipInViewport(page: Page, label: string): Promise<void> {
  await expect
    .poll(() => readTooltipViewport(page), {
      timeout: 12_000,
      message: `${label} tooltip should be visible inside the viewport`,
    })
    .toBe('ok')
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const root = process.env.TUTORIAL_TOOLTIP_SHOTS
  if (!root) return
  const folder = isMobileE2eProject(testInfo.project.name)
    ? testInfo.project.name.includes('Pixel')
      ? 'android'
      : 'iphone'
    : 'desktop'
  const dir = `${root}/${folder}`
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${name}.png` })
}

async function nudgeScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : ((document.scrollingElement as HTMLElement | null) ?? document.documentElement)
    scroller.scrollTop += 140
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    window.dispatchEvent(new Event('resize'))
    window.visualViewport?.dispatchEvent(new Event('resize'))
  })
}

test('every tutorial step keeps its tooltip inside the viewport', async ({ page }, testInfo) => {
  test.setTimeout(420_000)
  test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
  const mobile = isMobileE2eProject(testInfo.project.name)
  const widths = mobile
    ? testInfo.project.name.includes('Pixel')
      ? [360, 412, 473]
      : [390]
    : [1440]

  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)

  for (const width of widths) {
    const height = mobile ? (width === 473 ? 840 : 800) : 900
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('compareintel_tutorial_completed')
      localStorage.removeItem('compareintel_tutorial_progress')
    })
    await page.reload()
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
    await dismissMobileBlockers(page)

    await expectTooltipInViewport(page, `${width}px step 1`)
    await shot(page, testInfo, `step1-${width}`)
    await nudgeScroll(page)
    await expectTooltipInViewport(page, `${width}px step 1 after scroll`)
    await page.setViewportSize({ width, height: Math.max(560, height - 120) })
    await expectTooltipInViewport(page, `${width}px step 1 after viewport shrink`)
    await shot(page, testInfo, `step1-${width}-resized`)
    await page.setViewportSize({ width, height })

    const first = TUTORIAL_PROVIDERS[0]!
    const second = TUTORIAL_PROVIDERS[1]!
    await expandTutorialProvider(page, first, testInfo)
    await expectTooltipInViewport(page, `${width}px step 2`)
    await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
    await expectTooltipInViewport(page, `${width}px step 3`)
    await expandTutorialProvider(page, second, testInfo)
    await expectTooltipInViewport(page, `${width}px step 4`)
    await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
      requireMinSelected: 2,
    })
    await expectTooltipInViewport(page, `${width}px step 5`)
    await completeTutorialPromptInput(page, 'Hello from the tooltip test.', testInfo)
    await expectTooltipInViewport(page, `${width}px step 6`)
    await runTutorialComparison(page, testInfo, 20_000, 'Hello from the tooltip test.')
    await expectTooltipInViewport(page, `${width}px step 7`)
    await runTutorialComparison(page, testInfo, 20_000, 'Follow-up for the tooltip test.')
    await expectTooltipInViewport(page, `${width}px step 8`)
    await clickTutorialDoneButton(page, testInfo)
    await expectTooltipInViewport(page, `${width}px step 9`)
    await page.evaluate(() => {
      const slotted = document.querySelector(
        '[data-after-results-composer-slot] .history-toggle-button'
      ) as HTMLButtonElement | null
      const fallback = document.querySelector('.history-toggle-button') as HTMLButtonElement | null
      ;(slotted ?? fallback)?.click()
    })
    await clickTutorialDoneButton(page, testInfo)
    await expectTooltipInViewport(page, `${width}px step 10`)
  }
})
