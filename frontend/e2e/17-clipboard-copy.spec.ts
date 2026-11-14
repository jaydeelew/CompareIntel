import { test, expect } from './fixtures'
import { loadHarnessResponse, openHarnessWithContent } from './helpers/harnessKatexOverflow'

const HARNESS_BASE = 'http://127.0.0.1:5174'

const EDGE_CASES_JSON =
  'rendering-harness/runs/2026-11-08-13/openai_gpt-6-luna_06-edge-cases-boundaries.json'
const MATH_BASICS_JSON =
  'rendering-harness/runs/2026-11-08-13/openai_gpt-6-luna_01-math-basics.json'

async function installClipboardCapture(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.__clipCaptures = []
    document.addEventListener('copy', e => {
      const types: Record<string, string> = {}
      if (e.clipboardData) {
        for (const t of e.clipboardData.types) {
          types[t] = e.clipboardData.getData(t)
        }
      }
      window.__clipCaptures.push({ event: 'copy', types })
    })
    const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)
    navigator.clipboard.writeText = async (text: string) => {
      window.__clipCaptures.push({ event: 'writeText', types: { 'text/plain': text } })
      try {
        return await origWriteText(text)
      } catch {
        return undefined
      }
    }
  })
}

async function lastCapture(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const list = (window as unknown as { __clipCaptures?: Array<{ types: Record<string, string> }> })
      .__clipCaptures
    return list?.at(-1)?.types ?? null
  })
}

test.describe('Clipboard copy (rendering harness)', () => {
  test.describe.configure({ mode: 'parallel' })

  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Harness clipboard tests run on Chromium only'
    )
    test.skip(browserName !== 'chromium', 'Harness clipboard tests run on Chromium only')
  })

  test.use({
    baseURL: HARNESS_BASE,
    viewport: { width: 960, height: 900 },
  })

  test('code block copy button writes exact source', async ({ page }) => {
    await installClipboardCapture(page)
    const { modelId, content } = loadHarnessResponse(EDGE_CASES_JSON)
    await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

    await page.locator('.code-copy-btn').first().click()
    const clip = await lastCapture(page)
    expect(clip?.['text/plain']).toContain('price = $50')
    expect(clip?.['text/plain']).not.toMatch(/PYTHON|Copy/i)
  })

  test('table selection provides HTML table and TSV plain text', async ({ page }) => {
    await installClipboardCapture(page)
    const { modelId, content } = loadHarnessResponse(EDGE_CASES_JSON)
    await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

    await page.evaluate(() => {
      const table = document.querySelector('.markdown-table')
      if (!table) throw new Error('table missing')
      const sel = window.getSelection()
      sel?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(table)
      sel?.addRange(range)
      document.execCommand('copy')
    })

    const clip = await lastCapture(page)
    expect(clip?.['text/html'] ?? '').toContain('<table')
    expect(clip?.['text/plain'] ?? '').toMatch(/^Variable\tFormula\tValue/m)
    expect(clip?.['text/plain'] ?? '').toContain('Area')
    expect(clip?.['text/plain'] ?? '').not.toContain('katex-mathml')
  })

  test('inline math selection copies LaTeX from KaTeX annotation', async ({ page }) => {
    await installClipboardCapture(page)
    const { modelId, content } = loadHarnessResponse(MATH_BASICS_JSON)
    await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

    await page.evaluate(() => {
      const katex = document.querySelector('.latex-content .katex')
      if (!katex) throw new Error('katex missing')
      const sel = window.getSelection()
      sel?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(katex)
      sel?.addRange(range)
      document.execCommand('copy')
    })

    const clip = await lastCapture(page)
    expect(clip?.['text/plain']).toMatch(/^\\\(/)
    expect(clip?.['text/plain']).toContain('frac{-b')
    expect(clip?.['text/plain']).not.toMatch(/𝑥|katex/)
  })

  test('select-all uses saved markdown source for plain text', async ({ page }) => {
    await installClipboardCapture(page)
    const { modelId, content } = loadHarnessResponse(MATH_BASICS_JSON)
    await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

    await page.evaluate(() => {
      const root = document.querySelector('.latex-content')
      if (!root) throw new Error('latex-content missing')
      const sel = window.getSelection()
      sel?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(root)
      sel?.addRange(range)
      document.execCommand('copy')
    })

    const clip = await lastCapture(page)
    expect(clip?.['text/plain']).toBe(content.trim())
  })
})
