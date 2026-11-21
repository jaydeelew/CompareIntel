import fs from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

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

const FRAME_OUTSET_PX = 8
const ALIGN_TOLERANCE_PX = 6

async function historyCutoutReason(page: Page, open: boolean): Promise<string> {
  return page.evaluate(
    ({ outset, tolerance, expectList }) => {
      const composer = document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) as HTMLElement | null
      if (!composer) return 'composer missing'
      const parts = [
        composer.querySelector('.composer-input-wrapper'),
        composer.querySelector('.composer-toolbar'),
        expectList ? composer.querySelector('.history-inline-list') : null,
      ].filter(Boolean) as HTMLElement[]
      if (expectList && !composer.querySelector('.history-inline-list'))
        return 'history list missing'
      let top = Infinity
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      for (const part of parts) {
        const rect = part.getBoundingClientRect()
        top = Math.min(top, rect.top)
        left = Math.min(left, rect.left)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
      const cutouts = Array.from(
        document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
      )
        .map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 2 && rect.height > 2)
      const matched = cutouts.some(
        cutout =>
          Math.abs(cutout.top - (top - outset)) <= tolerance &&
          Math.abs(cutout.left - (left - outset)) <= tolerance &&
          Math.abs(cutout.bottom - (bottom + outset)) <= tolerance &&
          Math.abs(cutout.right - (right + outset)) <= tolerance
      )
      if (!matched) {
        const nearest = cutouts[0]
        return nearest
          ? `cutout ${Math.round(nearest.top)}..${Math.round(nearest.bottom)} target ${Math.round(top)}..${Math.round(bottom)}`
          : 'no cutout'
      }
      const arrow = document.querySelector(
        '.mobile-tutorial-arrow, .tutorial-arrow'
      ) as HTMLElement | null
      if (!arrow) return 'missing arrow'
      const arrowBox = arrow.getBoundingClientRect()
      const pointsDown =
        arrow.classList.contains('mobile-tutorial-arrow-down') ||
        arrow.classList.contains('tutorial-arrow-top')
      const tipY = pointsDown ? arrowBox.bottom : arrowBox.top
      const gap = Math.min(
        ...cutouts.map(cutout => Math.abs(tipY - (pointsDown ? cutout.top : cutout.bottom)))
      )
      if (gap > tolerance) return `arrow gap ${Math.round(gap)}`
      return 'ok'
    },
    { outset: FRAME_OUTSET_PX, tolerance: ALIGN_TOLERANCE_PX, expectList: open }
  )
}

async function toggleHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const slotted = document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) as HTMLButtonElement | null
    const fallback = document.querySelector('.history-toggle-button') as HTMLButtonElement | null
    ;(slotted ?? fallback)?.click()
  })
}

test('history cutout grows and shrinks with the dropdown', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const project = testInfo.project.name
  const mobileChromium =
    project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1'
  test.skip(
    project !== 'chromium' && project !== 'Mobile Safari - iPhone 12' && !mobileChromium,
    'desktop, Mobile Safari, and opted-in mobile Chromium'
  )
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
  await completeTutorialPromptInput(page, 'Hello from the history cutout test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the history cutout test.')
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })
  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the history cutout test.')
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History', {
    timeout: 20_000,
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tip = document.querySelector(
            '.mobile-tutorial-tooltip, .tutorial-tooltip'
          ) as HTMLElement | null
          if (!tip) return 'wait'
          const hidden =
            tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
            tip.classList.contains('tutorial-tooltip--transitioning')
          return !hidden && Number(getComputedStyle(tip).opacity) > 0.9 ? 'ready' : 'wait'
        }),
      { timeout: 8_000 }
    )
    .toBe('ready')

  await toggleHistory(page)
  await expect
    .poll(() => page.locator('.history-inline-list').count(), { timeout: 5_000 })
    .toBeGreaterThan(0)

  const surface = isMobileE2eProject(testInfo.project.name) ? 'mobile' : 'desktop'
  const phase = process.env.HISTORY_SHOT ?? 'after'
  const dir = `/opt/cursor/artifacts/tutorial-history-cutout/${phase}/${surface}`
  fs.mkdirSync(dir, { recursive: true })

  await expect
    .poll(() => historyCutoutReason(page, true), {
      timeout: 2_000,
      message: 'open history list should sit inside the cutout',
    })
    .toBe('ok')
  await page.screenshot({ path: `${dir}/09-open.png` })

  await toggleHistory(page)
  await expect.poll(() => page.locator('.history-inline-list').count(), { timeout: 5_000 }).toBe(0)
  await expect
    .poll(() => historyCutoutReason(page, false), {
      timeout: 2_000,
      message: 'closing history should shrink the cutout back to the composer',
    })
    .toBe('ok')
  await page.screenshot({ path: `${dir}/09-closed.png` })
})
