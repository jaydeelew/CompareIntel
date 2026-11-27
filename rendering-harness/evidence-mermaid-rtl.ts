/**
 * Evidence and render-only regression check for mermaid fences and RTL blocks.
 *
 * Renders every unique saved cell on master and on this checkout (no OpenRouter
 * calls). Text is compared after SVG removal and whitespace collapsing, so a
 * diagram's drawn labels are not a diff. Then stacks Before (master) above
 * After for the mermaid section and the RTL section of openai/gpt-6.2-astra
 * prompt 06, at 960 CSS px / DPR 2 and 390 CSS px / DPR 3, light theme.
 *
 *   npx tsx evidence-mermaid-rtl.ts
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type Browser, type Page } from 'playwright'
import {
  EVIDENCE_VIEW,
  PHONE_VIEW,
  openThemedPage,
  renderOnPage,
  shootContainer,
} from './captures.js'
import { launchVite, type ViteProcess } from './launch-vite.js'
import { loadUniqueSavedCells } from './saved-cells.js'
import { sectionByHeading } from './section-slice.js'
import { stackBeforeAfter } from './stack-shot.js'
import { stackPhoneBeforeAfter } from './phone-stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(__dirname, 'evidence', 'mermaid-rtl')
const CELL = 'openai/gpt-6.2-astra:06-edge-cases-boundaries'

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' }).trim()
}

function materialize(ref: string): { dir: string; sha: string; frontendSrc: string } {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ref-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nodeModules = path.join(REPO, 'node_modules')
  fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'))
  const frontendModules = path.join(dir, 'frontend', 'node_modules')
  if (!fs.existsSync(frontendModules)) fs.symlinkSync(nodeModules, frontendModules)
  return { dir, sha, frontendSrc: path.join(dir, 'frontend', 'src') }
}

function normalizedText(html: string): string {
  return html
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readText(page: Page): Promise<string> {
  const html = await page.evaluate(
    () => document.querySelector('[data-render-container]')?.innerHTML || ''
  )
  return normalizedText(html)
}

async function main() {
  const base = materialize('master')
  const headSha = git(['rev-parse', 'HEAD'])
  fs.mkdirSync(OUT, { recursive: true })
  const baseVite = await launchVite({ port: 5175, frontendSrc: base.frontendSrc })
  const headVite = await launchVite({ port: 5176 })
  const browser = await chromium.launch()
  try {
    if (process.env.EVIDENCE_ONLY !== '1') {
      const report = await compareAll(browser, baseVite, headVite, base.sha, headSha)
      const reportPath = path.join(OUT, 'master-render-diff.json')
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
      console.log(
        `compared ${report.cells} cells: ${report.same} same, ${report.differ} differ, ${report.errors} errors`
      )
    }
    await captureEvidence(browser, baseVite, headVite, base.sha, headSha)
  } finally {
    await browser.close()
    baseVite.stop()
    headVite.stop()
    try {
      git(['worktree', 'remove', '--force', base.dir])
    } catch {
      fs.rmSync(base.dir, { recursive: true, force: true })
    }
  }
}

async function compareAll(
  browser: Browser,
  baseVite: ViteProcess,
  headVite: ViteProcess,
  baseSha: string,
  headSha: string
) {
  const cells = await loadUniqueSavedCells()
  const basePage = await openThemedPage(browser, baseVite.port, 'light', EVIDENCE_VIEW)
  const headPage = await openThemedPage(browser, headVite.port, 'light', EVIDENCE_VIEW)
  const diffs: Array<{ cell: string; base: string; head: string }> = []
  const errors: Array<{ cell: string; message: string }> = []
  let same = 0
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const key = `${cell.modelId}:${cell.promptName}`
    try {
      await renderOnPage(basePage, cell.modelId, cell.response, `b-${i}`)
      await renderOnPage(headPage, cell.modelId, cell.response, `h-${i}`)
      const baseText = await readText(basePage)
      const headText = await readText(headPage)
      if (baseText === headText) same += 1
      else {
        diffs.push({
          cell: key,
          base: baseText.slice(0, 400),
          head: headText.slice(0, 400),
        })
      }
    } catch (error) {
      errors.push({ cell: key, message: error instanceof Error ? error.message : String(error) })
    }
    if ((i + 1) % 25 === 0) console.log(`compared ${i + 1}/${cells.length}`)
  }
  await basePage.context().close()
  await headPage.context().close()
  return {
    baseSha,
    headSha,
    comparedAt: new Date().toISOString(),
    normalization: 'svg removed, tags removed, whitespace collapsed',
    cells: cells.length,
    same,
    differ: diffs.length,
    errors: errors.length,
    diffs,
    errorSamples: errors.slice(0, 20),
  }
}

async function captureEvidence(
  browser: Browser,
  baseVite: ViteProcess,
  headVite: ViteProcess,
  baseSha: string,
  headSha: string
) {
  const cells = await loadUniqueSavedCells()
  const cell = cells.find(item => `${item.modelId}:${item.promptName}` === CELL)
  if (!cell) throw new Error(`missing ${CELL}`)
  const gaps = [
    { id: 'mermaid', needle: 'Mermaid', file: 'source-mermaid.txt' },
    { id: 'rtl', needle: 'RTL', file: 'source-rtl.txt' },
  ]
  for (const gap of gaps) {
    const markdown = sectionByHeading(cell.response, gap.needle)
    fs.writeFileSync(path.join(OUT, gap.file), markdown)
    const beforeLabel = `Before · master · ${baseSha}`
    const afterLabel = `After · ${headSha}`
    const shots = [
      { view: EVIDENCE_VIEW, name: `${gap.id}-960-dpr2.png`, stack: 'desktop' as const },
      { view: PHONE_VIEW, name: `${gap.id}-390-dpr3.png`, stack: 'phone' as const },
    ]
    for (const shot of shots) {
      const beforePng = path.join(OUT, `.before-${gap.id}-${shot.stack}.png`)
      const afterPng = path.join(OUT, `.after-${gap.id}-${shot.stack}.png`)
      await shootOne(browser, baseVite.port, shot.view, cell.modelId, markdown, beforePng)
      await shootOne(browser, headVite.port, shot.view, cell.modelId, markdown, afterPng)
      const stackPage = await openThemedPage(browser, headVite.port, 'light', shot.view)
      const outputPath = path.join(OUT, shot.name)
      if (shot.stack === 'desktop') {
        await stackBeforeAfter(stackPage, {
          beforePng,
          afterPng,
          beforeLabel,
          afterLabel,
          sourceExcerpt: markdown.trim(),
          outputPath,
        })
      } else {
        await stackPhoneBeforeAfter(stackPage, {
          beforePng,
          afterPng,
          beforeLabel,
          afterLabel,
          sourceExcerpt: markdown.trim(),
          outputPath,
        })
      }
      await stackPage.context().close()
      fs.rmSync(beforePng, { force: true })
      fs.rmSync(afterPng, { force: true })
      console.log(`wrote ${path.relative(REPO, outputPath)}`)
    }
  }
}

async function shootOne(
  browser: Browser,
  port: number,
  view: { width: number; height: number; deviceScaleFactor: number },
  modelId: string,
  markdown: string,
  outputPath: string
) {
  const page = await openThemedPage(browser, port, 'light', view)
  try {
    await renderOnPage(page, modelId, markdown, 'evidence')
    await shootContainer(page, outputPath)
  } finally {
    await page.context().close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
