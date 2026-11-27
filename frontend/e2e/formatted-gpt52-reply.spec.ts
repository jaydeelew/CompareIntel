/**
 * GPT 5.2 square-root reply in the formatted tab.
 *
 * Both tests stall the renderer chunk so the reply is on screen first. On
 * master the formatted tab paints the source (`\(`, `\[`, `**`) during that
 * window, so these tests fail there. Once the chunk arrives the same reply
 * must be KaTeX and <strong>, while a comparison is still streaming and after
 * it finishes, including the tutorial results card, pager, and swipe hint.
 */
import { expect, test, type Page } from '@playwright/test'

import { GPT52_SQRT_REPLY } from '../src/testSupport/gpt52SqrtReply'
import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { buildMockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'
import {
  completeTutorialPromptInput,
  expandTutorialProvider,
  runTutorialComparison,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

const MODEL_ID = 'openai/gpt-5.2'

function mockModel(id: string, name: string, provider: string) {
  return {
    id,
    name,
    description: `${name} test model`,
    category: provider.toLowerCase(),
    provider,
    available: true,
    tier_access: 'unregistered' as const,
    supports_image_generation: false,
    supports_temperature: true,
    supports_vision: false,
  }
}

const COMPARISON_MODEL = mockModel(MODEL_ID, 'GPT 5.2', 'OpenAI')
const COMPARISON_CATALOG = {
  models: [COMPARISON_MODEL],
  models_by_provider: { OpenAI: [COMPARISON_MODEL] },
  user_tier: 'unregistered',
  is_trial_active: false,
}

const TUTORIAL_MODELS: Record<string, ReturnType<typeof mockModel>[]> = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
  OpenAI: [mockModel(MODEL_ID, 'GPT 5.2', 'OpenAI')],
}
const TUTORIAL_CATALOG = {
  models: Object.values(TUTORIAL_MODELS).flat(),
  models_by_provider: TUTORIAL_MODELS,
  user_tier: 'unregistered',
  is_trial_active: false,
}
const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(TUTORIAL_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(TUTORIAL_MODELS, TUTORIAL_MODEL_IDS)

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    project === 'Mobile Chrome - Pixel 5'
  )
}

/**
 * Stall the formatted renderer so the reply is on screen before KaTeX arrives.
 * A finite delay (not a hung request) keeps WebKit from tearing the page down.
 * On master the formatted tab paints the source during this window.
 */
async function delayRendererChunk(page: Page, ms = 8000): Promise<void> {
  await page.route(
    url => url.pathname.includes('LatexRenderer'),
    async route => {
      await new Promise(resolve => setTimeout(resolve, ms))
      await route.continue()
    }
  )
}

/** Hold the renderer chunk until `release`. A hung request from first paint crashes WebKit, so the comparison uses a finite delay instead. */
async function holdRendererChunk(page: Page): Promise<() => void> {
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route(
    url => url.pathname.includes('LatexRenderer'),
    async route => {
      await gate
      await route.continue()
    }
  )
  return release
}

async function assistantText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector('.conversation-message.assistant .message-content')
    if (!root) return ''
    const clone = root.cloneNode(true) as Element
    clone
      .querySelectorAll('.katex-mathml, annotation, script, style')
      .forEach(node => node.remove())
    return clone.textContent || ''
  })
}

function expectNoRawSource(text: string): void {
  expect(text, 'formatted view painted the reply source').not.toContain('\\(')
  expect(text).not.toContain('\\[')
  expect(text).not.toContain('**')
}

async function waitForOutputLength(page: Page, length: number): Promise<void> {
  await page.waitForFunction(expected => {
    const el = document.querySelector('.output-length')
    if (!el) return false
    const match = (el.textContent || '').replace(/,/g, '').match(/\d+/)
    return match !== null && Number(match[0]) >= expected
  }, length)
}

async function expectRenderedReply(page: Page): Promise<void> {
  const assistants = page.locator('.conversation-message.assistant .message-content')
  await expect(assistants.first().locator('.katex').first()).toBeVisible({ timeout: 20_000 })
  const count = await assistants.count()
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const assistant = assistants.nth(index)
    await expect(assistant.locator('.katex').first()).toBeVisible()
    await expect(assistant.locator('strong')).toHaveText('irrational')
    const text = await assistant.evaluate(el => {
      const clone = el.cloneNode(true) as Element
      clone.querySelectorAll('.katex-mathml, annotation, script, style').forEach(node => {
        node.remove()
      })
      return clone.textContent || ''
    })
    expectNoRawSource(text)
    await expect(assistant.locator('.raw-output')).toHaveCount(0)
  }
  await expect(page.locator('.result-card .tab-button.active').first()).toHaveText('Formatted')
}

interface PullStream {
  push(page: Page, payload: string): Promise<void>
  close(page: Page): Promise<void>
}

async function installPullStream(page: Page): Promise<PullStream> {
  await page.addInitScript(() => {
    const win = window as unknown as {
      __ciStreamOpen: boolean
      __ciPushSse: (chunk: string) => void
      __ciCloseSse: () => void
    }
    const encoder = new TextEncoder()
    const queue: Uint8Array[] = []
    const pending: Array<(value: { done: boolean; value?: Uint8Array }) => void> = []
    let closed = false
    const deliver = () => {
      while (pending.length > 0 && (queue.length > 0 || closed)) {
        const resolve = pending.shift()
        if (!resolve) return
        if (queue.length > 0) resolve({ done: false, value: queue.shift() })
        else resolve({ done: true })
      }
    }
    win.__ciStreamOpen = false
    win.__ciPushSse = (chunk: string) => {
      queue.push(encoder.encode(chunk))
      deliver()
    }
    win.__ciCloseSse = () => {
      closed = true
      deliver()
    }
    const original = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('compare-stream')) return original(input, init)
      win.__ciStreamOpen = true
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          return new Promise<void>(resolve => {
            const take = (value: { done: boolean; value?: Uint8Array }) => {
              if (value.done) controller.close()
              else if (value.value) controller.enqueue(value.value)
              resolve()
            }
            if (queue.length > 0) {
              take({ done: false, value: queue.shift() })
              return
            }
            if (closed) {
              take({ done: true })
              return
            }
            pending.push(take)
          })
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
  })
  return {
    async push(target, payload) {
      await target.evaluate(body => {
        ;(window as unknown as { __ciPushSse: (chunk: string) => void }).__ciPushSse(body)
      }, payload)
    },
    async close(target) {
      await target.evaluate(() => {
        ;(window as unknown as { __ciCloseSse: () => void }).__ciCloseSse()
      })
    },
  }
}

async function pushEvent(stream: PullStream, page: Page, event: Record<string, unknown>) {
  await stream.push(page, `data: ${JSON.stringify(event)}\n\n`)
}

test.describe('formatted GPT 5.2 math reply', () => {
  test('comparison renders math while streaming and after it finishes', async ({
    page,
  }, testInfo) => {
    test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium, Pixel 5, and iPhone 12')
    test.setTimeout(90_000)
    await delayRendererChunk(page)
    const stream = await installPullStream(page)
    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dont_show_again', 'true')
    })
    await page.route('**/api/models**', route => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COMPARISON_CATALOG),
      })
    })
    await page.route('**/api/compare-stream', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'compare-stream is mocked in the page' }),
      })
    )
    await page.route('**/*openrouter.ai/**', route => route.abort())

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const input = page.getByTestId('comparison-input-textarea')
    await expect(input).toBeVisible()
    const checkbox = page.getByTestId(`model-checkbox-${MODEL_ID}`)
    const provider = page.locator('[data-provider-name="OpenAI"] .provider-header')
    await expect(provider).toBeVisible()
    if (!(await checkbox.isVisible())) await provider.click()
    await expect(checkbox).toBeVisible()
    if (!(await checkbox.isChecked())) {
      await dismissMobileBlockers(page)
      await toggleModelCheckbox(checkbox, testInfo.project.name)
    }
    await input.fill('What is the square root of 2?')
    const done = page.getByRole('button', { name: 'Done selecting models' })
    if (await done.isVisible().catch(() => false)) await done.click()
    await dismissMobileBlockers(page)
    await page.getByTestId('comparison-submit-button').click()
    await page.waitForFunction(
      () => (window as unknown as { __ciStreamOpen?: boolean }).__ciStreamOpen === true
    )

    const mathHalf = GPT52_SQRT_REPLY.slice(0, GPT52_SQRT_REPLY.indexOf("It's"))
    await pushEvent(stream, page, { model: MODEL_ID, type: 'start' })
    await pushEvent(stream, page, { model: MODEL_ID, type: 'chunk', content: mathHalf })
    await waitForOutputLength(page, mathHalf.length)
    await expect(page.locator('.result-card .status')).toHaveText('Process')
    await expect(page.locator('.conversation-message.assistant .katex')).toHaveCount(0)
    expectNoRawSource(await assistantText(page))

    const assistant = page.locator('.conversation-message.assistant .message-content')
    await expect(assistant.locator('.katex').first()).toBeVisible({ timeout: 20_000 })
    await expect(assistant.locator('[data-streaming-render]')).toBeVisible()
    expectNoRawSource(await assistantText(page))

    await pushEvent(stream, page, {
      model: MODEL_ID,
      type: 'chunk',
      content: GPT52_SQRT_REPLY.slice(mathHalf.length),
    })
    await pushEvent(stream, page, { model: MODEL_ID, type: 'done', error: false })
    await pushEvent(stream, page, { type: 'complete', metadata: {} })
    await stream.close(page)

    await expect(page.locator('.result-card .status')).toHaveText('Success')
    await expect(assistant.locator('[data-streaming-render]')).toHaveCount(0)
    await expectRenderedReply(page)
  })

  test('tutorial results card renders the reply on the formatted tab', async ({
    page,
  }, testInfo) => {
    test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium, Pixel 5, and iPhone 12')
    test.setTimeout(180_000)
    await page.addInitScript(() => {
      localStorage.removeItem('compareintel_tutorial_completed')
      localStorage.removeItem('compareintel_tutorial_progress')
      localStorage.removeItem('compareintel_welcome_dont_show_again')
    })
    await page.route('**/api/models**', route => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TUTORIAL_CATALOG),
      })
    })
    await page.route('**/api/compare-stream', async route => {
      let models: string[] = TUTORIAL_MODEL_IDS.slice()
      try {
        const body = route.request().postDataJSON() as { models?: string[] } | null
        if (body?.models?.length) models = body.models
      } catch {
        models = TUTORIAL_MODEL_IDS.slice()
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: buildMockComparisonStream(models, GPT52_SQRT_REPLY),
      })
    })

    // Hold the chunk until the results card is up. On master that card paints
    // the reply source; this test asserts it does not, then lets the renderer in.
    const releaseRenderer = await holdRendererChunk(page)
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
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
      const prompt = 'What is the square root of 2?'
      await completeTutorialPromptInput(page, prompt, testInfo)
      await runTutorialComparison(page, testInfo, 25_000, prompt)

      await expect(page.locator('.result-card .status').first()).toHaveText('Success')
      const mobile = testInfo.project.name !== 'chromium'
      if (mobile) {
        await expect(page.getByTestId('results-tab-swipe-hint')).toBeVisible()
        await expect(page.getByTestId('results-model-pager')).toContainText('1 / 2')
      } else {
        await expect(page.locator('.result-card')).toHaveCount(2)
      }
      await expect(page.locator('.conversation-message.assistant .katex')).toHaveCount(0)
      const pending = page.locator('.conversation-message.assistant .message-content')
      const pendingCount = await pending.count()
      expect(pendingCount).toBeGreaterThan(0)
      for (let index = 0; index < pendingCount; index += 1) {
        expectNoRawSource(await pending.nth(index).innerText())
      }
      releaseRenderer()

      await expectRenderedReply(page)
      if (mobile) {
        await page.getByRole('button', { name: 'Next model' }).click()
        await expect(page.getByTestId('results-model-pager')).toContainText('2 / 2')
        await expectRenderedReply(page)
      } else {
        await expect(page.locator('.conversation-message.assistant strong')).toHaveCount(2)
        await expect(page.locator('.conversation-message.assistant .katex')).toHaveCount(6)
      }
    } finally {
      releaseRenderer()
    }
  })
})
