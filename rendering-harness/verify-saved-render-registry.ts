#!/usr/bin/env tsx
/**
 * Offline render of every unique saved cell (no OpenRouter). Writes a manifest
 * of validation status and a hash of visible rendered text for regression diffs.
 *
 *   npx tsx verify-saved-render-registry.ts --out=/path/manifest.json
 */
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { renderOnPage } from './captures.js'
import { validateRenderedHTML } from './dom-assertions.js'
import { getExpectedFeatures } from './expected-features.js'
import { launchVite } from './launch-vite.js'
import { loadUniqueSavedCells } from './saved-cells.js'
import { isEmptyVisibleReply, overallStatus } from './overall-status.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

async function visibleRenderedText(page: import('playwright').Page): Promise<string> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-render-container]')
    if (!container) return ''
    const clone = container.cloneNode(true) as Element
    clone.querySelectorAll('.katex-mathml, pre, code, annotation').forEach(node => node.remove())
    return (clone.textContent || '').replace(/\s+/g, ' ').trim()
  })
}

async function readRenderedHtml(page: import('playwright').Page): Promise<string> {
  return page.evaluate(() => document.querySelector('[data-render-container]')?.innerHTML || '')
}

async function main() {
  const outPath = argValue('out')
  if (!outPath) {
    console.error('Usage: npx tsx verify-saved-render-registry.ts --out=manifest.json [--port=5174]')
    process.exit(1)
  }

  const port = Number(argValue('port') || '5174')
  const cells = await loadUniqueSavedCells()
  const vite = await launchVite({ port })
  try {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.addInitScript('globalThis.__name = (fn) => fn')
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-listening'), {
      timeout: 60000,
    })

    const results: Array<{
      key: string
      modelId: string
      promptName: string
      sourceFile: string
      validationStatus: string
      renderedTextHash: string
      error?: string
    }> = []

    let index = 0
    for (const cell of cells) {
      index += 1
      const key = `${cell.modelId}:${cell.promptName}`
      if (cell.error || isEmptyVisibleReply(cell.response)) {
        results.push({
          key,
          modelId: cell.modelId,
          promptName: cell.promptName,
          sourceFile: cell.filePath,
          validationStatus: overallStatus({
            truncated: cell.truncated,
            emptyVisible: true,
          }),
          renderedTextHash: '',
          error: cell.error || 'empty visible',
        })
        continue
      }
      try {
        const generation = `verify-${index}-${key}`
        await renderOnPage(page, cell.modelId, cell.response, generation)
        const renderedHTML = await readRenderedHtml(page)
        const visible = await visibleRenderedText(page)
        const expected = getExpectedFeatures(cell.promptName, cell.promptText)
        const validation = validateRenderedHTML(renderedHTML, expected, cell.response)
        const truncated = cell.truncated
        const status = overallStatus({
          truncated,
          emptyVisible: false,
          validation,
        })
        results.push({
          key,
          modelId: cell.modelId,
          promptName: cell.promptName,
          sourceFile: cell.filePath,
          validationStatus: status,
          renderedTextHash: hashText(visible),
        })
      } catch (error) {
        results.push({
          key,
          modelId: cell.modelId,
          promptName: cell.promptName,
          sourceFile: cell.filePath,
          validationStatus: 'fail',
          renderedTextHash: '',
          error: String(error),
        })
      }
      if (index % 50 === 0) {
        console.error(`Rendered ${index}/${cells.length}...`)
      }
    }
    await browser.close()

    const manifest = {
      generatedAt: new Date().toISOString(),
      cellCount: results.length,
      results: results.sort((a, b) => a.key.localeCompare(b.key)),
    }
    await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true })
    await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`Wrote ${results.length} cells to ${outPath}`)
  } finally {
    vite.stop()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})