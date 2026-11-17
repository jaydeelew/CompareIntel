#!/usr/bin/env node
/**
 * Render all unique saved cells on two frontend/src refs and compare output.
 * Usage:
 *   npx tsx scripts/render-all-cells-compare.ts --base=93f92ba2 --head=HEAD
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type Browser, type Page } from 'playwright'
import { JSDOM } from 'jsdom'
import { findVisibleRawLatexCommands } from '../../frontend/src/utils/latex/undelimitedProseLatex.ts'
import { openThemedPage, renderOnPage } from '../captures.js'
import { launchVite, type ViteProcess } from '../launch-vite.js'
import { loadUniqueSavedCells, type SavedCell } from '../saved-cells.js'

const harnessRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(harnessRoot, '..')

function argValue(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function git(args: string[]) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim()
}

function materialize(ref: string): { dir: string; frontendSrc: string; sha: string } {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-compare-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nm = path.join(repoRoot, 'node_modules')
  if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(nm, path.join(dir, 'node_modules'))
  return { dir, frontendSrc: path.join(dir, 'frontend', 'src'), sha }
}

function cleanupWorktree(dir: string) {
  try {
    git(['worktree', 'remove', '--force', dir])
  } catch {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function visibleProseOutsideCodeFromHtml(fragment: string): string {
  const dom = new JSDOM(`<!doctype html><body>${fragment}</body>`)
  const container = dom.window.document.body
  const clone = container.cloneNode(true) as Element
  clone
    .querySelectorAll(
      '.katex, .katex-mathml, pre, code, annotation, .code-block, .code-block-direct, .preformatted-text'
    )
    .forEach(node => node.remove())
  return (clone.textContent || '').replace(/\s+/g, ' ').trim()
}

function rawLatexMarkers(fragment: string): string[] {
  return findVisibleRawLatexCommands(visibleProseOutsideCodeFromHtml(fragment))
}

async function readRenderMetrics(page: Page): Promise<{
  visible: string
  texKey: string
  html: string
  rawMarkers: string[]
}> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-render-container]')
    if (!container) {
      return { visible: '', texKey: '', html: '', rawMarkers: [] as string[] }
    }
    const html = container.innerHTML
    const clone = container.cloneNode(true) as Element
    clone.querySelectorAll('.katex-mathml').forEach(n => n.remove())
    const visible = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    const tex = Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]'))
      .map(n => n.textContent ?? '')
      .sort()
      .join('\x1f')
    return { visible, texKey: tex, html, rawMarkers: [] as string[] }
  }).then(m => ({
    ...m,
    rawMarkers: rawLatexMarkers(m.html),
  }))
}

type CellMetrics = Awaited<ReturnType<typeof readRenderMetrics>> & { skipped?: string }

async function renderCells(
  frontendSrc: string,
  cells: SavedCell[],
  port: number,
  browser: Browser
): Promise<Map<string, CellMetrics>> {
  const vite = await launchVite({ port, frontendSrc })
  const out = new Map<string, CellMetrics>()
  try {
    const page = await openThemedPage(browser, port, 'light', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
    })
    for (const cell of cells) {
      const key = `${cell.modelId}:${cell.promptName}`
      if (cell.emptyVisible || cell.truncated || cell.error) {
        out.set(key, { visible: '', texKey: '', html: '', rawMarkers: [], skipped: cell.error ?? 'empty/truncated' })
        continue
      }
      try {
        await renderOnPage(page, cell.modelId, cell.response, `cmp-${key}`)
        out.set(key, await readRenderMetrics(page))
      } catch (err) {
        out.set(key, { visible: '', texKey: '', html: '', rawMarkers: [], skipped: String(err) })
      }
    }
    await page.close()
  } finally {
    vite.stop()
  }
  return out
}

function excerpt(response: string, needle?: string): string {
  const lines = response.split('\n')
  if (needle) {
    const line = lines.find(l => l.includes(needle) || (needle.startsWith('\\') && l.includes(needle.slice(0, 6))))
    if (line) return line.trim().slice(0, 160)
  }
  for (const line of lines) {
    if (/\\(?:sqrt|frac|pi|theta)\b/.test(line) && !line.trim().startsWith('```')) return line.trim().slice(0, 160)
  }
  return lines[0]?.trim().slice(0, 120) ?? ''
}

async function main() {
  const baseRef = argValue('base') ?? '93f92ba2'
  const headRef = argValue('head') ?? 'HEAD'
  const outPath =
    argValue('out') ?? path.join(harnessRoot, 'render-all-cells-compare.json')

  const cells = await loadUniqueSavedCells()
  const base = materialize(baseRef)
  const headSha = git(['rev-parse', '--verify', headRef])
  const headSrc = headRef === 'HEAD' ? path.join(repoRoot, 'frontend', 'src') : materialize(headRef).frontendSrc

  const browser = await chromium.launch()
  try {
    const baseMap = await renderCells(base.frontendSrc, cells, 5181, browser)
    const headMap = await renderCells(headSrc, cells, 5182, browser)

    const changed: Array<Record<string, unknown>> = []
    let baseDomFlag = 0
    let headDomFlag = 0
    let compared = 0

    for (const cell of cells) {
      const key = `${cell.modelId}:${cell.promptName}`
      const b = baseMap.get(key)!
      const h = headMap.get(key)!
      if (b.skipped || h.skipped) continue
      compared++
      if (b.rawMarkers.length > 0) baseDomFlag++
      if (h.rawMarkers.length > 0) headDomFlag++
      const same = b.visible === h.visible && b.texKey === h.texKey
      if (same) continue
      const addedTex = h.texKey.split('\x1f').filter(t => t && !b.texKey.split('\x1f').includes(t))
      const removedRaw =
        b.rawMarkers.length > 0 && h.rawMarkers.length === 0
          ? b.rawMarkers
          : h.rawMarkers.length < b.rawMarkers.length
            ? b.rawMarkers.filter(m => !h.rawMarkers.includes(m))
            : []
      changed.push({
        key,
        modelId: cell.modelId,
        promptName: cell.promptName,
        excerpt: excerpt(cell.response, addedTex[0]?.slice(0, 8)),
        baseRaw: b.rawMarkers,
        headRaw: h.rawMarkers,
        addedTex: addedTex.slice(0, 5),
        visibleBefore: b.visible.slice(0, 200),
        visibleAfter: h.visible.slice(0, 200),
        reason:
          removedRaw.length > 0 || (b.rawMarkers.length && !h.rawMarkers.length)
            ? `Undelimited LaTeX in source rendered as KaTeX (was visible: ${b.rawMarkers.join(', ') || 'text change'})`
            : addedTex.length
              ? `New inline math: ${addedTex.join('; ')}`
              : 'Visible text or TeX sources changed',
      })
    }

    const report = {
      baseSha: base.sha,
      headSha,
      totalCells: cells.length,
      compared,
      changedCount: changed.length,
      baseDomRawLatexCells: baseDomFlag,
      headDomRawLatexCells: headDomFlag,
      changed,
    }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ ...report, changed: undefined, changedSample: changed.slice(0, 3) }, null, 2))
    console.error(`Wrote ${outPath} (${changed.length} changed, DOM flags base=${baseDomFlag} head=${headDomFlag})`)
  } finally {
    await browser.close()
    cleanupWorktree(base.dir)
    if (headRef !== 'HEAD' && headSrc.includes('harness-compare')) cleanupWorktree(path.dirname(headSrc.replace('/frontend/src', '')))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})