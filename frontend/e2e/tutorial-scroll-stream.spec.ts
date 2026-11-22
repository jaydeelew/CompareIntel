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

async function reachPromptStep(page: Page, testInfo: TestInfo): Promise<void> {
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
    timeout: 20_000,
  })
}

/** Drip compare-stream so the results panel is still growing while the test looks. */
async function installSlowComparisonStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (!url.includes('compare-stream')) return original(input, init)
      let models: string[] = []
      try {
        models = JSON.parse(String(init?.body ?? '{}')).models ?? []
      } catch {
        models = []
      }
      const events: object[] = []
      for (const model of models) {
        events.push({ model, type: 'start' })
        for (let i = 0; i < 28; i++) {
          events.push({
            model,
            type: 'chunk',
            content: `streaming-token-${i} keeps the results panel growing. `,
          })
        }
        events.push({ model, type: 'done', error: false })
      }
      events.push({
        type: 'complete',
        metadata: {
          input_length: 12,
          models_requested: models.length,
          models_successful: models.length,
          models_failed: 0,
          timestamp: new Date().toISOString(),
          processing_time_ms: 4000,
        },
      })
      const encoder = new TextEncoder()
      let index = 0
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = window.setInterval(() => {
            if (index >= events.length) {
              window.clearInterval(timer)
              controller.close()
              return
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[index])}\n\n`))
            index += 1
          }, 90)
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
  })
}

interface FrameSample {
  ok: boolean
  reason: string
  height: number
  text: number
  glow: boolean
}

async function readResultsFrame(page: Page): Promise<FrameSample> {
  return page.evaluate(() => {
    const results = document.querySelector('.results-section') as HTMLElement | null
    if (!results) return { ok: false, reason: 'no-results', height: 0, text: 0, glow: false }
    const rect = results.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) {
      return { ok: false, reason: 'empty-results', height: rect.height, text: 0, glow: false }
    }
    const glow =
      results.classList.contains('tutorial-highlight') ||
      results.classList.contains('mobile-tutorial-highlight')
    const cutouts = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.tutorial-backdrop-cutout, .mobile-tutorial-backdrop-cutout'
      )
    )
    const framed = cutouts.some(cutout => {
      const box = cutout.getBoundingClientRect()
      const style = getComputedStyle(cutout)
      const visible = style.opacity !== '0' && style.visibility !== 'hidden' && box.height > 2
      return (
        visible &&
        Math.abs(box.top - (rect.top - 8)) < 24 &&
        Math.abs(box.left - (rect.left - 8)) < 24 &&
        Math.abs(box.height - (rect.height + 16)) < 36 &&
        box.width > rect.width * 0.5
      )
    })
    return {
      ok: framed,
      reason: framed ? 'framed' : `cutouts=${cutouts.length}`,
      height: rect.height,
      text: results.innerText.length,
      glow,
    }
  })
}

test.describe('tutorial scroll-back and streaming highlight', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !projectAllowed(testInfo.project.name),
      'desktop Chromium, Mobile Safari, and Pixel 5'
    )
    if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
      await page.setViewportSize({ width: 393, height: 851 })
    } else if (!isMobileE2eProject(testInfo.project.name)) {
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  })

  test('step 5 shows the scroll-back hint only while the prompt is off screen', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await reachPromptStep(page, testInfo)

    const size = page.viewportSize()
    expect(size).not.toBeNull()
    await page.setViewportSize({ width: size!.width, height: Math.min(size!.height, 520) })
    await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
      timeout: 8_000,
    })
    const hint = page.locator('.mobile-tutorial-scroll-indicator')
    await expect(hint).toHaveCount(0)
    // A viewport change re-seats the spotlight. Wait until that scroll has stopped
    // so the later scroll is the user's, not the tutorial's.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Math.round(document.querySelector('.composer')?.getBoundingClientRect().top ?? -1)
          ),
        { timeout: 5_000 }
      )
      .toBeGreaterThan(0)
    await page.waitForTimeout(400)

    const scrolled = await page.evaluate(() => {
      const composer = document.querySelector('.composer') as HTMLElement | null
      if (!composer) return 'no-composer'
      const app = document.querySelector('.app') as HTMLElement | null
      const scroller =
        app && app.scrollHeight > app.clientHeight + 1
          ? app
          : (document.scrollingElement as HTMLElement | null)
      if (!scroller) return 'no-scroller'
      const tip = document.querySelector(
        '.mobile-tutorial-tooltip, .tutorial-tooltip'
      ) as HTMLElement | null
      const before = scroller.scrollTop
      const tipHeight =
        tip && tip.getBoundingClientRect().height > 1 ? tip.getBoundingClientRect().height : 220
      // The card can sit below the composer. Scroll far enough that it leaves
      // with the composer, instead of hanging back into the viewport.
      scroller.scrollTop = before + composer.getBoundingClientRect().bottom + tipHeight + 48
      return `${before}->${scroller.scrollTop}`
    })
    expect(scrolled).toMatch(/->(?!0(?:\s|$))\d+/)
    await expect(hint).toContainText('Scroll back to continue', { timeout: 8_000 })
    await expect(tutorialTooltip(page)).toHaveCount(0)

    await page.evaluate(() => {
      const app = document.querySelector('.app') as HTMLElement | null
      const scroller =
        app && app.scrollHeight > app.clientHeight + 1
          ? app
          : (document.scrollingElement as HTMLElement | null)
      if (scroller) scroller.scrollTop = 0
      document.querySelector('.composer')?.scrollIntoView({ block: 'center' })
    })

    await expect(hint).toHaveCount(0, { timeout: 8_000 })
    await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
      timeout: 8_000,
    })
  })

  test('results stay framed from submit through streaming until the follow-up step', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await installSlowComparisonStream(page)
    await reachPromptStep(page, testInfo)
    await completeTutorialPromptInput(page, 'Sqrt 3?', testInfo)
    await expect(tutorialTooltip(page).first()).toContainText('Run Your Comparison', {
      timeout: 20_000,
    })

    const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
    await expect(submit).toBeEnabled({ timeout: 20_000 })
    if (isMobileE2eProject(testInfo.project.name)) {
      await submit.tap({ force: true }).catch(() => submit.click({ force: true }))
    } else {
      await submit.click({ force: true })
    }

    let grew = false
    let sawGlow = false
    let previousHeight = 0
    await expect
      .poll(
        async () => {
          const sample = await readResultsFrame(page)
          if (sample.ok && sample.glow) sawGlow = true
          if (sample.ok && previousHeight > 40 && sample.height > previousHeight + 8) grew = true
          if (sample.height > 2) previousHeight = sample.height
          if (!sample.ok) return sample.reason
          if (!sample.glow) return 'no-glow'
          if (!grew) return `waiting-for-growth ${Math.round(sample.height)} text=${sample.text}`
          return 'framed'
        },
        { timeout: 20_000, intervals: [100] }
      )
      .toBe('framed')
    expect(sawGlow).toBe(true)

    await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
      timeout: 25_000,
    })
    await expect.poll(async () => (await readResultsFrame(page)).ok, { timeout: 8_000 }).toBe(true)
  })
})
