#!/usr/bin/env node
/**
 * Offline phone-width and dark-mode audit of the saved harness cells.
 * Does not call OpenRouter. Writes a report and, for failures, 960 CSS px
 * DPR 2 stacked evidence images. Those images are artifacts, not source.
 *
 *   npm run layout-audit
 *   npm run layout-audit -- --limit=8
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type Page } from 'playwright'
import {
  DARK_VIEW,
  EVIDENCE_VIEW,
  PHONE_VIEW,
  openThemedPage,
  renderOnPage,
  shootContainer,
} from './captures.js'
import { collectLayoutIssues, type LayoutIssue } from './layout-checks.js'
import { launchVite } from './launch-vite.js'
import { loadUniqueSavedCells, type SavedCell } from './saved-cells.js'
import { stackBeforeAfter } from './stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'layout-audit')

interface CellFailure {
  modelId: string
  promptName: string
  filePath: string
  issues: LayoutIssue[]
  evidence?: string
}

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function safeName(cell: SavedCell, kind: string): string {
  return `${kind}__${cell.modelId.replace(/[^a-z0-9.-]+/gi, '_')}__${cell.promptName}.png`
}

async function evidenceFor(
  cell: SavedCell,
  issues: LayoutIssue[],
  kind: 'phone' | 'dark',
  pages: { wide: Page; phone: Page; dark: Page; stack: Page }
): Promise<string> {
  const section = cell.response
  const generation = `evidence-${kind}-${Date.now()}`
  const beforePath = path.join(OUT_DIR, 'tmp', `${safeName(cell, kind)}.before.png`)
  const afterPath = path.join(OUT_DIR, 'tmp', `${safeName(cell, kind)}.after.png`)
  const outputPath = path.join(OUT_DIR, 'evidence', safeName(cell, kind))
  await renderOnPage(pages.wide, cell.modelId, section, `${generation}:wide`)
  await shootContainer(pages.wide, beforePath)
  const afterPage = kind === 'phone' ? pages.phone : pages.dark
  await renderOnPage(afterPage, cell.modelId, section, `${generation}:after`)
  await shootContainer(afterPage, afterPath)
  await stackBeforeAfter(pages.stack, {
    beforePng: beforePath,
    afterPng: afterPath,
    beforeLabel: 'Before · 960 CSS px',
    afterLabel: kind === 'phone' ? 'After · 390 CSS px phone' : 'After · dark theme',
    outputPath,
  })
  return path.relative(__dirname, outputPath)
}

async function main() {
  const limitArg = argValue('limit')
  const limit = limitArg ? Number(limitArg) : Infinity
  const cells = await loadUniqueSavedCells()
  const selected = cells.slice(0, Number.isFinite(limit) ? limit : cells.length)
  console.log(`Unique saved cells: ${cells.length}. Auditing ${selected.length}.`)

  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(OUT_DIR, 'evidence'), { recursive: true })

  const vite = await launchVite()
  const browser = await chromium.launch()
  const phoneFailures: CellFailure[] = []
  const darkFailures: CellFailure[] = []
  const errors: Array<{ modelId: string; promptName: string; error: string }> = []
  let rendered = 0
  let skipped = 0

  try {
    const phonePage = await openThemedPage(browser, vite.port, 'light', PHONE_VIEW)
    const darkPage = await openThemedPage(browser, vite.port, 'dark', DARK_VIEW)
    const wide = await openThemedPage(browser, vite.port, 'light', EVIDENCE_VIEW)
    const stackContext = await browser.newContext({
      viewport: { width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height },
      deviceScaleFactor: EVIDENCE_VIEW.deviceScaleFactor,
    })
    const stack = await stackContext.newPage()
    const pages = { wide, phone: phonePage, dark: darkPage, stack }

    for (const cell of selected) {
      if (cell.emptyVisible || cell.error) {
        skipped += 1
        continue
      }
      try {
        const generation = `${cell.modelId}:${cell.promptName}:${rendered}`
        await renderOnPage(phonePage, cell.modelId, cell.response, `${generation}:phone`)
        const phoneFound = await phonePage.evaluate(collectLayoutIssues, 'phone' as const)
        await renderOnPage(darkPage, cell.modelId, cell.response, `${generation}:dark`)
        const darkFound = await darkPage.evaluate(collectLayoutIssues, 'dark' as const)
        rendered += 1
        if (phoneFound.length > 0) {
          const evidence = await evidenceFor(cell, phoneFound, 'phone', pages)
          phoneFailures.push({
            modelId: cell.modelId,
            promptName: cell.promptName,
            filePath: cell.filePath,
            issues: phoneFound,
            evidence,
          })
        }
        if (darkFound.length > 0) {
          const evidence = await evidenceFor(cell, darkFound, 'dark', pages)
          darkFailures.push({
            modelId: cell.modelId,
            promptName: cell.promptName,
            filePath: cell.filePath,
            issues: darkFound,
            evidence,
          })
        }
        if (rendered % 25 === 0) {
          console.log(
            `  ${rendered} rendered, phone failures ${phoneFailures.length}, dark failures ${darkFailures.length}`
          )
        }
      } catch (error) {
        errors.push({ modelId: cell.modelId, promptName: cell.promptName, error: String(error) })
        console.error(`  error ${cell.modelId} ${cell.promptName}: ${error}`)
      }
    }
  } finally {
    await browser.close()
    vite.stop()
  }

  const report = {
    uniqueCells: cells.length,
    audited: selected.length,
    rendered,
    skipped,
    phoneFailureCount: phoneFailures.length,
    darkFailureCount: darkFailures.length,
    errorCount: errors.length,
    phoneFailures,
    darkFailures,
    errors,
  }
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify(
      {
        uniqueCells: report.uniqueCells,
        audited: report.audited,
        rendered,
        skipped,
        phoneFailureCount: phoneFailures.length,
        darkFailureCount: darkFailures.length,
        errorCount: errors.length,
      },
      null,
      2
    )
  )
  if (phoneFailures.length > 0 || darkFailures.length > 0 || errors.length > 0) {
    if (phoneFailures.length > 0) {
      console.error('Phone failures (first 12):')
      for (const row of phoneFailures.slice(0, 12)) {
        for (const issue of row.issues) {
          console.error(`  ${row.modelId} ${row.promptName} [${issue.kind}] ${issue.detail}`)
        }
      }
    }
    if (darkFailures.length > 0) {
      console.error('Dark failures (first 12):')
      for (const row of darkFailures.slice(0, 12)) {
        for (const issue of row.issues) {
          console.error(`  ${row.modelId} ${row.promptName} [${issue.kind}] ${issue.detail}`)
        }
      }
    }
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
