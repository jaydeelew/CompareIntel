import fs from 'node:fs'

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

interface PlacementReport {
  ok: boolean
  reason: string
  arrowGap: number | null
  centerOffset: number | null
  title: string | null
}

async function readPlacement(page: Page): Promise<PlacementReport> {
  return page.evaluate(() => {
    const tip = document.querySelector(
      '.mobile-tutorial-tooltip, .tutorial-tooltip'
    ) as HTMLElement | null
    const title =
      document.querySelector('.mobile-tutorial-tooltip-title, .tutorial-tooltip-title')
        ?.textContent ?? null
    if (!tip)
      return { ok: false, reason: 'missing tooltip', arrowGap: null, centerOffset: null, title }
    const opacity = Number(getComputedStyle(tip).opacity)
    if (!(opacity > 0.9)) {
      return { ok: false, reason: `opacity ${opacity}`, arrowGap: null, centerOffset: null, title }
    }
    const cutouts = Array.from(
      document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
    )
      .map(el => el.getBoundingClientRect())
      .filter(
        rect =>
          rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < window.innerHeight
      )
    if (cutouts.length === 0) {
      return {
        ok: false,
        reason: 'highlight is outside the viewport',
        arrowGap: null,
        centerOffset: null,
        title,
      }
    }
    const arrow = document.querySelector(
      '.mobile-tutorial-arrow, .tutorial-arrow'
    ) as HTMLElement | null
    if (!arrow)
      return { ok: false, reason: 'missing arrow', arrowGap: null, centerOffset: null, title }
    const arrowBox = arrow.getBoundingClientRect()
    const pointsDown =
      arrow.classList.contains('mobile-tutorial-arrow-down') ||
      arrow.classList.contains('tutorial-arrow-top')
    const tipY = pointsDown ? arrowBox.bottom : arrowBox.top
    let arrowGap = Number.POSITIVE_INFINITY
    for (const cutout of cutouts) {
      const edge = pointsDown ? cutout.top : cutout.bottom
      arrowGap = Math.min(arrowGap, Math.abs(tipY - edge))
    }
    const vh = window.innerHeight
    let closest = cutouts[0]!
    let centerOffset = Number.POSITIVE_INFINITY
    for (const cutout of cutouts) {
      const offset = Math.abs(cutout.top + cutout.height / 2 - vh / 2)
      if (offset < centerOffset) {
        centerOffset = offset
        closest = cutout
      }
    }
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : (document.scrollingElement ?? document.documentElement)
    const scrollTop = scroller.scrollTop
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const signedOffset = closest.top + closest.height / 2 - vh / 2
    const canScrollCloser =
      (signedOffset > 48 && scrollTop < maxScroll - 2) || (signedOffset < -48 && scrollTop > 2)
    const tall = closest.height > vh * 0.55
    const centered = tall || centerOffset < 80 || !canScrollCloser
    const onScreen = closest.bottom > 8 && closest.top < vh - 8
    const arrowTouches = arrowGap <= 6
    const ok = onScreen && centered && arrowTouches
    const reason = ok
      ? 'ok'
      : `onScreen=${onScreen} centered=${centered} arrowGap=${Math.round(arrowGap)} centerOffset=${Math.round(centerOffset)} scroll=${Math.round(scrollTop)}/${Math.round(maxScroll)}`
    return { ok, reason, arrowGap, centerOffset, title }
  })
}

async function expectStepPlacement(page: Page, testInfo: TestInfo, label: string) {
  await expect
    .poll(async () => (await readPlacement(page)).reason, {
      timeout: 12_000,
      message: `${label} highlight should be centered with the arrow on its edge`,
    })
    .toBe('ok')
  const surface = isMobileE2eProject(testInfo.project.name) ? 'mobile' : 'desktop'
  const dir = `/opt/cursor/artifacts/tutorial-placement/after/${surface}`
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${label}.png` })
}

test('tutorial highlight stays centered and the arrow touches it', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const project = testInfo.project.name
  const mobileChromium =
    project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1'
  test.skip(
    project !== 'chromium' && project !== 'Mobile Safari - iPhone 12' && !mobileChromium,
    'desktop, Mobile Safari, and opted-in mobile Chromium'
  )
  if (isMobileE2eProject(project)) {
    await page.setViewportSize({ width: 390, height: 844 })
  } else {
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Tutorial' }).click()
  await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 15_000 })
  await dismissMobileBlockers(page)

  const first = TUTORIAL_PROVIDERS[0]!
  const second = TUTORIAL_PROVIDERS[1]!
  await expectStepPlacement(page, testInfo, '01-expand-provider')
  await expandTutorialProvider(page, first, testInfo)
  await expectStepPlacement(page, testInfo, '02-select-model-1')
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
  await expectStepPlacement(page, testInfo, '03-expand-provider-2')
  await expandTutorialProvider(page, second, testInfo)
  await expectStepPlacement(page, testInfo, '04-select-model-2')
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
    requireMinSelected: 2,
  })
  await expectStepPlacement(page, testInfo, '05-enter-prompt')
  await completeTutorialPromptInput(page, 'Hello from the placement test.', testInfo)
  await expectStepPlacement(page, testInfo, '06-submit')
  await runTutorialComparison(page, testInfo, 20_000, 'Hello from the placement test.')
  await expectStepPlacement(page, testInfo, '07-follow-up')
  await runTutorialComparison(page, testInfo, 20_000, 'Follow-up for the placement test.')
  await expectStepPlacement(page, testInfo, '08-review')
  await clickTutorialDoneButton(page, testInfo)
  await expectStepPlacement(page, testInfo, '09-history')
  await page.evaluate(() => {
    const slotted = document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) as HTMLButtonElement | null
    const fallback = document.querySelector('.history-toggle-button') as HTMLButtonElement | null
    ;(slotted ?? fallback)?.click()
  })
  await clickTutorialDoneButton(page, testInfo)
  await expectStepPlacement(page, testInfo, '10-save')
})
