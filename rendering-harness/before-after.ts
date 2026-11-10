#!/usr/bin/env node
/**
 * Render one saved cell's affected section at two git refs and stack them.
 *
 *   npm run before-after -- --cell=<model>:<prompt> --base=<ref> --head=<ref>
 *
 * The harness shell stays on this checkout. Each ref's frontend/src is what
 * LatexRenderer and the results styles come from. Output is one 960 CSS px
 * DPR 2 image, Before above After, with the full heading range and no crop.
 * No OpenRouter calls.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { EVIDENCE_VIEW, openThemedPage, readRenderedHtml, renderOnPage, shootContainer } from './captures.js'
import { launchVite, type ViteProcess } from './launch-vite.js'
import { findSavedCell } from './saved-cells.js'
import { splitHeadingSections } from './section-slice.js'
import { stackBeforeAfter } from './stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function git(args: string[]) {
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

function cleanup(dir: string) {
  try {
    git(['worktree', 'remove', '--force', dir])
  } catch {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function renderSections(
  vite: ViteProcess,
  modelId: string,
  sections: Array<{ index: number; markdown: string }>
): Promise<string[]> {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', EVIDENCE_VIEW)
    const html: string[] = []
    for (const section of sections) {
      await renderOnPage(page, modelId, section.markdown, `cmp-${section.index}`)
      html.push(await readRenderedHtml(page))
    }
    return html
  } finally {
    await browser.close()
  }
}

async function shootSection(vite: ViteProcess, modelId: string, markdown: string, outputPath: string) {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', EVIDENCE_VIEW)
    await renderOnPage(page, modelId, markdown, 'shot')
    await shootContainer(page, outputPath)
  } finally {
    await browser.close()
  }
}

async function main() {
  const spec = argValue('cell')
  const baseRef = argValue('base')
  const headRef = argValue('head')
  if (!spec || !baseRef || !headRef) {
    console.error('Usage: npm run before-after -- --cell=<model>:<prompt> --base=<ref> --head=<ref>')
    process.exit(1)
  }
  const cell = await findSavedCell(spec)
  const sections = splitHeadingSections(cell.response)
  const base = materialize(baseRef)
  const head = materialize(headRef)
  const outDir = path.join(
    __dirname,
    'triage-out',
    `${cell.modelId.replace(/[^a-z0-9.-]+/gi, '_')}__${cell.promptName}`
  )
  fs.mkdirSync(outDir, { recursive: true })
  try {
    const baseVite = await launchVite({ port: 5175, frontendSrc: base.frontendSrc })
    let baseHtml: string[] = []
    try {
      baseHtml = await renderSections(baseVite, cell.modelId, sections)
    } finally {
      baseVite.stop()
    }
    const headVite = await launchVite({ port: 5175, frontendSrc: head.frontendSrc })
    let headHtml: string[] = []
    let chosen = 0
    try {
      headHtml = await renderSections(headVite, cell.modelId, sections)
      let best = 0
      let anyChanged = false
      for (let i = 0; i < sections.length; i++) {
        const changed = visibleText(baseHtml[i] || '') !== visibleText(headHtml[i] || '')
        if (!changed) continue
        anyChanged = true
        const score = Math.abs(visibleText(baseHtml[i] || '').length - visibleText(headHtml[i] || '').length) + 1
        if (score > best) {
          best = score
          chosen = i
        }
      }
      const sectionMarkdown = anyChanged ? sections[chosen].markdown : cell.response
      if (!anyChanged) chosen = -1
      await shootSection(headVite, cell.modelId, sectionMarkdown, path.join(outDir, 'after.png'))
    } finally {
      headVite.stop()
    }
    const baseAgain = await launchVite({ port: 5175, frontendSrc: base.frontendSrc })
    try {
      const sectionMarkdown = chosen >= 0 ? sections[chosen].markdown : cell.response
      await shootSection(baseAgain, cell.modelId, sectionMarkdown, path.join(outDir, 'before.png'))
    } finally {
      baseAgain.stop()
    }
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({
        viewport: { width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height },
        deviceScaleFactor: EVIDENCE_VIEW.deviceScaleFactor,
      })
      const page = await context.newPage()
      const output = path.join(outDir, 'before-after.png')
      await stackBeforeAfter(page, {
        beforePng: path.join(outDir, 'before.png'),
        afterPng: path.join(outDir, 'after.png'),
        beforeLabel: `Before ${baseRef}`,
        afterLabel: `After ${headRef}`,
        outputPath: output,
      })
      console.log(`Wrote ${output}`)
      console.log(`Section: ${chosen >= 0 ? sections[chosen].text || '(whole reply)' : '(whole reply, refs match)'}`)
      console.log(`Base ${base.sha.slice(0, 12)}  Head ${head.sha.slice(0, 12)}`)
    } finally {
      await browser.close()
    }
  } finally {
    cleanup(base.dir)
    cleanup(head.dir)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
