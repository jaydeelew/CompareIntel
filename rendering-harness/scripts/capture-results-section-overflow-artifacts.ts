#!/usr/bin/env node
/**
 * Phone before/after for results-section overflow fix (390 CSS px, DPR 3).
 * Requires harness dev server on :5174 (render-only, no OpenRouter).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { PHONE_VIEW, openThemedPage, renderOnPage, shootContainer } from '../captures.js'
import { launchVite } from '../launch-vite.js'
import { findSavedCell } from '../saved-cells.js'
import { stackPhoneBeforeAfter } from '../phone-stack-shot.js'

const artifactRoot = process.env.ARTIFACT_ROOT || '/opt/cursor/artifacts'

const REPRESENTATIVE: Array<{ modelId: string; promptName: string; slug: string }> = [
  {
    modelId: 'google/gemini-3.8-flash',
    promptName: '05-complex-scenarios',
    slug: 'google-gemini-3-8-flash-05-complex-scenarios',
  },
  {
    modelId: 'anthropic/claude-opus-5',
    promptName: '04-mixed-markdown-latex',
    slug: 'anthropic-claude-opus-5-04-mixed-markdown-latex',
  },
  {
    modelId: 'minimax/minimax-m3.1-flash',
    promptName: '05-complex-scenarios',
    slug: 'minimax-minimax-m3-1-flash-05-complex-scenarios',
  },
]

const BROKEN_SECTION_CSS = `
.results-section {
  overflow-x: hidden !important;
}
`

function extractSourceExcerpt(content: string): string {
  const displays = [...content.matchAll(/\$\$([\s\S]*?)\$\$/g)]
    .map(m => m[1].trim())
    .sort((a, b) => b.length - a.length)
  if (displays[0]) return `$$\n${displays[0]}\n$$`
  const table = content.match(
    /(?:^|\n)(\|[^\n]+\|\r?\n\|[-: |\t]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/m
  )?.[1]
  if (table) return table.trim()
  return content.slice(0, 800)
}

async function main() {
  fs.mkdirSync(path.join(artifactRoot), { recursive: true })
  const tmp = path.join(artifactRoot, 'tmp-section-overflow')
  fs.mkdirSync(tmp, { recursive: true })
  const vite = await launchVite()
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', PHONE_VIEW)
    const stackPage = await browser.newPage({ viewport: { width: 390, height: 900 } })

    for (const cell of REPRESENTATIVE) {
      const saved = await findSavedCell(`${cell.modelId}:${cell.promptName}`)
      const source = extractSourceExcerpt(saved.response)
      const gen = `artifact-${cell.slug}`
      const beforePath = path.join(tmp, `${cell.slug}-before.png`)
      const afterPath = path.join(tmp, `${cell.slug}-after.png`)
      const outPath = path.join(artifactRoot, `mobile-${cell.slug}-section-overflow-before-after.png`)

      await renderOnPage(page, saved.modelId, saved.response, `${gen}:before`)
      await page.addStyleTag({ content: BROKEN_SECTION_CSS })
      await shootContainer(page, beforePath)
      await page.evaluate(() => {
        document.querySelectorAll('style').forEach(el => {
          if (el.textContent?.includes('.results-section')) el.remove()
        })
      })

      await renderOnPage(page, saved.modelId, saved.response, `${gen}:after`)
      await shootContainer(page, afterPath)

      await stackPhoneBeforeAfter(stackPage, {
        beforePng: beforePath,
        afterPng: afterPath,
        beforeLabel: 'BEFORE — .results-section overflow-x: hidden clips wide math/tables',
        afterLabel: 'AFTER — section visible; katex/table scroll inside their boxes',
        sourceExcerpt: source,
        outputPath: outPath,
      })
      fs.writeFileSync(
        path.join(artifactRoot, `mobile-${cell.slug}-section-overflow-source.txt`),
        `${source}\n`
      )
      console.log(outPath)
    }
  } finally {
    await browser.close()
    vite.stop()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
