/**
 * Saved-cell-style fixture for undelimited LaTeX in prose (offline, no OpenRouter).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from '@playwright/test'
import { waitForHarnessRender } from './test-helpers'

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/undelimited-prose-latex-gemma-cell.json'
)

interface SavedCellFixture {
  modelId: string
  response: string
}

test('undelimited prose LaTeX fixture renders sqrt in prose, not in code', async ({ page }) => {
  const cell = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as SavedCellFixture
  await page.goto(
    `/?modelId=${encodeURIComponent(cell.modelId)}&content=${encodeURIComponent(cell.response)}`
  )
  await waitForHarnessRender(page)

  const report = await page.evaluate(() => {
    const container = document.querySelector('[data-render-container]')
    if (!container) return null
    const clone = container.cloneNode(true) as Element
    clone.querySelectorAll('.katex-mathml, pre, code').forEach(node => node.remove())
    return {
      tex: Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
        n => n.textContent
      ),
      errors: container.querySelectorAll('.katex-error').length,
      visible: (clone.textContent ?? '').replace(/\s+/g, ' ').trim(),
      inlineCode: container.querySelector('code.inline-code')?.textContent ?? '',
      fence: container.querySelector('pre code')?.textContent ?? '',
    }
  })

  expect(report?.errors).toBe(0)
  expect(report?.tex).toEqual(expect.arrayContaining(['\\sqrt{3}', '\\sqrt{3}/2']))
  expect(report?.visible).not.toMatch(/\\sqrt/)
  expect(report?.inlineCode).toBe('\\sqrt{x}')
  expect(report?.fence).toContain('\\sqrt{x}')
  expect(report?.visible).toContain('$5')
})