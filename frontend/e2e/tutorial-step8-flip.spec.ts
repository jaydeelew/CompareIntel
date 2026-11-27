import { mkdirSync } from 'node:fs'

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

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    project === 'Mobile Chrome - Pixel 5'
  )
}

interface ReviewCard {
  found: boolean
  pointsUp: boolean
  pointsDown: boolean
  belowPanel: boolean
  abovePanel: boolean
  clear: boolean
  overlap: string
  scroll: number
  maxScroll: number
}

async function readScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const app = document.querySelector('.app') as HTMLElement | null
    return Math.max(window.scrollY, doc.scrollTop, app?.scrollTop ?? 0)
  })
}

async function readReviewCard(page: Page): Promise<ReviewCard> {
  return page.evaluate(() => {
    const tip = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
    ).find(el => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return (
        box.width > 2 &&
        box.height > 2 &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.5
      )
    })
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const app = document.querySelector('.app') as HTMLElement | null
    const scroll = Math.max(window.scrollY, doc.scrollTop, app?.scrollTop ?? 0)
    const maxScroll = Math.max(0, doc.scrollHeight - doc.clientHeight)
    if (!tip) {
      return {
        found: false,
        pointsUp: false,
        pointsDown: false,
        belowPanel: false,
        abovePanel: false,
        clear: false,
        overlap: 'missing-card',
        scroll,
        maxScroll,
      }
    }
    const arrow = tip.querySelector('.tutorial-arrow, .mobile-tutorial-arrow')
    const pointsUp = Boolean(
      arrow?.classList.contains('mobile-tutorial-arrow-up') ||
      arrow?.classList.contains('tutorial-arrow-bottom')
    )
    const pointsDown = Boolean(
      arrow?.classList.contains('mobile-tutorial-arrow-down') ||
      arrow?.classList.contains('tutorial-arrow-top')
    )
    const card = tip.getBoundingClientRect()
    const results = document.querySelector('.results-section')?.getBoundingClientRect()
    const composer = document
      .querySelector('[data-after-results-composer-slot] .composer:not(.composer-placeholder)')
      ?.getBoundingClientRect()
    const overlaps = (box: DOMRect | undefined) => {
      if (!box || box.width < 2 || box.height < 2) return false
      const overlapW = Math.min(card.right, box.right) - Math.max(card.left, box.left)
      const overlapH = Math.min(card.bottom, box.bottom) - Math.max(card.top, box.top)
      return overlapW > 1 && overlapH > 1
    }
    let overlap = 'clear'
    if (results && overlaps(results)) overlap = 'overlaps-results'
    else if (composer && overlaps(composer)) overlap = 'overlaps-composer'
    const belowPanel = Boolean(results && card.top >= results.bottom - 2)
    const abovePanel = Boolean(results && card.bottom <= results.top + 2)
    return {
      found: true,
      pointsUp,
      pointsDown,
      belowPanel,
      abovePanel,
      clear: overlap === 'clear',
      overlap,
      scroll,
      maxScroll,
    }
  })
}

/** Document scroll. `.app` is overflow:visible during the tutorial, so it is not the scroller. */
async function scrollToY(page: Page, y: number): Promise<number> {
  await page.evaluate(target => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const max = Math.max(0, doc.scrollHeight - doc.clientHeight)
    const next = Math.max(0, Math.min(target, max))
    window.scrollTo(0, next)
    doc.scrollTop = next
  }, y)
  return readScrollTop(page)
}

async function scrollToEdge(page: Page, edge: 'top' | 'bottom'): Promise<number> {
  const max = await page.evaluate(() => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    return Math.max(0, doc.scrollHeight - doc.clientHeight)
  })
  return scrollToY(page, edge === 'bottom' ? max : 0)
}

async function expectScrollHolds(page: Page, expected: number, label: string): Promise<void> {
  const samples: number[] = []
  for (let i = 0; i < 8; i++) {
    samples.push(await readScrollTop(page))
    await page.waitForTimeout(125)
  }
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  expect(max - min, `${label} scroll snapped (${samples.join(',')})`).toBeLessThan(18)
  expect(
    Math.abs(samples[samples.length - 1]! - expected),
    `${label} left its scroll position (expected ${expected}, samples ${samples.join(',')})`
  ).toBeLessThan(24)
}

async function saveShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const folder = testInfo.project.name.includes('Pixel')
    ? 'pixel'
    : testInfo.project.name.includes('iPhone')
      ? 'iphone'
      : 'desktop'
  const dir = `/opt/cursor/artifacts/tutorial-step8-flip/${folder}`
  try {
    mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' })
  } catch {
    // CI does not have the artifact directory. Local runs still keep the shots.
  }
}

test('step 8 card flips below the results when their top edge scrolls away', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
  const mobile = isMobileE2eProject(testInfo.project.name)
  await page.setViewportSize(
    mobile
      ? testInfo.project.name.includes('Pixel')
        ? { width: 393, height: 851 }
        : { width: 390, height: 844 }
      : { width: 1440, height: 900 }
  )
  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('compareintel_tutorial_completed')
    localStorage.removeItem('compareintel_tutorial_progress')
  })
  await page.reload()
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
  await completeTutorialPromptInput(page, 'Hello from the step 8 flip test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the step 8 flip test.')
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 25_000,
  })
  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the step 8 flip test.')

  const review = tutorialTooltip(page).first()
  await expect(review).toContainText('Review the New Responses', { timeout: 25_000 })
  await expect(review).toContainText('Step 8 of 10')
  const composer = page.locator(
    '[data-after-results-composer-slot] [data-testid="comparison-input-textarea"]'
  )
  await expect(composer).toHaveAttribute('readonly', '')

  await expect
    .poll(async () => readReviewCard(page), { timeout: 5_000 })
    .toMatchObject({ found: true, pointsDown: true, abovePanel: true, clear: true })
  const seated = await readScrollTop(page)
  await saveShot(page, testInfo, 'above')

  const bottom = await scrollToEdge(page, 'bottom')
  expect(bottom, 'the page has to be able to scroll to the bottom of the results').toBeGreaterThan(
    seated + 200
  )
  await expect
    .poll(async () => readReviewCard(page), { timeout: 5_000 })
    .toMatchObject({ found: true, pointsUp: true, belowPanel: true, clear: true })
  await expectScrollHolds(page, bottom, 'scrolled to the bottom')
  const stayedBelow = await readReviewCard(page)
  expect(stayedBelow.pointsUp, stayedBelow.overlap).toBe(true)
  expect(stayedBelow.belowPanel).toBe(true)
  await saveShot(page, testInfo, 'below')

  // The hero sits above the results, so document scroll 0 hides the panel.
  // Scrolling back to the seated offset brings the panel's top edge into view.
  const restored = await scrollToY(page, seated)
  await expect
    .poll(async () => readReviewCard(page), { timeout: 5_000 })
    .toMatchObject({ found: true, pointsDown: true, abovePanel: true, clear: true })
  await expectScrollHolds(page, restored, 'scrolled back to the results top')
  const stayedAbove = await readReviewCard(page)
  expect(stayedAbove.pointsDown).toBe(true)
  expect(stayedAbove.abovePanel).toBe(true)
})
