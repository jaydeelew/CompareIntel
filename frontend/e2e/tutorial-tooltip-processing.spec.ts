import fs from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'
import sharp from 'sharp'

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

/** Hold compare-stream on the processing panel until the test releases it. */
async function installHeldComparisonStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as Window & { __tutorialStreamPhase?: 'hold' | 'first' | 'rest' }
    win.__tutorialStreamPhase = 'hold'
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
      const encoder = new TextEncoder()
      const starts = models.map(model => ({ model, type: 'start' }))
      const firstChunks = models.map(model => ({
        model,
        type: 'chunk',
        content: 'streaming-token-0 ',
      }))
      const rest = [
        ...models.flatMap(model => [
          { model, type: 'chunk', content: 'streaming-token-1 keeps going. ' },
          { model, type: 'done', error: false },
        ]),
        {
          type: 'complete',
          metadata: {
            input_length: 12,
            models_requested: models.length,
            models_successful: models.length,
            models_failed: 0,
            timestamp: new Date().toISOString(),
            processing_time_ms: 4000,
          },
        },
      ]
      const send = (controller: ReadableStreamDefaultController<Uint8Array>, events: object[]) => {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      }
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const startedAt = Date.now()
          const waitFor = async (phase: 'first' | 'rest') => {
            while (win.__tutorialStreamPhase !== phase && Date.now() - startedAt < 20000) {
              await new Promise(resolve => window.setTimeout(resolve, 40))
            }
          }
          await waitFor('first')
          send(controller, starts)
          await new Promise(resolve => window.setTimeout(resolve, 80))
          send(controller, firstChunks)
          await waitFor('rest')
          send(controller, rest)
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
  })
}

async function setStreamPhase(page: Page, phase: 'hold' | 'first' | 'rest'): Promise<void> {
  await page.evaluate(next => {
    ;(window as Window & { __tutorialStreamPhase?: string }).__tutorialStreamPhase = next
  }, phase)
}

/**
 * Where the visible tooltip's arrow lands.
 * `results` means the tip meets the results panel and the card does not cover it.
 * `hidden` means no card is on screen.
 */
async function tooltipAim(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tips = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
    )
    const tip = tips.find(node => {
      const box = node.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) return false
      const style = getComputedStyle(node)
      return style.visibility !== 'hidden' && Number(style.opacity) > 0.05
    })
    if (!tip) return 'hidden'
    if (
      tip.classList.contains('tutorial-tooltip--unanchored') ||
      tip.classList.contains('mobile-tutorial-tooltip--unanchored')
    ) {
      return 'unanchored'
    }
    const composer =
      document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) || document.querySelector('.composer:not(.composer-placeholder)')
    const results = document.querySelector('.results-section')
    if (!(composer instanceof HTMLElement)) return 'no-composer'
    const composerBox = composer.getBoundingClientRect()
    const arrow = tip.querySelector<HTMLElement>('.mobile-tutorial-arrow')
    let tipX = 0
    let tipY = 0
    if (arrow) {
      const arrowBox = arrow.getBoundingClientRect()
      tipX = arrowBox.left + arrowBox.width / 2
      const direction = Array.from(arrow.classList).find(name =>
        name.startsWith('mobile-tutorial-arrow-')
      )
      tipY = direction?.endsWith('up') ? arrowBox.top : arrowBox.bottom
      if (direction?.endsWith('left')) {
        tipX = arrowBox.left
        tipY = arrowBox.top + arrowBox.height / 2
      } else if (direction?.endsWith('right')) {
        tipX = arrowBox.right
        tipY = arrowBox.top + arrowBox.height / 2
      }
    } else {
      const box = tip.getBoundingClientRect()
      const above = tip.classList.contains('tutorial-tooltip-top')
      tipX = box.left + box.width / 2
      tipY = above ? box.bottom : box.top
    }
    if (results instanceof HTMLElement) {
      const resultsBox = results.getBoundingClientRect()
      const card = tip.getBoundingClientRect()
      const overlapW = Math.min(card.right, resultsBox.right) - Math.max(card.left, resultsBox.left)
      const overlapH = Math.min(card.bottom, resultsBox.bottom) - Math.max(card.top, resultsBox.top)
      if (overlapW > 1 && overlapH > 1) return 'on-results'
      const withinX = tipX >= resultsBox.left - 48 && tipX <= resultsBox.right + 48
      const gapAbove = resultsBox.top - card.bottom
      const gapBelow = card.top - resultsBox.bottom
      const beside = (gapAbove >= -1 && gapAbove <= 40) || (gapBelow >= -1 && gapBelow <= 40)
      if (beside && withinX) return 'results'
    }
    const onComposer =
      tipX >= composerBox.left - 48 &&
      tipX <= composerBox.right + 48 &&
      tipY >= composerBox.top - 56 &&
      tipY <= composerBox.bottom + 56
    return onComposer ? 'composer' : `off-composer ${Math.round(tipX)},${Math.round(tipY)}`
  })
}

/**
 * The composer is a real hole in the dim, with its highlight ring, whenever
 * the tooltip is aimed at it. A results-only box-shadow leaves the field gray.
 */
async function composerCutout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const composer =
      document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) || document.querySelector('.composer:not(.composer-placeholder)')
    if (!(composer instanceof HTMLElement)) return 'no-composer'
    const box = composer.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return 'no-composer'
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const highlighted =
      composer.classList.contains('tutorial-highlight') ||
      composer.classList.contains('mobile-tutorial-highlight')
    const rings = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.tutorial-backdrop-follow-up-composer-ring, .mobile-tutorial-backdrop-follow-up-composer-ring'
      )
    )
    const insideRing = rings.some(ring => {
      const ringBox = ring.getBoundingClientRect()
      return (
        cx >= ringBox.left + 2 &&
        cx <= ringBox.right - 2 &&
        cy >= ringBox.top + 2 &&
        cy <= ringBox.bottom - 2
      )
    })
    return highlighted && insideRing ? 'cutout' : 'dimmed'
  })
}

/** The page footer stays in normal flow. A fixed or sticky footer covers the tooltip. */
async function footerFlowsWithPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Footer navigation"]')
    const footer = nav?.closest('footer')
    if (!(footer instanceof HTMLElement)) return 'missing'
    const pos = getComputedStyle(footer).position
    if (pos === 'fixed' || pos === 'sticky') return pos
    const veil = getComputedStyle(footer, '::after')
    if (veil.content !== 'none' && veil.content !== 'normal' && veil.position === 'absolute') {
      return 'veil'
    }
    return 'flow'
  })
}

/**
 * The footer is covered by the same follow-up dim as the page around it.
 * A light footer panel fails this even when a veil is absent.
 */
async function footerDimMatchesPage(page: Page): Promise<string> {
  const sample = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Footer navigation"]')
    const footer = nav?.closest('footer')
    const svg = document.querySelector('svg.tutorial-scroll-dim')
    if (!(footer instanceof HTMLElement)) return { status: 'missing-footer' as const }
    if (!(svg instanceof SVGSVGElement)) {
      const rings = document.querySelectorAll('.tutorial-backdrop-follow-up-composer-ring').length
      const svgs = document.querySelectorAll('svg.tutorial-scroll-dim').length
      return { status: `missing-svg:rings${rings}:svgs${svgs}` as const }
    }
    const foot = footer.getBoundingClientRect()
    const dim = svg.getBoundingClientRect()
    if (foot.height < 2 || dim.width < 2 || dim.height < 2) {
      return {
        status: `missing-size:${Math.round(dim.width)}x${Math.round(dim.height)}` as const,
      }
    }
    const covers =
      dim.left <= foot.left + 1 &&
      dim.right >= foot.right - 1 &&
      dim.top <= foot.top + 1 &&
      dim.bottom >= foot.bottom - 1
    if (!covers) {
      const r = (b: DOMRect) =>
        `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`
      return { status: `uncovered:dim${r(dim)}:foot${r(foot)}` as const }
    }
    const tips = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
    ).map(el => el.getBoundingClientRect())
    const inTip = (x: number, y: number) =>
      tips.some(
        box => x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2
      )
    const aboveY = foot.top - 6
    const footerY = Math.min(foot.top + 10, foot.bottom - 4)
    const candidates = [8, 14, window.innerWidth - 14, window.innerWidth - 8]
    const x = candidates.find(
      px => px > 1 && px < window.innerWidth - 1 && !inTip(px, aboveY) && !inTip(px, footerY)
    )
    if (x == null) return { status: 'blocked' as const }
    return {
      status: 'ready' as const,
      x: x + window.scrollX,
      aboveY: aboveY + window.scrollY,
      footerY: footerY + window.scrollY,
    }
  })
  if (sample.status !== 'ready') return sample.status
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1)
  const buf = await page.screenshot({ type: 'png', fullPage: true })
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixel = (x: number, y: number) => {
    const px = Math.min(info.width - 1, Math.max(0, Math.round(x * dpr)))
    const py = Math.min(info.height - 1, Math.max(0, Math.round(y * dpr)))
    const i = (py * info.width + px) * info.channels
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
  }
  const above = pixel(sample.x, sample.aboveY)
  const onFooter = pixel(sample.x, sample.footerY)
  const delta = Math.max(
    Math.abs(above[0] - onFooter[0]),
    Math.abs(above[1] - onFooter[1]),
    Math.abs(above[2] - onFooter[2])
  )
  return delta <= 22 ? 'match' : `mismatch:${delta}`
}

/**
 * The composer tooltip is fully inside the visual viewport and finishes above
 * the footer. `covered` means the footer overlaps the card.
 */
async function tooltipFullyAboveFooter(page: Page): Promise<string> {
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
    const nav = document.querySelector('nav[aria-label="Footer navigation"]')
    const footer = nav?.closest('footer')
    if (!tip || !(footer instanceof HTMLElement)) return 'missing'
    const card = tip.getBoundingClientRect()
    const viewTop = window.visualViewport?.offsetTop ?? 0
    const viewBottom = viewTop + (window.visualViewport?.height ?? window.innerHeight)
    if (card.top < viewTop - 1 || card.left < -1 || card.right > window.innerWidth + 1) {
      return 'offscreen'
    }
    if (card.bottom > viewBottom + 1) return 'offscreen'
    const foot = footer.getBoundingClientRect()
    const overlapW = Math.min(card.right, foot.right) - Math.max(card.left, foot.left)
    const overlapH = Math.min(card.bottom, foot.bottom) - Math.max(card.top, foot.top)
    if (overlapW > 1 && overlapH > 1) return 'covered'
    return 'clear'
  })
}

/** User prompts on screen. The tour sends the original prompt plus one follow-up. */
async function userPromptCount(page: Page): Promise<string> {
  return page.evaluate(() => {
    const title =
      document.querySelector('.tutorial-tooltip, .mobile-tutorial-tooltip')?.textContent ?? ''
    if (/Enter a Follow-Up|Submit Your Follow-Up/.test(title)) return 'extra-step'
    const counts = Array.from(document.querySelectorAll('.result-card.conversation-card')).map(
      card => card.querySelectorAll('.conversation-message.user').length
    )
    if (counts.length === 0) return '0'
    return String(Math.max(...counts))
  })
}

/**
 * The card must not cover the results. On step 8 it also must not cover the
 * highlighted follow-up composer or any other highlighted element.
 */
async function tooltipClearsResults(page: Page): Promise<string> {
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
    const results = document.querySelector('.results-section')
    if (!tip || !(results instanceof HTMLElement)) return 'missing'
    const a = tip.getBoundingClientRect()
    const overlaps = (box: DOMRect | undefined) => {
      if (!box || box.width < 2 || box.height < 2) return false
      const overlapW = Math.min(a.right, box.right) - Math.max(a.left, box.left)
      const overlapH = Math.min(a.bottom, box.bottom) - Math.max(a.top, box.top)
      return overlapW > 1 && overlapH > 1
    }
    if (overlaps(results.getBoundingClientRect())) return 'overlaps-results'
    const review = /Review the New Responses/.test(tip.textContent ?? '')
    if (!review) return 'clear'
    const composer = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    if (composer instanceof HTMLElement && overlaps(composer.getBoundingClientRect())) {
      return 'overlaps-composer'
    }
    const highlighted = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-highlight, .mobile-tutorial-highlight')
    )
    for (const el of highlighted) {
      if (el === results || results.contains(el)) continue
      if (overlaps(el.getBoundingClientRect())) return 'overlaps-highlight'
    }
    return 'clear'
  })
}

/** No tutorial card is on screen. `framed` means the processing panel owns the highlight. */
async function tooltipHiddenDuringProcessing(page: Page): Promise<string> {
  return page.evaluate(() => {
    const panel = document.querySelector('.loading-section')
    if (!panel) return 'no-panel'
    const panelBox = panel.getBoundingClientRect()
    if (panelBox.height < 20 || !/Processing/.test(panel.textContent ?? '')) return 'not-processing'
    const highlighted =
      panel.classList.contains('tutorial-highlight') ||
      panel.classList.contains('mobile-tutorial-highlight')
    const visible = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
    ).some(tip => {
      const box = tip.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) return false
      const style = getComputedStyle(tip)
      return style.visibility !== 'hidden' && Number(style.opacity) > 0.05
    })
    if (visible) return 'tooltip-visible'
    return highlighted ? 'hidden-framed' : 'hidden-open'
  })
}

async function submitComparison(page: Page, testInfo: TestInfo): Promise<void> {
  const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
  await expect(submit).toBeEnabled({ timeout: 20_000 })
  if (isMobileE2eProject(testInfo.project.name)) {
    await submit.tap({ force: true }).catch(() => submit.click({ force: true }))
  } else {
    await submit.click({ force: true })
  }
}

test.describe('tutorial tooltip stays hidden while models are working', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!projectAllowed(testInfo.project.name), 'desktop, iPhone, and Pixel')
    if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
      await page.setViewportSize({ width: 360, height: 800 })
    } else if (!isMobileE2eProject(testInfo.project.name)) {
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  })

  test('hides the tooltip during processing and shows it on the composer', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    const folder = testInfo.project.name.includes('iPhone')
      ? 'iphone'
      : testInfo.project.name.includes('Pixel')
        ? 'pixel'
        : 'desktop'
    const shotDir = `/opt/cursor/artifacts/tutorial-tooltip-processing/${folder}`
    fs.mkdirSync(shotDir, { recursive: true })

    await installHeldComparisonStream(page)
    await reachPromptStep(page, testInfo)
    await completeTutorialPromptInput(page, 'Sqrt 3?', testInfo)
    await expect(tutorialTooltip(page).first()).toContainText('Run Your Comparison', {
      timeout: 20_000,
    })
    await submitComparison(page, testInfo)

    await expect
      .poll(() => tooltipHiddenDuringProcessing(page), { timeout: 20_000, intervals: [100] })
      .toBe('hidden-framed')
    await dismissMobileBlockers(page)
    await page.screenshot({ path: `${shotDir}/first-processing.png` })

    await setStreamPhase(page, 'first')
    await expect
      .poll(async () => {
        const duringStream = await page.evaluate(() => {
          const tips = Array.from(
            document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
          )
          const visible = tips.some(tip => {
            const box = tip.getBoundingClientRect()
            if (box.width < 2 || box.height < 2) return false
            const style = getComputedStyle(tip)
            return style.visibility !== 'hidden' && Number(style.opacity) > 0.05
          })
          return visible ? 'visible' : 'hidden'
        })
        return duringStream
      })
      .toBe('hidden')
    await page.screenshot({ path: `${shotDir}/first-streaming.png` })
    await setStreamPhase(page, 'rest')

    const composerTip = tutorialTooltip(page).first()
    await expect(composerTip).toContainText('Continue the Conversation', {
      timeout: 25_000,
    })
    await expect
      .poll(() => tooltipAim(page), { timeout: 10_000, intervals: [100] })
      .toBe('composer')
    await expect
      .poll(() => composerCutout(page), { timeout: 10_000, intervals: [100] })
      .toBe('cutout')
    await expect
      .poll(() => tooltipClearsResults(page), { timeout: 10_000, intervals: [100] })
      .toBe('clear')
    await dismissMobileBlockers(page)
    await expect
      .poll(() => tooltipFullyAboveFooter(page), { timeout: 8_000, intervals: [100] })
      .toBe('clear')
    await expect
      .poll(() => footerFlowsWithPage(page), { timeout: 5_000, intervals: [100] })
      .toBe('flow')
    await expect.poll(() => userPromptCount(page), { timeout: 5_000, intervals: [100] }).toBe('1')
    await expect
      .poll(() => footerDimMatchesPage(page), { timeout: 12_000, intervals: [150] })
      .toBe('match')
    await expect
      .poll(() => tooltipClearsResults(page), { timeout: 5_000, intervals: [100] })
      .toBe('clear')
    await page.screenshot({ path: `${shotDir}/composer-tooltip.png` })

    await setStreamPhase(page, 'hold')
    const followUp = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
    await followUp.fill('Follow-up while the models are processing')
    await submitComparison(page, testInfo)

    await expect
      .poll(() => tooltipHiddenDuringProcessing(page), { timeout: 20_000, intervals: [100] })
      .toBe('hidden-framed')
    await dismissMobileBlockers(page)
    await page.screenshot({ path: `${shotDir}/follow-up-processing.png` })

    await setStreamPhase(page, 'first')
    await expect.poll(() => tooltipAim(page), { timeout: 15_000, intervals: [100] }).toBe('hidden')
    await page.screenshot({ path: `${shotDir}/follow-up-streaming.png` })
    await setStreamPhase(page, 'rest')

    const followUpTip = tutorialTooltip(page).first()
    await expect(followUpTip).toBeVisible({ timeout: 25_000 })
    await expect.poll(() => tooltipAim(page), { timeout: 15_000, intervals: [100] }).toBe('results')
    await expect
      .poll(() => composerCutout(page), { timeout: 10_000, intervals: [100] })
      .toBe('cutout')
    await expect
      .poll(() => tooltipClearsResults(page), { timeout: 10_000, intervals: [100] })
      .toBe('clear')
    await dismissMobileBlockers(page)
    await expect
      .poll(() => tooltipFullyAboveFooter(page), { timeout: 8_000, intervals: [100] })
      .toBe('clear')
    await expect
      .poll(() => footerFlowsWithPage(page), { timeout: 5_000, intervals: [100] })
      .toBe('flow')
    await expect.poll(() => userPromptCount(page), { timeout: 5_000, intervals: [100] }).toBe('2')
    await expect
      .poll(() => footerDimMatchesPage(page), { timeout: 12_000, intervals: [150] })
      .toBe('match')
    await expect
      .poll(() => tooltipClearsResults(page), { timeout: 5_000, intervals: [100] })
      .toBe('clear')
    await page.screenshot({ path: `${shotDir}/follow-up-composer.png` })
  })
})
