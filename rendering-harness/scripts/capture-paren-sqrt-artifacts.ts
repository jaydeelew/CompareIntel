/**
 * Before/after of the Gemma production paragraph.
 *
 * Phone: 390 CSS px, device pixel ratio 3, Before above After, raw source below.
 * Wide: 960 CSS px, device pixel ratio 2, Before above After.
 * No OpenRouter calls. Playwright waits on harness page state.
 *
 *   npx tsx scripts/capture-paren-sqrt-artifacts.ts --base=master
 *
 * After is this checkout (including uncommitted config edits). Before is --base.
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { EVIDENCE_VIEW, PHONE_VIEW, openThemedPage, renderOnPage, shootContainer } from '../captures.js'
import { launchVite, type ViteProcess } from '../launch-vite.js'
import { stackPhoneBeforeAfter } from '../phone-stack-shot.js'
import { stackBeforeAfter } from '../stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const PARAGRAPH =
  'The square root of 2 (\\sqrt{2}) is an irrational number, meaning it cannot be expressed as a simple fraction. Its approximate value is **1.41421356…** The decimal representation goes on forever without repeating.'
const MODEL = 'google/gemma-3-27b-it'

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function git(args: string[]) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' }).trim()
}

function materialize(ref: string): { dir: string; sha: string; frontendSrc: string } {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paren-sqrt-ref-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nodeModules = path.join(REPO, 'node_modules')
  if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'))
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

async function shoot(
  vite: ViteProcess,
  view: { width: number; height: number; deviceScaleFactor: number },
  outputPath: string
) {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', view)
    await renderOnPage(page, MODEL, PARAGRAPH, 'paren-sqrt')
    await shootContainer(page, outputPath)
  } finally {
    await browser.close()
  }
}

async function main() {
  const baseRef = argValue('base') || 'master'
  const outDir = argValue('out') || '/opt/cursor/artifacts'
  fs.mkdirSync(outDir, { recursive: true })
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'paren-sqrt-shots-'))
  const base = materialize(baseRef)
  const headSrc = path.join(REPO, 'frontend', 'src')
  const headSha = git(['rev-parse', 'HEAD'])
  try {
    const baseVite = await launchVite({ port: 5175, frontendSrc: base.frontendSrc })
    try {
      await shoot(baseVite, PHONE_VIEW, path.join(work, 'before-phone.png'))
      await shoot(baseVite, EVIDENCE_VIEW, path.join(work, 'before-960.png'))
    } finally {
      baseVite.stop()
    }
    const headVite = await launchVite({ port: 5175, frontendSrc: headSrc })
    try {
      await shoot(headVite, PHONE_VIEW, path.join(work, 'after-phone.png'))
      await shoot(headVite, EVIDENCE_VIEW, path.join(work, 'after-960.png'))
    } finally {
      headVite.stop()
    }

    const browser = await chromium.launch()
    try {
      const phoneContext = await browser.newContext({
        viewport: { width: PHONE_VIEW.width, height: PHONE_VIEW.height },
        deviceScaleFactor: PHONE_VIEW.deviceScaleFactor,
      })
      const phonePage = await phoneContext.newPage()
      const phoneOut = path.join(outDir, 'gemma-sqrt-paren-phone-before-after.png')
      await stackPhoneBeforeAfter(phonePage, {
        beforePng: path.join(work, 'before-phone.png'),
        afterPng: path.join(work, 'after-phone.png'),
        beforeLabel: `Before ${baseRef}`,
        afterLabel: 'After bare paren math',
        sourceExcerpt: PARAGRAPH,
        outputPath: phoneOut,
      })
      console.log(`Wrote ${phoneOut}`)

      const wideContext = await browser.newContext({
        viewport: { width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height },
        deviceScaleFactor: EVIDENCE_VIEW.deviceScaleFactor,
      })
      const widePage = await wideContext.newPage()
      const wideOut = path.join(outDir, 'gemma-sqrt-paren-960-before-after.png')
      await stackBeforeAfter(widePage, {
        beforePng: path.join(work, 'before-960.png'),
        afterPng: path.join(work, 'after-960.png'),
        beforeLabel: `Before ${baseRef}`,
        afterLabel: 'After bare paren math',
        outputPath: wideOut,
      })
      console.log(`Wrote ${wideOut}`)
      console.log(`Base ${base.sha}  Head ${headSha} (working tree)`)
    } finally {
      await browser.close()
    }
  } finally {
    cleanup(base.dir)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
