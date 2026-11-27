import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { waitForHarnessRender } from './test-helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SWAP = 'Before: x=10, y=20\nAfter:  x=20, y=10'

const MARKDOWN = [
  'Output:',
  '```',
  'Before: x=10, y=20',
  'After:  x=20, y=10',
  '```',
  '',
  'C has only pass-by-value, so you pass **pointers** to the variables. A function like `void swap(int a, int b)` would only swap local copies.',
  '',
  '```text',
  'alpha = $1',
  'beta = $2',
  '```',
  '',
  '```plaintext',
  'line one',
  'line two',
  '```',
  '',
  '~~~',
  'tilde = $9',
  'still = 1',
  '~~~',
  '',
  '- Swap them:',
  '    ```',
  '    Before: x=10, y=20',
  '    After:  x=20, y=10',
  '    ```',
  '',
  '```python',
  'print("ok")',
  '```',
].join('\n')

function luminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

test.describe('plain fences on a phone', () => {
  test.use({ viewport: { width: 393, height: 851 } })

  test('untagged output keeps line breaks, size, and contrast', async ({ page }) => {
    await page.goto(
      '/?modelId=' +
        encodeURIComponent('anthropic/claude-sonnet-5.5') +
        '&content=' +
        encodeURIComponent(MARKDOWN)
    )
    await waitForHarnessRender(page)

    const metrics = await page.evaluate(() => {
      const parse = (color: string): [number, number, number] | null => {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
      }
      const blocks = Array.from(document.querySelectorAll('.code-block-direct'))
      const described = blocks.map(block => {
        const code = block.querySelector('code')
        const textNode = code?.firstChild
        let lineTops: number[] = []
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const range = document.createRange()
          range.selectNodeContents(textNode)
          lineTops = Array.from(range.getClientRects()).map(rect => Math.round(rect.top))
        }
        const codeStyle = code ? getComputedStyle(code) : null
        const blockStyle = getComputedStyle(block)
        return {
          text: code?.textContent ?? '',
          language: block.getAttribute('data-language') ?? '',
          whiteSpace: codeStyle?.whiteSpace ?? '',
          fontSize: codeStyle ? parseFloat(codeStyle.fontSize) : 0,
          color: codeStyle?.color ?? '',
          background: blockStyle.backgroundColor,
          fg: codeStyle ? parse(codeStyle.color) : null,
          bg: parse(blockStyle.backgroundColor),
          lineTops,
          katex: Boolean(block.querySelector('.katex')),
          preformatted: block.classList.contains('preformatted-text'),
        }
      })
      const pageOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      return { described, pageOverflow }
    })

    expect(metrics.described.map(block => block.text)).toEqual([
      SWAP,
      'alpha = $1\nbeta = $2',
      'line one\nline two',
      'tilde = $9\nstill = 1',
      SWAP,
      'print("ok")',
    ])
    expect(metrics.described.map(block => block.language)).toEqual([
      '',
      'text',
      'plaintext',
      '',
      '',
      'python',
    ])

    const python = metrics.described[5]
    for (const block of metrics.described) {
      expect(block.whiteSpace.startsWith('pre'), block.text).toBe(true)
      expect(block.fontSize, block.text).toBe(python.fontSize)
      expect(block.fontSize).toBeGreaterThanOrEqual(13)
      expect(block.color, block.text).toBe(python.color)
      expect(block.background, block.text).toBe(python.background)
      expect(block.katex, block.text).toBe(false)
      expect(block.preformatted, block.text).toBe(false)
      expect(block.fg, block.text).not.toBeNull()
      expect(block.bg, block.text).not.toBeNull()
      if (block.fg && block.bg) {
        const fg = luminance(...block.fg)
        const bg = luminance(...block.bg)
        const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
        expect(ratio, block.text).toBeGreaterThanOrEqual(4.5)
      }
      if (block.text.includes('\n')) {
        const tops = new Set(block.lineTops)
        expect(tops.size, block.text).toBeGreaterThanOrEqual(2)
      }
    }

    expect(metrics.pageOverflow).toBeLessThanOrEqual(1)

    const shotDir = path.join(__dirname, 'test-results')
    fs.mkdirSync(shotDir, { recursive: true })
    const shotPath = path.join(shotDir, 'plain-fence-mobile.png')
    await page.locator('[data-render-container]').screenshot({ path: shotPath })
    const artifactDir = '/opt/cursor/artifacts'
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(shotPath, path.join(artifactDir, 'plain-fence-mobile.png'))
    }
  })

  test('CRLF untagged fence keeps both lines', async ({ page }) => {
    const crlf = `Output:\r\n\`\`\`\r\n${SWAP}\r\n\`\`\`\r\n`
    await page.goto(
      '/?modelId=' +
        encodeURIComponent('anthropic/claude-sonnet-5.5') +
        '&content=' +
        encodeURIComponent(crlf)
    )
    await waitForHarnessRender(page)
    const text = await page.locator('.code-block-direct code').first().textContent()
    expect(text).toBe(SWAP)
  })
})
