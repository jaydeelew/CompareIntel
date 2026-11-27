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

/** Document and `.app` can each be the scroller. Report whichever has moved. */
async function readScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const app = document.querySelector('.app') as HTMLElement | null
    return Math.max(window.scrollY, doc.scrollTop, app?.scrollTop ?? 0)
  })
}

async function gesturePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const results = document.querySelector('.results-section')
    const box = results?.getBoundingClientRect()
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const heading = document.querySelector('.results-section h2')
    const head = heading?.getBoundingClientRect()
    if (head && head.width > 20 && head.top > 8 && head.bottom < viewH - 8) {
      return {
        x: Math.min(viewW - 24, Math.max(head.left + 24, 24)),
        y: Math.min(viewH - 24, Math.max(head.top + head.height / 2, 24)),
      }
    }
    if (box && box.width > 20 && box.bottom > 80 && box.top < viewH - 40) {
      const y = Math.min(viewH - 48, Math.max(box.top + 28, 96))
      const x = Math.min(viewW - 24, Math.max(box.left + 28, 24))
      return { x, y }
    }
    return { x: viewW / 2, y: viewH * 0.62 }
  })
}

/**
 * One gesture on the dim shield. That is the surface Jack's finger hits.
 * A second wheel or CDP swipe lands a frame later and looks like a snap.
 * WebKit rejects `new Touch` / `new TouchEvent`, so the touch sequence is a
 * cancelable Event that carries the same `touches` the shield reads.
 */
async function wheelBy(page: Page, _testInfo: TestInfo, x: number, y: number, deltaY: number) {
  await page.evaluate(
    ({ x: clientX, y: clientY, deltaY: dy }) => {
      const shield = document.getElementById('tutorial-interaction-shield')
      const target = shield ?? document.elementFromPoint(clientX, clientY) ?? document.body
      target.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: dy,
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
        })
      )
    },
    { x, y, deltaY }
  )
}

async function touchBy(page: Page, _testInfo: TestInfo, x: number, y: number, deltaY: number) {
  const travel = Math.min(Math.abs(deltaY), 220)
  const toY = y - Math.sign(deltaY) * travel
  await page.evaluate(
    ({ x: clientX, fromY, toY: endY }) => {
      const shield = document.getElementById('tutorial-interaction-shield')
      const target = shield ?? document.elementFromPoint(clientX, fromY) ?? document.body
      const point = (clientY: number) => ({
        identifier: 1,
        target,
        clientX,
        clientY,
        pageX: clientX,
        pageY: clientY,
      })
      const fire = (type: string, clientY: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true })
        const touches = type === 'touchend' ? [] : [point(clientY)]
        Object.defineProperty(event, 'touches', { value: touches })
        Object.defineProperty(event, 'changedTouches', { value: [point(clientY)] })
        target.dispatchEvent(event)
      }
      fire('touchstart', fromY)
      const steps = 8
      for (let i = 1; i <= steps; i++) {
        fire('touchmove', fromY + ((endY - fromY) * i) / steps)
      }
      fire('touchend', endY)
    },
    { x, fromY: y, toY }
  )
}

/**
 * Scroll, then sample for about a second. The offset must move in `direction`
 * and stay there. A seat-the-card loop that pulls the page back fails this.
 */
async function expectScrollSticks(
  page: Page,
  testInfo: TestInfo,
  direction: 'down' | 'up',
  kind: 'wheel' | 'touch',
  label: string
): Promise<void> {
  // Leave room in the requested direction. The assertion is the gesture, not
  // whether the step happened to seat the page against an edge.
  await page.evaluate(dir => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const max = Math.max(0, doc.scrollHeight - doc.clientHeight)
    const current = Math.max(window.scrollY, doc.scrollTop)
    const room = dir === 'down' ? max - current : current
    if (room >= 120 || max < 80) return
    const next = dir === 'down' ? Math.max(0, current - 360) : Math.min(max, current + 360)
    window.scrollTo(0, next)
    doc.scrollTop = next
  }, direction)
  await page.waitForTimeout(80)
  const point = await gesturePoint(page)
  const before = await readScrollTop(page)
  const delta = direction === 'down' ? 420 : -420
  if (kind === 'wheel') await wheelBy(page, testInfo, point.x, point.y, delta)
  else await touchBy(page, testInfo, point.x, point.y, delta)

  const samples: number[] = []
  for (let i = 0; i < 8; i++) {
    samples.push(await readScrollTop(page))
    await page.waitForTimeout(125)
  }
  const detail = await page.evaluate(() => {
    const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
    const app = document.querySelector('.app') as HTMLElement | null
    return {
      win: window.scrollY,
      doc: doc.scrollTop,
      app: app?.scrollTop ?? null,
      appOverflow: app ? getComputedStyle(app).overflowY : null,
      max: doc.scrollHeight - doc.clientHeight,
    }
  })
  const moved = direction === 'down' ? samples[0]! - before : before - samples[0]!
  expect(
    moved,
    `${label} ${kind} scroll ${direction} should move scrollTop (before ${before}, samples ${samples.join(',')}, ${JSON.stringify(detail)})`
  ).toBeGreaterThan(28)
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  expect(
    max - min,
    `${label} ${kind} scroll ${direction} oscillated (${samples.join(',')})`
  ).toBeLessThan(18)
}

async function cardClearsHighlights(page: Page): Promise<string> {
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
        Number(style.opacity) > 0.05
      )
    })
    if (!tip) return 'missing-card'
    const a = tip.getBoundingClientRect()
    const overlaps = (box: DOMRect | undefined) => {
      if (!box || box.width < 2 || box.height < 2) return false
      const overlapW = Math.min(a.right, box.right) - Math.max(a.left, box.left)
      const overlapH = Math.min(a.bottom, box.bottom) - Math.max(a.top, box.top)
      return overlapW > 1 && overlapH > 1
    }
    const results = document.querySelector('.results-section')
    if (results instanceof HTMLElement && overlaps(results.getBoundingClientRect())) {
      return 'overlaps-results'
    }
    const composer = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    if (composer instanceof HTMLElement && overlaps(composer.getBoundingClientRect())) {
      return 'overlaps-composer'
    }
    return 'clear'
  })
}

/**
 * A long scroll can take the highlight off the viewport. The existing hint
 * replaces the card then. A card that is still on screen must stay clear of
 * the results and the composer.
 */
async function cardOrScrollHint(page: Page): Promise<string> {
  const placed = await cardClearsHighlights(page)
  if (placed !== 'missing-card') return placed
  const hint = await page.locator('.mobile-tutorial-scroll-indicator').count()
  return hint > 0 ? 'scroll-back' : 'missing-card'
}

test('tutorial steps 7 and 8 let the page scroll without snapping back', async ({
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
  await completeTutorialPromptInput(page, 'Hello from the step scroll test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the step scroll test.')

  const followUp = tutorialTooltip(page).first()
  await expect(followUp).toContainText('Continue the Conversation', { timeout: 25_000 })
  await page.waitForTimeout(500)
  await expectScrollSticks(page, testInfo, 'down', 'wheel', 'step 7')
  await expectScrollSticks(page, testInfo, 'up', 'wheel', 'step 7')
  await expectScrollSticks(page, testInfo, 'down', 'touch', 'step 7')
  await expectScrollSticks(page, testInfo, 'up', 'touch', 'step 7')
  await expect
    .poll(() => cardOrScrollHint(page), { timeout: 5_000 })
    .toMatch(/^(clear|scroll-back)$/)

  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the step scroll test.')
  const review = tutorialTooltip(page).first()
  await expect(review).toContainText('Review the New Responses', { timeout: 25_000 })
  await page.waitForTimeout(500)
  await expectScrollSticks(page, testInfo, 'down', 'wheel', 'step 8')
  await expectScrollSticks(page, testInfo, 'up', 'wheel', 'step 8')
  await expectScrollSticks(page, testInfo, 'down', 'touch', 'step 8')
  await expectScrollSticks(page, testInfo, 'up', 'touch', 'step 8')
  await expect
    .poll(() => cardOrScrollHint(page), { timeout: 5_000 })
    .toMatch(/^(clear|scroll-back)$/)

  if (mobile) {
    const folder = testInfo.project.name.includes('Pixel') ? 'pixel' : 'iphone'
    const dir = `/opt/cursor/artifacts/tutorial-step8-scroll/${folder}`
    mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: `${dir}/step8-scrolled-up.png`, animations: 'disabled' })
  }
})
