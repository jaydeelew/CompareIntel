/**
 * Saved-cell-style fixture for the Gemma `\(\sqrt{2}\)` production paragraph.
 * Offline: the fixture is checked in, and this does not call OpenRouter.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from '@playwright/test'
import { waitForHarnessRender } from './test-helpers'

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/gemma-sqrt-paren-cell.json'
)

interface SavedCellFixture {
  modelId: string
  response: string
}

test('gemma saved-cell fixture renders paren and bracket sqrt without touching code or currency', async ({
  page,
}) => {
  const cell = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as SavedCellFixture
  await page.goto(
    `/?modelId=${encodeURIComponent(cell.modelId)}&content=${encodeURIComponent(cell.response)}`
  )
  await waitForHarnessRender(page)

  const report = await page.evaluate(() => {
    const container = document.querySelector('[data-render-container]')
    if (!container) return null
    const clone = container.cloneNode(true) as Element
    clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
    const visible = (clone.textContent ?? '').replace(/[\u200b\u2060]/g, '').replace(/\s+/g, ' ').trim()
    return {
      tex: Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
        node => node.textContent
      ),
      display: container.querySelectorAll('.katex-display').length,
      errors: container.querySelectorAll('.katex-error').length,
      inlineCode: container.querySelector('code.inline-code')?.textContent ?? '',
      fence: container.querySelector('pre code')?.textContent ?? '',
      visible,
    }
  })

  expect(report).not.toBeNull()
  expect(report?.errors).toBe(0)
  expect(report?.tex).toEqual(['\\sqrt{2}', '\\sqrt{2}'])
  expect(report?.display).toBe(1)
  expect(report?.inlineCode).toBe('\\(\\sqrt{2}\\)')
  expect(report?.fence).toContain('\\(\\sqrt{2}\\)')
  expect(report?.visible).toContain(
    'The square root of 2 2 is an irrational number, meaning it cannot be expressed as a simple fraction.'
  )
  expect(report?.visible).toContain('It costs $5 and shipping is $10.')
  expect(report?.visible).not.toContain('(\\sqrt{2})')
})
