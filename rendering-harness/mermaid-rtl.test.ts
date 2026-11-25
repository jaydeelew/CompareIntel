/**
 * Mermaid diagrams and RTL blocks in the real renderer.
 * Waits on page state (SVG present, or a parse-error code block). No fixed
 * timeout and no networkidle.
 */

import { expect, test } from '@playwright/test'
import { pageStateReady } from './page-state.js'

const DIAGRAM = [
  '## Mermaid',
  '',
  '```mermaid',
  'graph TD',
  '  A[Start] --> B[End]',
  '```',
  '',
  '## RTL',
  '',
  'English stays on the left.',
  '',
  'مرحبا بالعالم',
  '',
  '- First item',
  '- مرحبا بالعالم',
  '- שלום עולם',
  '',
  '| Name | Greeting |',
  '| --- | --- |',
  '| English | hello |',
  '| Arabic | مرحبا |',
  '',
  'Inline $x^2$ beside مرحبا بالعالم and `code_token`.',
  '',
  '```python',
  '# comment مرحبا',
  'print("ok")',
  '```',
  '',
].join('\n')

const BROKEN = ['```mermaid', 'NOT_A_DIAGRAM :::', '```', ''].join('\n')

async function renderMarkdown(page: import('@playwright/test').Page, content: string, generation: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-listening'))
  await page.evaluate(
    ({ content, generation }) => {
      window.postMessage({ type: 'render', modelId: 'test', content, generation }, '*')
    },
    { content, generation }
  )
  await page.waitForFunction(pageStateReady, generation, { timeout: 30000 })
}

test('renders a mermaid SVG and keeps RTL blocks auto-directed', async ({ page }) => {
  await renderMarkdown(page, DIAGRAM, 'mermaid-rtl')
  const svg = page.locator('.mermaid-diagram svg')
  await expect(svg).toHaveCount(1)
  await expect(page.locator('[data-mermaid-pending]')).toHaveCount(0)
  await expect(page.locator('.mermaid-diagram')).toHaveAttribute('data-mermaid-rendered', 'true')

  const directions = await page.evaluate(() => {
    const textOf = (selector: string, needle: string) =>
      Array.from(document.querySelectorAll(selector)).find(el => (el.textContent || '').includes(needle))
    const dir = (el: Element | undefined) =>
      el ? getComputedStyle(el).direction : 'missing'
    const align = (el: Element | undefined) =>
      el ? getComputedStyle(el).textAlign : 'missing'
    const arabicP = textOf('p', 'مرحبا بالعالم')
    const englishP = textOf('p', 'English stays')
    const arabicLi = Array.from(document.querySelectorAll('li')).find(el =>
      (el.textContent || '').trim().startsWith('مرحبا')
    )
    const hebrewLi = textOf('li', 'שלום')
    const englishLi = textOf('li', 'First item')
    const arabicTd = textOf('td', 'مرحبا')
    const englishTd = textOf('td', 'hello')
    const katex = document.querySelector('.katex')
    const inlineCode = document.querySelector('code.inline-code')
    const fence = document.querySelector('pre code')
    return {
      arabicP: dir(arabicP),
      arabicAlign: align(arabicP),
      englishP: dir(englishP),
      arabicLi: dir(arabicLi),
      hebrewLi: dir(hebrewLi),
      englishLi: dir(englishLi),
      arabicTd: dir(arabicTd),
      englishTd: dir(englishTd),
      katex: dir(katex ?? undefined),
      inlineCode: dir(inlineCode ?? undefined),
      fence: dir(fence ?? undefined),
      attrs: {
        arabicP: arabicP?.getAttribute('dir'),
        arabicLi: arabicLi?.getAttribute('dir'),
        arabicTd: arabicTd?.getAttribute('dir'),
        katex: katex?.getAttribute('dir'),
        fence: fence?.getAttribute('dir'),
      },
    }
  })

  expect(directions.attrs.arabicP).toBe('auto')
  expect(directions.attrs.arabicLi).toBe('auto')
  expect(directions.attrs.arabicTd).toBe('auto')
  expect(directions.arabicP).toBe('rtl')
  expect(directions.arabicAlign === 'right' || directions.arabicAlign === 'start').toBe(true)
  expect(directions.englishP).toBe('ltr')
  expect(directions.arabicLi).toBe('rtl')
  expect(directions.hebrewLi).toBe('rtl')
  expect(directions.englishLi).toBe('ltr')
  expect(directions.arabicTd).toBe('rtl')
  expect(directions.englishTd).toBe('ltr')
  expect(directions.katex).toBe('ltr')
  expect(directions.inlineCode).toBe('ltr')
  expect(directions.fence).toBe('ltr')
  expect(directions.attrs.katex).toBe('ltr')
  expect(directions.attrs.fence).toBe('ltr')
})

test('invalid mermaid becomes a code block and the page still settles', async ({ page }) => {
  await renderMarkdown(page, BROKEN, 'mermaid-fallback')
  await expect(page.locator('[data-mermaid-fallback]')).toHaveCount(1)
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(0)
  await expect(page.locator('[data-mermaid-pending]')).toHaveCount(0)
  await expect(page.locator('[data-language="mermaid"]')).toContainText('NOT_A_DIAGRAM')
})

test('mermaid follows the dark theme', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('compareintel-theme', 'dark')
  })
  await renderMarkdown(page, '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n', 'mermaid-dark')
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1)
  await expect(page.locator('.mermaid-diagram')).toHaveAttribute('data-mermaid-theme', 'dark')
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(theme).toBe('dark')
})
