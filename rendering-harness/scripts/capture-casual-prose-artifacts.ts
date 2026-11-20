/**
 * Before/after stacked screenshots for google/gemini-4-hydrogen 08-casual-prose.
 *   npx tsx scripts/capture-casual-prose-artifacts.ts --base=origin/master
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  EVIDENCE_VIEW,
  PHONE_VIEW,
  openThemedPage,
  renderOnPage,
  shootContainer,
} from '../captures.js'
import { launchVite, type ViteProcess } from '../launch-vite.js'
import { stackBeforeAfter } from '../stack-shot.js'
import { stackPhoneBeforeAfter } from '../phone-stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const FIXTURE = path.join(
  REPO,
  'rendering-harness/fixtures/google_gemini-4-hydrogen_08-casual-prose.json'
)
const MODEL = 'google/gemini-4-hydrogen'

function argValue(name: string): string | undefined {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function git(args: string[]) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' }).trim()
}

function materialize(ref: string): { dir: string; sha: string; frontendSrc: string } {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casual-prose-ref-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nodeModules = path.join(REPO, 'node_modules')
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'))
  }
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
  outputPath: string,
  response: string
) {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', view)
    await renderOnPage(page, MODEL, response, 'casual-prose-08')
    await shootContainer(page, outputPath)
  } finally {
    await browser.close()
  }
}

async function main() {
  const baseRef = argValue('base') || 'origin/master'
  const outDir = argValue('out') || '/opt/cursor/artifacts'
  fs.mkdirSync(outDir, { recursive: true })
  const response = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).response as string
  const excerpt = response.slice(0, 280).replace(/\n/g, ' ') + '…'
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'casual-prose-shots-'))
  const base = materialize(baseRef)
  const headSrc = path.join(REPO, 'frontend', 'src')
  const headSha = git(['rev-parse', 'HEAD'])
  try {
    const baseVite = await launchVite({ port: 5180, frontendSrc: base.frontendSrc })
    try {
      await shoot(baseVite, PHONE_VIEW, path.join(work, 'before-phone.png'), response)
      await shoot(baseVite, EVIDENCE_VIEW, path.join(work, 'before-960.png'), response)
    } finally {
      baseVite.stop()
    }
    const headVite = await launchVite({ port: 5181, frontendSrc: headSrc })
    try {
      await shoot(headVite, PHONE_VIEW, path.join(work, 'after-phone.png'), response)
      await shoot(headVite, EVIDENCE_VIEW, path.join(work, 'after-960.png'), response)
    } finally {
      headVite.stop()
    }
    const browser = await chromium.launch()
    try {
      const phonePage = await (
        await browser.newContext({
          viewport: { width: 800, height: 2200 },
          deviceScaleFactor: 1,
        })
      ).newPage()
      const phoneOut = path.join(outDir, 'hydrogen-08-casual-prose-390-before-after.png')
      await stackPhoneBeforeAfter(phonePage, {
        beforePng: path.join(work, 'before-phone.png'),
        afterPng: path.join(work, 'after-phone.png'),
        beforeLabel: `BEFORE · ${base.sha.slice(0, 12)} · 390 CSS px · DPR 3`,
        afterLabel: `AFTER · ${headSha.slice(0, 12)} · 390 CSS px · DPR 3`,
        sourceExcerpt: excerpt,
        outputPath: phoneOut,
      })
      const widePage = await (
        await browser.newContext({
          viewport: { width: 1000, height: 3000 },
          deviceScaleFactor: 1,
        })
      ).newPage()
      const wideOut = path.join(outDir, 'hydrogen-08-casual-prose-960-before-after.png')
      await stackBeforeAfter(widePage, {
        beforePng: path.join(work, 'before-960.png'),
        afterPng: path.join(work, 'after-960.png'),
        beforeLabel: `BEFORE · ${base.sha.slice(0, 12)} · 960 CSS px · DPR 2`,
        afterLabel: `AFTER · ${headSha.slice(0, 12)} · 960 CSS px · DPR 2`,
        sourceExcerpt: excerpt,
        outputPath: wideOut,
      })
      console.log(JSON.stringify({ phoneOut, wideOut, baseSha: base.sha, headSha }, null, 2))
    } finally {
      await browser.close()
    }
  } finally {
    cleanup(base.dir)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})