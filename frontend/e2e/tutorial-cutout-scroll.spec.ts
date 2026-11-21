import fs from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
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

/** Blue frame is drawn 8px outside the target. A stuck frame misses by the scroll distance. */
const FRAME_OUTSET_PX = 8
const ALIGN_TOLERANCE_PX = 6

interface FrameSample {
  targets: Array<{ top: number; left: number; bottom: number; right: number } | null>
  cutouts: Array<{ top: number; left: number; bottom: number; right: number }>
}

async function readFrames(page: Page, targets: string[]): Promise<FrameSample> {
  return page.evaluate(selectors => {
    const box = (rect: DOMRect) => ({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
    })
    return {
      targets: selectors.map(selector => {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return rect && rect.width > 2 && rect.height > 2 ? box(rect) : null
      }),
      cutouts: Array.from(
        document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
      )
        .map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 2 && rect.height > 2)
        .map(box),
    }
  }, targets)
}

function alignmentReason(before: FrameSample, after: FrameSample): string {
  if (before.cutouts.length === 0 || after.cutouts.length === 0) return 'no cutout'
  const misses: string[] = []
  before.targets.forEach((target, index) => {
    const next = after.targets[index]
    if (!target || !next) {
      misses.push(`target ${index} missing`)
      return
    }
    let pair = 0
    let best = Number.POSITIVE_INFINITY
    before.cutouts.forEach((cutout, cutoutIndex) => {
      const gap = Math.abs(cutout.top - (target.top - FRAME_OUTSET_PX))
      if (gap < best) {
        best = gap
        pair = cutoutIndex
      }
    })
    const cutoutBefore = before.cutouts[pair]
    const cutoutAfter =
      after.cutouts.find(
        cutout =>
          Math.abs(cutout.bottom - cutout.top - (cutoutBefore.bottom - cutoutBefore.top)) < 4
      ) ?? after.cutouts[Math.min(pair, after.cutouts.length - 1)]
    if (!cutoutBefore || !cutoutAfter) {
      misses.push(`target ${index} lost its cutout`)
      return
    }
    const targetDy = next.top - target.top
    const cutoutDy = cutoutAfter.top - cutoutBefore.top
    const edges = [
      Math.abs(cutoutAfter.top - (next.top - FRAME_OUTSET_PX)),
      Math.abs(cutoutAfter.left - (next.left - FRAME_OUTSET_PX)),
      Math.abs(cutoutAfter.bottom - (next.bottom + FRAME_OUTSET_PX)),
      Math.abs(cutoutAfter.right - (next.right + FRAME_OUTSET_PX)),
    ]
    const followed = Math.abs(cutoutDy - targetDy) <= ALIGN_TOLERANCE_PX
    const seated = edges.every(edge => edge <= ALIGN_TOLERANCE_PX + 2)
    if (!followed || !seated) {
      misses.push(
        `target ${index} dy ${Math.round(targetDy)} cutout dy ${Math.round(cutoutDy)} edge ${Math.round(Math.max(...edges))}`
      )
    }
  })
  return misses.length === 0 ? 'ok' : misses.join('; ')
}

async function scrollPage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : ((document.scrollingElement ?? document.documentElement) as HTMLElement)
    const before = scroller.scrollTop
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const roomDown = max - before
    const amount = 160
    const next =
      roomDown >= 80 ? before + Math.min(amount, roomDown) : before - Math.min(amount, before)
    scroller.scrollTop = next
    return scroller.scrollTop - before
  })
}

async function restoreScroll(page: Page, delta: number): Promise<void> {
  await scrollPageBy(page, -delta)
}

async function scrollPageBy(page: Page, delta: number): Promise<void> {
  await page.evaluate(amount => {
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : ((document.scrollingElement ?? document.documentElement) as HTMLElement)
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    scroller.scrollTop = Math.max(0, Math.min(scroller.scrollTop + amount, max))
  }, delta)
}

async function scrollAndRead(
  page: Page,
  testInfo: TestInfo,
  label: string,
  targets: string[]
): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tip = document.querySelector(
            '.mobile-tutorial-tooltip, .tutorial-tooltip'
          ) as HTMLElement | null
          if (!tip) return 'missing'
          const hidden =
            tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
            tip.classList.contains('tutorial-tooltip--settling')
          return !hidden && Number(getComputedStyle(tip).opacity) > 0.9 ? 'ready' : 'wait'
        }),
      { timeout: 12_000 }
    )
    .toBe('ready')
  const before = await readFrames(page, targets)
  const moved = await scrollPage(page)
  if (Math.abs(moved) <= 80) return `${label} did not scroll (${moved})`
  const surface = isMobileE2eProject(testInfo.project.name) ? 'mobile' : 'desktop'
  const phase = process.env.CUTOUT_SHOT ?? 'after'
  const dir = `/opt/cursor/artifacts/tutorial-cutout-scroll/${phase}/${surface}`
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${label}.png` })
  let reason = 'pending'
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    reason = alignmentReason(before, await readFrames(page, targets))
    if (reason === 'ok') break
    await page.waitForTimeout(50)
  }
  await restoreScroll(page, moved)
  return reason === 'ok' ? 'ok' : `${label}: ${reason}`
}

test('tutorial cutouts follow the target while the page scrolls', async ({ page }, testInfo) => {
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
  await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
    timeout: 15_000,
  })
  const promptAlign = await scrollAndRead(page, testInfo, '05-prompt', [
    '.composer:not(.composer-placeholder)',
  ])
  await completeTutorialPromptInput(page, 'Hello from the cutout scroll test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the cutout scroll test.')
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })
  const followUpAlign = await scrollAndRead(page, testInfo, '07-follow-up', [
    '.results-section',
    '[data-after-results-composer-slot] .composer:not(.composer-placeholder)',
  ])
  expect(promptAlign, 'prompt cutout should stay on the composer').toBe('ok')
  expect(followUpAlign, 'step 7 cutouts should stay on the results and the composer').toBe('ok')
})
