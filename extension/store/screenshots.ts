import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.resolve(__dirname, '..')
const distPath = path.join(extensionRoot, 'dist')
const screenshotsDir = path.join(__dirname, 'screenshots')

const FRAME_W = 1280
const FRAME_H = 800
const CAPTION_H = 72
const PANEL_W = 500
const SAMPLE_W = FRAME_W - PANEL_W
const CONTENT_H = FRAME_H - CAPTION_H

const SAMPLE_PAGE_URL = 'https://compareintel.com/store-sample'

const MODELS = {
  sonnet: {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier_access: 'unregistered' as const,
  },
  opus: {
    id: 'anthropic/claude-opus-4.8',
    name: 'Claude Opus 4.8',
    provider: 'Anthropic',
    tier_access: 'paid' as const,
  },
  gemini: {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier_access: 'unregistered' as const,
  },
  geminiPro: {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier_access: 'paid' as const,
  },
  gptMini: {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    tier_access: 'unregistered' as const,
  },
  gpt5: {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    provider: 'OpenAI',
    tier_access: 'paid' as const,
  },
}

const SELECTED_IDS = [MODELS.sonnet.id, MODELS.gemini.id, MODELS.gptMini.id]

const SAMPLE_MODELS = {
  models_by_provider: {
    Anthropic: [modelPayload(MODELS.sonnet), modelPayload(MODELS.opus)],
    Google: [modelPayload(MODELS.gemini), modelPayload(MODELS.geminiPro)],
    OpenAI: [modelPayload(MODELS.gptMini), modelPayload(MODELS.gpt5)],
  },
}

const HERO_PROMPT = 'What should I look for when I compare AI model answers?'
const SUMMARIZE_PROMPT = 'Summarize this'
const CODE_PROMPT = 'Write a TypeScript function that returns the unique items in an array.'

const HERO_ANSWERS: Record<string, string> = {
  [MODELS.sonnet.id]: [
    'Sample response from Claude Sonnet 4.6',
    '',
    'Look for facts you can check, missing caveats, and whether the answer actually does the task.',
  ].join('\n'),
  [MODELS.gemini.id]: [
    'Sample response from Gemini 2.5 Flash',
    '',
    'Compare specifics, not tone. A fluent answer can still skip an edge case.',
  ].join('\n'),
  [MODELS.gptMini.id]: [
    'Sample response from GPT-4o Mini',
    '',
    'Score each reply on accuracy, completeness, and usefulness — not just how easy it is to read.',
  ].join('\n'),
}

const SUMMARIZE_ANSWERS: Record<string, string> = {
  [MODELS.sonnet.id]: [
    'Sample response from Claude Sonnet 4.6',
    '',
    'The selected text says CompareIntel can include the highlighted passage or the whole page when you submit, and that it does not read the page in the background.',
  ].join('\n'),
  [MODELS.gemini.id]: [
    'Sample response from Gemini 2.5 Flash',
    '',
    'Summary of the highlighted paragraph: page or selection context is optional, sent only on submit, and never collected while you browse.',
  ].join('\n'),
  [MODELS.gptMini.id]: [
    'Sample response from GPT-4o Mini',
    '',
    'In short: the extension may attach your selection or the current page to a prompt, but only after you click submit.',
  ].join('\n'),
}

const CODE_ANSWERS: Record<string, string> = {
  [MODELS.sonnet.id]: [
    'Sample response from Claude Sonnet 4.6',
    '',
    '```ts',
    'export function uniqueItems<T>(items: T[]): T[] {',
    '  return [...new Set(items)]',
    '}',
    '```',
    '',
    'This keeps first-seen order and works for primitive values.',
  ].join('\n'),
  [MODELS.gemini.id]: [
    'Sample response from Gemini 2.5 Flash',
    '',
    '```ts',
    'export function uniqueItems<T>(items: T[]): T[] {',
    '  const seen = new Set<T>()',
    '  const unique: T[] = []',
    '  for (const item of items) {',
    '    if (!seen.has(item)) {',
    '      seen.add(item)',
    '      unique.push(item)',
    '    }',
    '  }',
    '  return unique',
    '}',
    '```',
  ].join('\n'),
  [MODELS.gptMini.id]: [
    'Sample response from GPT-4o Mini',
    '',
    '```ts',
    'export function uniqueItems<T>(items: T[]): T[] {',
    '  return items.filter((item) => items.indexOf(item) === items.lastIndexOf(item))',
    '}',
    '```',
    '',
    'This sample is wrong: it drops values that appear more than once instead of keeping a single copy.',
  ].join('\n'),
}

function modelPayload(model: (typeof MODELS)[keyof typeof MODELS]) {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    available: true,
    tier_access: model.tier_access,
    supports_vision: false,
    supports_image_generation: false,
    supports_web_search: true,
  }
}

function sseBody(modelIds: string[], answers: Record<string, string>): string {
  const lines = [`data: ${JSON.stringify({ type: 'start', conversation_id: 9001 })}`]
  for (const id of modelIds) {
    const content = answers[id] ?? `Sample response from ${id}`
    lines.push(`data: ${JSON.stringify({ type: 'chunk', model: id, content })}`)
    lines.push(`data: ${JSON.stringify({ type: 'done', model: id })}`)
  }
  lines.push('data: [DONE]')
  return `${lines.join('\n')}\n`
}

function pickAnswers(prompt: string): Record<string, string> {
  const text = prompt.toLowerCase()
  if (text.includes('summarize')) return SUMMARIZE_ANSWERS
  if (text.includes('typescript') || text.includes('unique items')) return CODE_ANSWERS
  return HERO_ANSWERS
}

async function startXvfb(): Promise<{ display: string; stop: () => void } | null> {
  if (process.env.DISPLAY) return null
  const display = `:${20 + Math.floor(Math.random() * 80)}`
  const child = spawn('Xvfb', [display, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], {
    stdio: 'ignore',
  })
  await new Promise((resolve) => setTimeout(resolve, 400))
  if (child.exitCode != null) return null
  process.env.DISPLAY = display
  return {
    display,
    stop: () => {
      child.kill('SIGTERM')
    },
  }
}

async function readSamplePageHtml(): Promise<string> {
  return fs.readFile(path.join(__dirname, 'sample-page.html'), 'utf8')
}

async function attachApiMocks(context: BrowserContext, sampleHtml: string): Promise<void> {
  await context.route('https://compareintel.com/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/models') {
        await route.fulfill({ json: SAMPLE_MODELS })
        return
      }
      if (url.pathname.startsWith('/api/credits/balance')) {
        await route.fulfill({
          json: {
            credits_allocated: 50,
            credits_used_today: 8,
            credits_remaining: 42,
            period_type: 'daily',
            subscription_tier: 'unregistered',
          },
        })
        return
      }
      if (url.pathname === '/api/auth/me' || url.pathname === '/api/auth/refresh') {
        await route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
        return
      }
      if (url.pathname === '/api/compare-stream') {
        const body = (request.postDataJSON() as { input_data?: string; models?: string[] }) ?? {}
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
          },
          body: sseBody(body.models ?? SELECTED_IDS, pickAnswers(body.input_data ?? '')),
        })
        return
      }
      await route.fulfill({ status: 200, json: [] })
      return
    }

    if (request.resourceType() === 'document' || url.pathname === '/store-sample') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: sampleHtml,
      })
      return
    }

    await route.fulfill({ status: 204, body: '' })
  })
}

async function launchExtensionContext(): Promise<{
  context: BrowserContext
  extensionId: string
  userDataDir: string
}> {
  const manifest = JSON.parse(await fs.readFile(path.join(distPath, 'manifest.json'), 'utf8')) as {
    name?: string
  }
  if (manifest.name !== 'CompareIntel') {
    throw new Error('extension/dist is missing a CompareIntel manifest — run npm run build first')
  }

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ci-store-ext-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: PANEL_W, height: CONTENT_H },
    deviceScaleFactor: 1,
  })

  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30_000 })
  const extensionId = new URL(worker.url()).host
  await worker
    .evaluate(() => chrome.storage.local.set({ pageContextIntroAcknowledged: true }))
    .catch(() => undefined)

  return { context, extensionId, userDataDir }
}

async function openSamplePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await page.setViewportSize({ width: SAMPLE_W, height: CONTENT_H })
  await page.goto(SAMPLE_PAGE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('#sample-selection').waitFor()
  await page.evaluate(() => {
    const el = document.getElementById('sample-selection')
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  return page
}

async function openSidePanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage()
  await page.setViewportSize({ width: PANEL_W, height: CONTENT_H })
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
    waitUntil: 'domcontentloaded',
  })
  const intro = page.getByRole('button', { name: 'Got it' })
  if (await intro.isVisible({ timeout: 1500 }).catch(() => false)) {
    await intro.click()
  }
  await expect(page.getByRole('button', { name: /^\+ Add$/ })).toBeVisible({ timeout: 20_000 })
  return page
}

async function selectThreeModels(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: /^\+ Add$/ }).click()
  await panel.getByRole('button', { name: /Claude Sonnet 4\.6/ }).click()
  await panel.getByRole('button', { name: /Google/ }).click()
  await panel.getByRole('button', { name: /Gemini 2\.5 Flash/ }).click()
  await panel.getByRole('button', { name: /OpenAI/ }).click()
  await panel.getByRole('button', { name: /GPT-4o Mini/ }).click()
}

async function expandAllProviders(panel: Page): Promise<void> {
  for (const name of ['Anthropic', 'Google', 'OpenAI']) {
    const collapsed = panel.getByRole('button', { name: new RegExp(`^▸\\s*${name}`) })
    if (await collapsed.isVisible().catch(() => false)) {
      await collapsed.click()
    }
  }
}

async function submitPrompt(panel: Page, prompt: string): Promise<void> {
  await panel.locator('.composer-input').fill(prompt)
  await panel.getByRole('button', { name: 'Submit' }).click()
  await expect(panel.locator('.result-card')).toHaveCount(3, { timeout: 20_000 })
  await expect(panel.getByText('Sample response').first()).toBeVisible({ timeout: 20_000 })
  await expect(panel.getByText('Thinking…')).toHaveCount(0, { timeout: 20_000 })
}

async function startNewComparison(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'New comparison' }).click()
  await expect(panel.locator('.result-card')).toHaveCount(0)
  await setSectionCollapsed(panel, 'Expand models', 'Collapse models', false)
  await expect(panel.getByRole('button', { name: /^\+ Add$/ })).toBeVisible()
}

async function showPageContext(panel: Page): Promise<void> {
  const expand = panel.getByRole('button', { name: 'Expand context tabs' })
  if (await expand.isVisible().catch(() => false)) {
    await expand.click()
  }

  const restriction = panel.locator('.context-restriction-note')
  const activeToggle = panel.locator('label.toggle', { hasText: 'Active tab' }).locator('input')
  if ((await restriction.isVisible().catch(() => false)) && (await activeToggle.isChecked())) {
    await activeToggle.uncheck()
  }

  await panel.getByRole('button', { name: '+ Pin tab' }).click()
  const article = panel.getByText(/comparing AI answers|Sample article/i).first()
  if (await article.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await article.click()
  } else {
    await panel.getByRole('button', { name: 'Close' }).click()
  }
}

async function setSectionCollapsed(
  panel: Page,
  expandName: string,
  collapseName: string,
  collapsed: boolean
): Promise<void> {
  const expand = panel.getByRole('button', { name: expandName })
  const collapse = panel.getByRole('button', { name: collapseName })
  if (collapsed && (await collapse.isVisible().catch(() => false))) {
    await collapse.click()
  }
  if (!collapsed && (await expand.isVisible().catch(() => false))) {
    await expand.click()
  }
}

async function stackAndFit(parts: Buffer[], width: number, height: number): Promise<Buffer> {
  const sized: { buf: Buffer; h: number }[] = []
  for (const part of parts) {
    const buf = await sharp(part).resize(width).png().toBuffer()
    const h = (await sharp(buf).metadata()).height ?? 1
    sized.push({ buf, h })
  }
  const total = sized.reduce((sum, part) => sum + part.h, 0)
  const scale = total > height ? height / total : 1
  const composites: { input: Buffer; top: number; left: number }[] = []
  let top = 0
  for (const part of sized) {
    const h = Math.max(1, Math.round(part.h * scale))
    composites.push({
      input: await sharp(part.buf).resize(width, h).png().toBuffer(),
      top,
      left: 0,
    })
    top += h
  }
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 15, g: 23, b: 42 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()
}

async function screenshotIfVisible(locator: ReturnType<Page['locator']>): Promise<Buffer | null> {
  if ((await locator.count()) === 0) return null
  if (!(await locator.first().isVisible().catch(() => false))) return null
  return locator.first().screenshot({ type: 'png', animations: 'disabled' })
}

async function heightAtWidth(image: Buffer, width: number): Promise<number> {
  const resized = await sharp(image).resize(width).png().toBuffer()
  return (await sharp(resized).metadata()).height ?? 1
}

async function capturePanelColumn(panel: Page): Promise<Buffer> {
  const chrome: Buffer[] = []
  for (const selector of ['.header', '.credits-bar', '.context-bar', '.models-section']) {
    const shot = await screenshotIfVisible(panel.locator(selector))
    if (shot) chrome.push(shot)
  }
  const cards: Buffer[] = []
  const cardLocator = panel.locator('.result-card')
  const cardCount = await cardLocator.count()
  for (let index = 0; index < cardCount; index += 1) {
    const card = cardLocator.nth(index)
    if (await card.isVisible()) {
      cards.push(await card.screenshot({ type: 'png', animations: 'disabled' }))
    }
  }
  const composer = await screenshotIfVisible(panel.locator('.composer-footer'))
  const chromeHeight = (await Promise.all(chrome.map((part) => heightAtWidth(part, PANEL_W)))).reduce(
    (sum, height) => sum + height,
    0
  )
  const composerHeight = composer ? await heightAtWidth(composer, PANEL_W) : 0
  const middleHeight = Math.max(80, CONTENT_H - chromeHeight - composerHeight)
  const middle = cards.length > 0 ? await stackAndFit(cards, PANEL_W, middleHeight) : null
  const parts = [...chrome, ...(middle ? [middle] : []), ...(composer ? [composer] : [])]
  if (parts.length === 0) {
    return panel.screenshot({ type: 'png', animations: 'disabled' })
  }
  return stackAndFit(parts, PANEL_W, CONTENT_H)
}

async function renderCaption(page: Page, caption: string): Promise<Buffer> {
  await page.setViewportSize({ width: FRAME_W, height: CAPTION_H })
  await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; width: ${FRAME_W}px; height: ${CAPTION_H}px; background: #0b1220; }
      .bar {
        box-sizing: border-box;
        height: ${CAPTION_H}px;
        padding: 12px 22px 12px 28px;
        border-left: 8px solid #0171fe;
        font-family: system-ui, 'Segoe UI', sans-serif;
      }
      .kicker { margin: 0 0 4px; color: #94a3b8; font-size: 13px; }
      .caption { margin: 0; color: #f8fafc; font-size: 20px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="bar">
      <p class="kicker">CompareIntel</p>
      <p class="caption">${escapeXml(caption)}</p>
    </div>
  </body>
</html>`)
  return page.screenshot({ type: 'png', animations: 'disabled' })
}

async function composeFrame(options: {
  captionPng: Buffer
  samplePng: Buffer
  panelPng: Buffer
  outPath: string
}): Promise<void> {
  const sample = await sharp(options.samplePng)
    .resize(SAMPLE_W, CONTENT_H, { fit: 'cover', position: 'left' })
    .toBuffer()
  const panel = await sharp(options.panelPng)
    .resize(PANEL_W, CONTENT_H, { fit: 'cover', position: 'top' })
    .toBuffer()
  const caption = await sharp(options.captionPng).resize(FRAME_W, CAPTION_H).toBuffer()

  await sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 3,
      background: { r: 11, g: 18, b: 32 },
    },
  })
    .composite([
      { input: caption, top: 0, left: 0 },
      { input: sample, top: CAPTION_H, left: 0 },
      { input: panel, top: CAPTION_H, left: SAMPLE_W },
    ])
    .flatten({ background: '#0B1220' })
    .removeAlpha()
    .png()
    .toFile(options.outPath)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function capturePair(
  samplePage: Page,
  panel: Page,
  captionPage: Page,
  caption: string,
  filename: string
): Promise<void> {
  const [samplePng, panelPng, captionPng] = await Promise.all([
    samplePage.screenshot({ type: 'png', animations: 'disabled' }),
    capturePanelColumn(panel),
    renderCaption(captionPage, caption),
  ])
  await composeFrame({
    captionPng,
    samplePng,
    panelPng,
    outPath: path.join(screenshotsDir, filename),
  })
}

test.describe.configure({ mode: 'serial' })

test('generate Chrome Web Store screenshots', async () => {
  const xvfb = await startXvfb()
  await fs.mkdir(screenshotsDir, { recursive: true })
  const sampleHtml = await readSamplePageHtml()
  const { context, extensionId, userDataDir } = await launchExtensionContext()

  try {
    await attachApiMocks(context, sampleHtml)
    const samplePage = await openSamplePage(context)
    const panel = await openSidePanel(context, extensionId)
    await panel.addStyleTag({
      content: '.context-restriction-note { display: none !important; }',
    })
    const captionPage = await context.newPage()
    await selectThreeModels(panel)
    await expandAllProviders(panel)
    await setSectionCollapsed(panel, 'Expand context tabs', 'Collapse context tabs', true)
    await capturePair(
      samplePage,
      panel,
      captionPage,
      'Pick the models you want to compare.',
      '03-model-picker.png'
    )

    await panel.getByRole('button', { name: /^Collapse$/ }).click()
    await submitPrompt(panel, HERO_PROMPT)
    await setSectionCollapsed(panel, 'Expand models', 'Collapse models', true)
    await capturePair(
      samplePage,
      panel,
      captionPage,
      'One prompt. Several AI models. Side by side.',
      '01-hero.png'
    )

    await startNewComparison(panel)
    await showPageContext(panel)
    await submitPrompt(panel, SUMMARIZE_PROMPT)
    await setSectionCollapsed(panel, 'Expand models', 'Collapse models', true)
    await setSectionCollapsed(panel, 'Expand context tabs', 'Collapse context tabs', false)
    await capturePair(
      samplePage,
      panel,
      captionPage,
      'Use the selected text or the whole page as context, read only when you submit.',
      '02-page-context.png'
    )

    await startNewComparison(panel)
    await submitPrompt(panel, CODE_PROMPT)
    await setSectionCollapsed(panel, 'Expand models', 'Collapse models', true)
    await setSectionCollapsed(panel, 'Expand context tabs', 'Collapse context tabs', true)
    await capturePair(
      samplePage,
      panel,
      captionPage,
      'See which model gets it right.',
      '04-code-comparison.png'
    )

    for (const name of [
      '01-hero.png',
      '02-page-context.png',
      '03-model-picker.png',
      '04-code-comparison.png',
    ]) {
      const file = await fs.stat(path.join(screenshotsDir, name))
      expect(file.size).toBeGreaterThan(10_000)
    }
  } finally {
    await context.close()
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
    xvfb?.stop()
  }
})
