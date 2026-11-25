import { mkdirSync } from 'node:fs'

import { expect, test as base, type Page, type TestInfo } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { test as fixtureTest } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { isMobileChromeProject, touchSwipe } from './helpers/harnessTouchScroll'
import { buildMockComparisonStream } from './helpers/mockModels'
import {
  dismissMobileBlockers,
  isMobileE2eProject,
  toggleModelCheckbox,
} from './helpers/modelCheckbox'
import {
  completeTutorialPromptInput,
  expandTutorialProvider,
  runTutorialComparison,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

const WIDE = Array.from({ length: 36 }, () => 'precision').join(' ')
const CODE_ANSWER = [
  '```python',
  'from decimal import Decimal',
  `x = "${WIDE}"`,
  'print(Decimal(2).sqrt())',
  '```',
  '',
  'For normal use, math.sqrt(2) is the standard approach.',
].join('\n')

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

async function installCodeComparisonStream(page: Page): Promise<void> {
  await page.route('**/api/compare-stream', async route => {
    let models: string[] = []
    try {
      models = (route.request().postDataJSON() as { models?: string[] })?.models ?? []
    } catch {
      models = []
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: buildMockComparisonStream(models, CODE_ANSWER),
    })
  })
}

async function shot(page: Page, testInfo: TestInfo, width: number): Promise<void> {
  if (!process.env.TUTORIAL_SWIPE_HINT_SHOTS) return
  const root = '/opt/cursor/artifacts/tutorial-swipe-hint'
  const folder = testInfo.project.name.includes('Pixel')
    ? 'android'
    : testInfo.project.name.includes('iPhone')
      ? 'iphone'
      : 'desktop'
  mkdirSync(`${root}/${folder}`, { recursive: true })
  await page.evaluate(() => {
    const header = document.querySelector('.result-header')
    if (!header) return
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : ((document.scrollingElement as HTMLElement | null) ?? document.documentElement)
    for (let i = 0; i < 5; i++) {
      const delta = header.getBoundingClientRect().top - 12
      if (Math.abs(delta) < 6) break
      scroller.scrollTop += delta
    }
  })
  const card = page.locator('.result-card').first()
  await card.screenshot({
    path: `${root}/${folder}/results-${width}.png`,
    animations: 'disabled',
  })
}

async function expectHintOutsideResponse(page: Page): Promise<void> {
  const hint = page.getByTestId('results-tab-swipe-hint')
  await expect(hint).toBeVisible()
  await expect(hint).toContainText('Swipe or tap ‹ › to switch models')
  const placement = await page.evaluate(() => {
    const hintEl = document.querySelector('.results-tab-swipe-hint')
    const header = document.querySelector('.result-header')
    const body = document.querySelector('.conversation-content')
    const code = document.querySelector('.code-block, .code-block-direct')
    if (!hintEl || !header || !body || !code) return 'missing'
    if (body.contains(hintEl) || code.contains(hintEl)) return 'inside-response'
    const hintBox = hintEl.getBoundingClientRect()
    const headerBox = header.getBoundingClientRect()
    const codeBox = code.getBoundingClientRect()
    if (hintBox.top < headerBox.bottom - 2) return 'above-header'
    if (hintBox.bottom > codeBox.top + 4 && hintBox.top < codeBox.bottom) return 'overlaps-code'
    const background = getComputedStyle(hintEl).backgroundColor
    if (!background || background === 'rgba(0, 0, 0, 0)' || background === 'transparent') {
      return 'transparent'
    }
    return 'ok'
  })
  expect(placement).toBe('ok')
}

base.describe('tutorial swipe hint placement', () => {
  base.describe.configure({ timeout: 180_000 })

  base('tutorial hint sits under the result header, off the code block', async ({
    page,
  }, testInfo) => {
    base.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
    const mobile = isMobileE2eProject(testInfo.project.name)
    const widths = mobile ? (testInfo.project.name.includes('Pixel') ? [360, 473] : [390]) : [390]

    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await installCodeComparisonStream(page)

    for (const width of widths) {
      const height = width === 473 ? 840 : 800
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

      const first = TUTORIAL_PROVIDERS[0]!
      const second = TUTORIAL_PROVIDERS[1]!
      await expandTutorialProvider(page, first, testInfo)
      await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
      await expandTutorialProvider(page, second, testInfo)
      await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
        requireMinSelected: 2,
      })
      await completeTutorialPromptInput(page, 'Show a short Python square root.', testInfo)
      await runTutorialComparison(page, testInfo, 25_000, 'Show a short Python square root.')
      await expect(page.locator('.code-block, .code-block-direct').first()).toBeVisible({
        timeout: 20_000,
      })
      await expectHintOutsideResponse(page)
      await shot(page, testInfo, width)
    }
  })
})

fixtureTest.describe('code block swipe versus prose swipe', () => {
  fixtureTest.describe.configure({ timeout: 120_000 })

  fixtureTest('a sideways swipe scrolls wide code and a swipe on prose switches models', async ({
    mockedModelsAuthenticatedPage: page,
  }, testInfo) => {
    fixtureTest.skip(
      !isMobileChromeProject(testInfo.project.name),
      'CDP touch gestures run on Mobile Chrome device projects only'
    )
    await installCodeComparisonStream(page)
    await page.setViewportSize({ width: 393, height: 851 })

    const input = page.getByTestId('comparison-input-textarea')
    await input.fill('Show a short Python square root.')
    await page
      .locator('.loading-message')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {})

    const providerHeader = page.locator('.provider-header').first()
    if ((await providerHeader.getAttribute('aria-expanded')) !== 'true') {
      await providerHeader.click()
      await page.waitForTimeout(400)
    }
    for (const modelId of ['openai/gpt-5', 'openai/gpt-4.1']) {
      const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
      await expect(checkbox).toBeVisible({ timeout: 15_000 })
      await toggleModelCheckbox(checkbox, testInfo.project.name)
    }

    await submitAndAwaitCompareStream(page)
    const tabs = page.locator('.results-tab-button')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')

    const code = page.locator('.code-block, .code-block-direct').first()
    await expect(code).toBeVisible({ timeout: 20_000 })
    await code.scrollIntoViewIfNeeded()
    const scrollerInfo = await code.evaluate(el => {
      const candidates = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))]
      for (const node of candidates) {
        const overflowX = getComputedStyle(node).overflowX
        const range = node.scrollWidth - node.clientWidth
        if (
          range > 24 &&
          (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
        ) {
          node.setAttribute('data-testid', 'wide-code-scroller')
          return { range, overflowX }
        }
      }
      const inner = el.querySelector('code')
      return {
        range: el.scrollWidth - el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
        inner: inner
          ? {
              range: inner.scrollWidth - inner.clientWidth,
              overflowX: getComputedStyle(inner).overflowX,
              whiteSpace: getComputedStyle(inner).whiteSpace,
              wordBreak: getComputedStyle(inner).wordBreak,
            }
          : null,
      }
    })
    expect(scrollerInfo.range, JSON.stringify(scrollerInfo)).toBeGreaterThan(24)
    const scroller = page.getByTestId('wide-code-scroller')
    const before = await scroller.evaluate(el => el.scrollLeft)
    const box = await scroller.boundingBox()
    expect(box).toBeTruthy()
    const y = box!.y + Math.min(box!.height * 0.72, box!.height - 16)
    await touchSwipe(page, box!.x + box!.width - 16, y, box!.x + 12, y)

    await expect
      .poll(async () => scroller.evaluate(el => el.scrollLeft), { timeout: 3_000 })
      .toBeGreaterThan(before + 8)
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')

    const prose = await page.evaluate(() => {
      const body = document.querySelector('.conversation-content')
      if (!body) return null
      const rect = body.getBoundingClientRect()
      const y = Math.min(rect.bottom - 16, rect.top + rect.height - 28)
      for (let x = rect.right - 28; x > rect.left + 90; x -= 10) {
        const hit = document.elementFromPoint(x, y)
        if (!hit || !body.contains(hit)) continue
        let node: Element | null = hit
        let blocked = false
        while (node && node !== body.parentElement) {
          const overflowX = getComputedStyle(node).overflowX
          if (
            (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
            node.scrollWidth > node.clientWidth + 2
          ) {
            blocked = true
            break
          }
          node = node.parentElement
        }
        if (!blocked) return { x, y }
      }
      return null
    })
    expect(prose, 'a prose point that is not inside a horizontal scroller').not.toBeNull()
    await touchSwipe(page, prose!.x, prose!.y, prose!.x - 140, prose!.y + 6)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  })
})
