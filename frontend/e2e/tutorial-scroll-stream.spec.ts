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

async function continueTooltipDuringProcessing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const loading = document.querySelector('.loading-section')
    if (!loading) return false
    const text = loading.textContent ?? ''
    if (!text.includes('Processing')) return false
    const tips = Array.from(
      document.querySelectorAll('.tutorial-tooltip, .mobile-tutorial-tooltip')
    )
    return tips.some(tip => {
      const style = getComputedStyle(tip)
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      return (tip.textContent ?? '').includes('Continue the Conversation')
    })
  })
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

    let sawGlow = false
    let firstFramedHeight = 0
    let grew = false
    const requireGrowth = testInfo.project.name !== 'Mobile Safari - iPhone 12'
    await expect
      .poll(
        async () => {
          const sample = await readResultsFrame(page)
          if (!sample.ok) return sample.reason
          if (!sample.glow) return 'no-glow'
          sawGlow = true
          if (firstFramedHeight === 0) firstFramedHeight = sample.height
          if (sample.height > firstFramedHeight + 8) grew = true
          // WebKit can deliver the whole stream in one paint, so the framed
          // section is already at its final height. Chromium still waits
          // until that framed box has grown.
          if (requireGrowth && !grew) {
            return `waiting-for-growth ${Math.round(sample.height)} text=${sample.text}`
          }
          if (await continueTooltipDuringProcessing(page)) return 'tooltip-during-processing'
          return 'framed'
        },
        { timeout: 20_000, intervals: [100] }
      )
      .toBe('framed')
    expect(sawGlow).toBe(true)

    await expect
      .poll(
        async () => {
          if (await continueTooltipDuringProcessing(page)) return 'tooltip-during-processing'
          const loadingCount = await page.locator('.loading-section').count()
          return loadingCount === 0 ? 'done' : 'loading'
        },
        { timeout: 25_000, intervals: [100] }
      )
      .toBe('done')
    await expect(
      page.locator('[data-after-results-composer-slot] .composer:not(.composer-placeholder)')
    ).toBeVisible({ timeout: 15_000 })
    await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
      timeout: 25_000,
    })
    await expect.poll(async () => (await readResultsFrame(page)).ok, { timeout: 8_000 }).toBe(true)
  })

  test('expand OpenAI keeps the model selected earlier in the blue rail', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
    await dismissMobileBlockers(page)

    const first = TUTORIAL_PROVIDERS[0]!
    const second = TUTORIAL_PROVIDERS[1]!
    const firstId = TUTORIAL_MODEL_IDS[0]!
    const firstName = MOCK_MODELS[first]?.find(model => model.id === firstId)?.name
    expect(firstName).toBeTruthy()

    await expandTutorialProvider(page, first, testInfo)
    await selectTutorialModelCheckbox(page, firstId, first, testInfo)
    await expect(tutorialTooltip(page).first()).toContainText(`Expand ${second}`, {
      timeout: 20_000,
    })

    const rail = page.locator('.selected-model-card .model-name-text')
    await expect(rail).toHaveCount(1)
    await expect(rail).toHaveText(firstName!)
    await expect(page.locator('.models-count-indicator')).toContainText(/1 of \d+ selected/)
    if (isMobileE2eProject(testInfo.project.name)) {
      await expect(page.locator(`.provider-dropdown[data-provider-name="${first}"]`)).toHaveCount(0)
      await expect(page.locator(`.provider-dropdown[data-provider-name="${second}"]`)).toHaveCount(
        1
      )
    } else {
      await expect(page.locator(`.provider-dropdown[data-provider-name="${first}"]`)).toHaveCount(1)
      await expect(page.locator(`.provider-dropdown[data-provider-name="${second}"]`)).toHaveCount(
        1
      )
      await expect(page.locator('.provider-dropdown')).toHaveCount(Object.keys(MOCK_MODELS).length)
    }
  })

  test('desktop provider steps keep every provider and scroll back to the highlight', async ({
    page,
  }, testInfo) => {
    test.skip(isMobileE2eProject(testInfo.project.name), 'desktop provider list')
    test.setTimeout(90_000)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
    await dismissMobileBlockers(page)

    await expect(page.locator('.provider-dropdown')).toHaveCount(Object.keys(MOCK_MODELS).length)
    const highlighted = page.locator('.provider-dropdown.tutorial-highlight')
    await expect(highlighted).toHaveCount(1)
    await expect(highlighted).toHaveAttribute('data-provider-name', TUTORIAL_PROVIDERS[0]!)

    const hint = page.locator('.mobile-tutorial-scroll-indicator')
    await expect(hint).toHaveCount(0)
    const size = page.viewportSize()
    expect(size).not.toBeNull()
    await page.setViewportSize({ width: size!.width, height: 640 })
    await expect(tutorialTooltip(page).first()).toContainText('Expand', { timeout: 8_000 })
    await page.waitForTimeout(400)
    const scrolled = await page.evaluate(() => {
      const target = document.querySelector(
        '.provider-dropdown.tutorial-highlight'
      ) as HTMLElement | null
      const app = document.querySelector('.app') as HTMLElement | null
      const scroller =
        app && app.scrollHeight > app.clientHeight + 1
          ? app
          : (document.scrollingElement as HTMLElement | null)
      if (!target || !scroller) return 'missing'
      scroller.scrollTop = scroller.scrollHeight
      const rect = target.getBoundingClientRect()
      return `top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} scroll=${Math.round(scroller.scrollTop)}/${Math.round(scroller.scrollHeight - scroller.clientHeight)}`
    })
    expect(scrolled).toMatch(/bottom=-[1-9]/)
    await expect(hint).toContainText('Scroll back to continue', { timeout: 8_000 })
    await expect(hint).toHaveClass(/scroll-up/)
    await expect(tutorialTooltip(page)).toHaveCount(0)

    await hint.click({ force: true })
    await expect(tutorialTooltip(page).first()).toContainText('Expand', { timeout: 8_000 })
    await expect(hint).toHaveCount(0)
  })

  test('follow-up tooltip follows the composer and asks to scroll down when it leaves', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await mockComparisonStream(page)
    await reachPromptStep(page, testInfo)
    await completeTutorialPromptInput(page, 'Hello from the follow-up scroll test.', testInfo)
    await runTutorialComparison(page, testInfo, 25_000, 'Hello from the follow-up scroll test.')
    await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
      timeout: 25_000,
    })

    const hint = page.locator('.mobile-tutorial-scroll-indicator')
    await expect(hint).toHaveCount(0)
    await page.evaluate(() => {
      document
        .querySelector('[data-after-results-composer-slot] .composer:not(.composer-placeholder)')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
      timeout: 8_000,
    })
    await expect(hint).toHaveCount(0)

    let previous = ''
    await expect
      .poll(
        async () => {
          const sample = await page.evaluate(() => {
            const app = document.querySelector('.app') as HTMLElement | null
            const scroller =
              app && app.scrollHeight > app.clientHeight + 1
                ? app
                : (document.scrollingElement as HTMLElement | null)
            const composer = document.querySelector(
              '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
            )
            const tip = document.querySelector('.mobile-tutorial-tooltip, .tutorial-tooltip')
            const hidden =
              tip?.classList.contains('mobile-tutorial-tooltip--transitioning') ||
              tip?.classList.contains('tutorial-tooltip--settling')
            return [
              Math.round(scroller?.scrollTop ?? -1),
              Math.round(composer?.getBoundingClientRect().top ?? -1),
              hidden ? 0 : 1,
            ].join(':')
          })
          const stable = sample === previous && sample.endsWith(':1')
          previous = sample
          return stable ? 'stable' : sample
        },
        { timeout: 15_000, intervals: [400] }
      )
      .toBe('stable')

    const nudged = await page.evaluate(() => {
      const app = document.querySelector('.app') as HTMLElement | null
      const scroller =
        app && app.scrollHeight > app.clientHeight + 1
          ? app
          : (document.scrollingElement as HTMLElement | null)
      const composer = document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) as HTMLElement | null
      const tip = document.querySelector(
        '.mobile-tutorial-tooltip, .tutorial-tooltip'
      ) as HTMLElement | null
      const ring = document.querySelector(
        '.tutorial-backdrop-follow-up-composer-ring, .mobile-tutorial-backdrop-follow-up-composer-ring'
      ) as HTMLElement | null
      if (!scroller || !composer || !tip) return null
      const before = {
        scrollTop: scroller.scrollTop,
        composer: composer.getBoundingClientRect().top,
        tip: tip.getBoundingClientRect().top,
        ring: ring?.getBoundingClientRect().top ?? null,
      }
      const nudge = Math.min(80, Math.max(0, scroller.scrollTop - 8))
      scroller.scrollTop = before.scrollTop - nudge
      return { ...before, nudge }
    })
    expect(nudged).not.toBeNull()
    expect(nudged!.nudge).toBeGreaterThan(40)

    await expect
      .poll(
        async () =>
          page.evaluate(start => {
            const composer = document.querySelector(
              '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
            )
            const tip = document.querySelector('.mobile-tutorial-tooltip, .tutorial-tooltip')
            const ring = document.querySelector(
              '.tutorial-backdrop-follow-up-composer-ring, .mobile-tutorial-backdrop-follow-up-composer-ring'
            )
            if (!composer || !tip || !ring || start.ring == null) return 'missing'
            const composerDy = composer.getBoundingClientRect().top - start.composer
            const tipDy = tip.getBoundingClientRect().top - start.tip
            const ringDy = ring.getBoundingClientRect().top - start.ring
            if (Math.abs(composerDy - start.nudge) > 12) return `composer ${Math.round(composerDy)}`
            if (Math.abs(tipDy - composerDy) > 16) return `tip ${Math.round(tipDy)}`
            if (Math.abs(ringDy - composerDy) > 20) return `ring ${Math.round(ringDy)}`
            return 'followed'
          }, nudged),
        { timeout: 4_000, intervals: [50] }
      )
      .toBe('followed')
    await expect(hint).toHaveCount(0)

    const pushed = await page.evaluate(() => {
      const app = document.querySelector('.app') as HTMLElement | null
      const scroller =
        app && app.scrollHeight > app.clientHeight + 1
          ? app
          : (document.scrollingElement as HTMLElement | null)
      const composer = document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) as HTMLElement | null
      if (!scroller || !composer) return { direction: 'missing', moved: 0 }
      const before = scroller.scrollTop
      const rect = composer.getBoundingClientRect()
      const below = rect.top - window.innerHeight - 24
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      scroller.scrollTop = Math.max(0, Math.min(before + below, max))
      const after = composer.getBoundingClientRect()
      return {
        direction: after.top >= window.innerHeight - 1 ? 'down' : 'visible',
        moved: Math.round(scroller.scrollTop - before),
        top: Math.round(after.top),
        scrollTop: Math.round(scroller.scrollTop),
      }
    })
    expect(pushed.direction, JSON.stringify(pushed)).toBe('down')
    expect(Math.abs(pushed.moved)).toBeGreaterThan(24)

    await expect(hint).toContainText('Scroll back to continue', { timeout: 8_000 })
    await expect(hint).toHaveClass(/scroll-down/)
    await expect(tutorialTooltip(page)).toHaveCount(0)

    await page.evaluate(() => {
      document
        .querySelector('[data-after-results-composer-slot] .composer:not(.composer-placeholder)')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await expect(hint).toHaveCount(0, { timeout: 8_000 })
    await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
      timeout: 8_000,
    })
  })
})
