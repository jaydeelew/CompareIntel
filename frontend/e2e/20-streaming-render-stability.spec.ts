/**
 * Chunk-by-chunk streaming render. The SSE body is a pull stream this test
 * fills; nothing calls OpenRouter. Assertions wait on page state.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const MODEL_ID = 'openai/gpt-4o-mini'
const REFLOW_PX = 8

const MODEL = {
  id: MODEL_ID,
  name: 'GPT-4o Mini',
  description: 'Streaming render test model',
  category: 'openai',
  provider: 'OpenAI',
  available: true,
  tier_access: 'unregistered' as const,
  supports_image_generation: false,
  supports_temperature: true,
  supports_vision: false,
}

const ONE_MODEL_CATALOG = {
  models: [MODEL],
  models_by_provider: { OpenAI: [MODEL] },
  user_tier: 'unregistered',
  is_trial_active: false,
}

/** Cumulative reply after each chunk. Each entry extends the previous one. */
const FRAMES = [
  'The quadratic formula is settled.\n\n$$',
  'The quadratic formula is settled.\n\n$$\nE = mc^2',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.\n\n| Method | Result |\n| --- |',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.\n\n| Method | Result |\n| --- | --- |\n| alpha | 1 |\n\nAfter the table.',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.\n\n| Method | Result |\n| --- | --- |\n| alpha | 1 |\n\nAfter the table.\n\n\\[\n\\gamma = 1',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.\n\n| Method | Result |\n| --- | --- |\n| alpha | 1 |\n\nAfter the table.\n\n\\[\n\\gamma = 1\n\\]\n\n\\begin{align}\ny &= 2',
  'The quadratic formula is settled.\n\n$$\nE = mc^2\n$$\n\nNext sentence.\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter the fence.\n\n| Method | Result |\n| --- | --- |\n| alpha | 1 |\n\nAfter the table.\n\n\\[\n\\gamma = 1\n\\]\n\n\\begin{align}\ny &= 2\n\\end{align}\n\nFinal line.',
]

interface BlockSnap {
  key: string
  top: number
  height: number
}

async function installPullStream(page: Page): Promise<void> {
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
        if (queue.length > 0) {
          resolve({ done: false, value: queue.shift() })
        } else {
          resolve({ done: true })
        }
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
      if (!url.includes('compare-stream')) {
        return original(input, init)
      }
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
}

async function pushSse(page: Page, payload: string): Promise<void> {
  await page.evaluate(body => {
    const push = (window as unknown as { __ciPushSse: (chunk: string) => void }).__ciPushSse
    push(body)
  }, payload)
}

async function pushEvent(page: Page, event: Record<string, unknown>): Promise<void> {
  await pushSse(page, `data: ${JSON.stringify(event)}\n\n`)
}

async function waitForOutputLength(page: Page, length: number): Promise<void> {
  await page.waitForFunction(expected => {
    const el = document.querySelector('.output-length')
    if (!el) return false
    const match = (el.textContent || '').replace(/,/g, '').match(/\d+/)
    return match !== null && Number(match[0]) === expected
  }, length)
}

async function waitForSettledBlocks(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-streaming-render]')
    if (!root) return false
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-stream-block]'))
    if (blocks.some(el => el.getAttribute('data-stream-settled') !== 'true')) return false
    const signature = blocks
      .map(el => `${el.getAttribute('data-stream-block')}:${el.offsetTop}:${el.offsetHeight}`)
      .join('|')
    const win = window as unknown as { __ciStreamSig?: string; __ciStreamSigHits?: number }
    if (win.__ciStreamSig !== signature) {
      win.__ciStreamSig = signature
      win.__ciStreamSigHits = 1
      return false
    }
    win.__ciStreamSigHits = (win.__ciStreamSigHits ?? 0) + 1
    return win.__ciStreamSigHits >= 2
  })
}

async function rawDelimiterHits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.conversation-message.assistant .latex-content')
    if (!root) return ['missing latex content']
    const hits: string[] = []
    const pattern = /\$\$|\\\[|```|\|[\s:-]*-{3,}/
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const parent = (node as Text).parentElement
      if (parent && !parent.closest('.katex-mathml, annotation, script, style')) {
        const text = node.textContent || ''
        if (pattern.test(text)) hits.push(text.slice(0, 160))
      }
      node = walker.nextNode()
    }
    return hits
  })
}

async function snapshotBlocks(page: Page): Promise<BlockSnap[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-stream-block]')).map(el => ({
      key: el.getAttribute('data-stream-block') || '',
      top: el.offsetTop,
      height: el.offsetHeight,
    }))
  )
}

async function remountedBlockKey(page: Page): Promise<string> {
  return page.evaluate(() => {
    const win = window as unknown as { __ciStreamNodes?: Map<string, Element> }
    if (!win.__ciStreamNodes) win.__ciStreamNodes = new Map()
    const store = win.__ciStreamNodes
    for (const el of Array.from(document.querySelectorAll('[data-stream-block]'))) {
      const key = el.getAttribute('data-stream-block') || ''
      const previous = store.get(key)
      if (previous && previous !== el) return key
      store.set(key, el)
    }
    return ''
  })
}

test.describe('streaming render stability', () => {
  test.beforeEach(async ({ page }) => {
    await installPullStream(page)
    await page.addInitScript(() => {
      localStorage.setItem('compareintel_tutorial_completed', 'true')
      localStorage.setItem('compareintel_welcome_dont_show_again', 'true')
    })
    await page.route('**/api/models**', route => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ONE_MODEL_CATALOG),
      })
    })
    await page.route('**/*openrouter.ai/**', route => route.abort())
    await page.route('**/api/compare-stream', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'compare-stream must be mocked in the page' }),
      })
    )
  })

  test('hides raw delimiters and keeps settled blocks still', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.goto('/')
    const input = page.getByTestId('comparison-input-textarea')
    await expect(input).toBeVisible()

    const checkbox = page.getByTestId(`model-checkbox-${MODEL_ID}`)
    const provider = page.locator('[data-provider-name="OpenAI"] .provider-header')
    await expect(provider).toBeVisible()
    if (!(await checkbox.isVisible())) {
      await provider.click()
    }
    await expect(checkbox).toBeVisible()
    const boxes = page.locator('[data-testid^="model-checkbox-"]')
    const boxCount = await boxes.count()
    for (let i = 0; i < boxCount; i += 1) {
      const box = boxes.nth(i)
      const testId = await box.getAttribute('data-testid')
      const want = testId === `model-checkbox-${MODEL_ID}`
      if ((await box.isChecked()) !== want) {
        await dismissMobileBlockers(page)
        await toggleModelCheckbox(box, testInfo.project.name)
      }
    }
    await expect(checkbox).toBeChecked()
    await expect(page.locator('[data-testid^="model-checkbox-"]:checked')).toHaveCount(1)

    await input.fill('Explain the quadratic formula with math, a diagram, and a table.')
    const submit = page.getByTestId('comparison-submit-button')
    await expect(submit).toBeEnabled()
    await dismissMobileBlockers(page)
    await submit.click()

    await page.waitForFunction(
      () => (window as unknown as { __ciStreamOpen?: boolean }).__ciStreamOpen === true
    )
    await pushEvent(page, { model: MODEL_ID, type: 'start' })
    const card = page.locator('.result-card').first()
    await expect(card).toBeVisible()
    await expect(card.locator('.status')).toHaveText('Process')
    await expect(card.locator('.raw-output')).toHaveCount(0)

    let previous: BlockSnap[] = []
    for (let index = 0; index < FRAMES.length; index += 1) {
      const frame = FRAMES[index]
      const prior = index === 0 ? '' : FRAMES[index - 1]
      expect(frame.startsWith(prior)).toBe(true)
      await pushEvent(page, {
        model: MODEL_ID,
        type: 'chunk',
        content: frame.slice(prior.length),
      })
      await waitForOutputLength(page, frame.length)
      await expect(card.locator('[data-streaming-render]')).toBeVisible()
      await expect(card.locator('.raw-output')).toHaveCount(0)
      await waitForSettledBlocks(page)

      const hits = await rawDelimiterHits(page)
      expect(hits, `raw delimiters after chunk ${index}`).toEqual([])

      const text = await card.locator('[data-streaming-render]').innerText()
      if (index <= 1) {
        expect(text).toContain('The quadratic formula is settled.')
        expect(text).not.toContain('mc^2')
      }
      if (index === 2) expect(text).toContain('Next sentence.')
      if (index === 3) expect(text).not.toContain('graph TD')
      if (index === 4) {
        expect(text).toContain('graph TD')
        expect(text).toContain('After the fence.')
      }
      if (index === 5) expect(text).not.toContain('Method')
      if (index >= 6) {
        expect(text).toContain('alpha')
        expect(text).toContain('After the table.')
      }
      if (index === 7 || index === 8) expect(text).not.toContain('\\begin')
      if (index === 9) expect(text).toContain('Final line.')

      const remounted = await remountedBlockKey(page)
      expect(remounted, `block ${remounted} remounted on chunk ${index}`).toBe('')
      const blocks = await snapshotBlocks(page)
      for (const earlier of previous) {
        const next = blocks.find(block => block.key === earlier.key)
        expect(next, `block ${earlier.key} missing on chunk ${index}`).toBeTruthy()
        expect(Math.abs((next as BlockSnap).top - earlier.top)).toBeLessThanOrEqual(REFLOW_PX)
        expect(Math.abs((next as BlockSnap).height - earlier.height)).toBeLessThanOrEqual(REFLOW_PX)
      }
      previous = blocks
    }

    expect(previous.length).toBeGreaterThan(1)

    await pushEvent(page, { model: MODEL_ID, type: 'done' })
    await pushEvent(page, { type: 'complete', metadata: {} })
    await page.evaluate(() => {
      ;(window as unknown as { __ciCloseSse: () => void }).__ciCloseSse()
    })

    await expect(card.locator('.status')).toHaveText('Success')
    await expect(card.locator('[data-streaming-render]')).toHaveCount(0)
    const answer = card.locator('.conversation-message.assistant .latex-content')
    await expect(answer).toBeVisible()
    await expect(answer).toContainText('Final line.')
    await expect(answer).toContainText('After the table.')
    const finalHits = await rawDelimiterHits(page)
    expect(finalHits).toEqual([])
  })
})
