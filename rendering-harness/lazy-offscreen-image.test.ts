/**
 * Regression: production LatexRenderer uses loading="lazy" on images. Off-screen
 * lazy images never start loading, so harness render-ready must promote them to
 * eager before waiting on img.complete / load / error.
 */
import { expect, test } from '@playwright/test'
import {
  MARKDOWN_FORMATTING_EXPECTED,
  MARKDOWN_FORMATTING_SECTION,
  TINY_PNG,
} from './fixtures/markdown-formatting-section.js'
import { waitForHarnessRender } from './test-helpers'

async function renderViaMessage(
  page: import('@playwright/test').Page,
  content: string
): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(
    () => (document.body?.textContent || '').includes('Waiting for render request'),
    { timeout: 25000 }
  )
  await page.evaluate(({ content }) => {
    window.postMessage({ type: 'render', modelId: 'test', content }, '*')
  }, { content })
  await waitForHarnessRender(page)
}

const filler = Array.from({ length: 80 }, (_, i) => `Filler paragraph ${i + 1}.`).join('\n\n')

const offScreenMarkdown = `${filler}\n\n![triangle sketch](${TINY_PNG})`

test.describe('lazy off-screen images', () => {
  test('reaches render-complete with a below-the-fold data-URL image', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 400 })
    await renderViaMessage(page, offScreenMarkdown)

    await expect(page.locator('[data-render-complete]')).toHaveCount(1)
    const img = page.locator('[data-render-container] img')
    await expect(img).toHaveCount(1)
    await expect(img).toHaveAttribute('src', new RegExp(`^${TINY_PNG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    const loading = await img.evaluate(el => (el as HTMLImageElement).loading)
    expect(loading).toBe('eager')
  })

  test('full 02-style markdown section renders complete visible text', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 1200 })
    await renderViaMessage(page, MARKDOWN_FORMATTING_SECTION)

    await expect(page.locator('[data-render-complete]')).toHaveCount(1)
    await expect(page.locator('[data-render-container] img')).toHaveCount(1)

    const visible = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]')
      if (!container) return ''
      const clone = container.cloneNode(true) as Element
      clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
      return (clone.textContent ?? '').replace(/[\u200b\u2060]/g, '').replace(/\s+/g, ' ').trim()
    })
    expect(visible).toBe(MARKDOWN_FORMATTING_EXPECTED)
  })
})