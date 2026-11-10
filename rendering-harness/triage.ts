#!/usr/bin/env node
/**
 * Build a fix folder for one saved cell.
 *
 *   npm run triage -- --cell=anthropic/claude-fable-5:01-math-basics
 *
 * Writes triage-out/<model>__<prompt>/ with the heading-range source, a
 * reference-vs-ours line diff, a 960 CSS px DPR 2 screenshot, and a
 * full-section regression stub. No OpenRouter calls.
 */

import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { EVIDENCE_VIEW, openThemedPage, readRenderedHtml, renderOnPage, shootContainer } from './captures.js'
import { launchVite } from './launch-vite.js'
import { unifiedDiff } from './line-diff.js'
import { findSavedCell } from './saved-cells.js'
import { splitHeadingSections } from './section-slice.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function textDelta(reference: string, ours: string): number {
  if (reference === ours) return 0
  const oursWords = new Set(ours.split(' '))
  let missing = 0
  for (const word of reference.split(' ')) {
    if (word && !oursWords.has(word)) missing += 1
  }
  return missing + Math.abs(reference.length - ours.length)
}

async function referenceHtml(markdown: string): Promise<string> {
  const refPath = path.resolve(__dirname, '../frontend/src/utils/__tests__/renderingAudit/reference.ts')
  const mod = (await import(pathToFileURL(refPath).href)) as {
    renderReferenceHtml: (source: string) => string
  }
  return mod.renderReferenceHtml(markdown)
}

function regressionStub(modelId: string, promptName: string, heading: string, section: string): string {
  const title = heading || 'full reply'
  return `/**
 * Full-section regression stub.
 * Cell: ${modelId}:${promptName}
 * Section: ${title}
 *
 * The source below is the whole heading range. Move this file to
 * frontend/src/utils/__tests__/regressions/ and run it while fixing the
 * renderer. It asserts the full section against the independent reference,
 * not a single token.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import {
  compareSignatures,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
} from '../renderingAudit'

const SECTION = ${JSON.stringify(section)}

describe(${JSON.stringify(`full section ${modelId} ${promptName} ${title}`)}, () => {
  it('renders the whole heading range', () => {
    expect(SECTION.trim().length).toBeGreaterThan(0)
    const reference = signatureFromHtml(renderReferenceHtml(SECTION))
    const { container } = render(<LatexRenderer modelId=${JSON.stringify(modelId)}>{SECTION}</LatexRenderer>)
    const actual = signatureFromElement(container.querySelector('.latex-content') as HTMLElement)
    const result = compareSignatures(reference, actual)
    expect(result.pass, JSON.stringify(result.diffs, null, 2)).toBe(true)
  })
})
`
}

async function main() {
  const spec = argValue('cell')
  if (!spec) {
    console.error('Usage: npm run triage -- --cell=<model>:<prompt>')
    process.exit(1)
  }
  const cell = await findSavedCell(spec)
  const sections = splitHeadingSections(cell.response)
  const vite = await launchVite()
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', EVIDENCE_VIEW)
    let chosen = sections[0]
    let best = -1
    let reference = ''
    let ours = ''
    for (const section of sections) {
      const ref = await referenceHtml(section.markdown)
      await renderOnPage(page, cell.modelId, section.markdown, `triage-${section.index}`)
      const html = await readRenderedHtml(page)
      const score = textDelta(visibleText(ref), visibleText(html))
      if (score > best) {
        best = score
        chosen = section
        reference = ref
        ours = html
      }
    }
    const folder = path.join(
      __dirname,
      'triage-out',
      `${cell.modelId.replace(/[^a-z0-9.-]+/gi, '_')}__${cell.promptName}`
    )
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, 'section.md'), chosen.markdown)
    await fs.writeFile(path.join(folder, 'reference.html'), reference)
    await fs.writeFile(path.join(folder, 'ours.html'), ours)
    await fs.writeFile(
      path.join(folder, 'diff.patch'),
      unifiedDiff(reference, ours, 'reference.html', 'ours.html')
    )
    await renderOnPage(page, cell.modelId, chosen.markdown, 'triage-shot')
    await shootContainer(page, path.join(folder, 'screenshot.png'))
    await fs.writeFile(
      path.join(folder, 'regression.test.tsx'),
      regressionStub(cell.modelId, cell.promptName, chosen.text, chosen.markdown)
    )
    console.log(`Wrote ${folder}`)
    console.log(`Section: ${chosen.text || '(whole reply)'} (${chosen.markdown.length} chars, text delta ${best})`)
  } finally {
    await browser.close()
    vite.stop()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
