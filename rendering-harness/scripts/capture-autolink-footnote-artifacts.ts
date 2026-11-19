/**
 * Before/after autolink + GFM footnote fixes (bugs 31–32).
 * Phone 390 CSS px DPR 3; wide 960 CSS px DPR 2 — content-trimmed shots, stacked.
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
import { stackPhoneBeforeAfter } from '../phone-stack-shot.js'
import { stackBeforeAfter } from '../stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const MODEL = '__default__'

const SECTIONS = [
  {
    slug: 'autolink-02-markdown',
    markdown: `## Nested blockquote, autolink, bare URL, and a footnote

Autolink: <https://example.com/lab-autolink>
Bare URL: https://example.com/lab-bare-url/with/path
The method needs a citation[^fmt2].

[^fmt2]: Recorded in the lab notebook, page 12.`,
    excerpt: `## Nested blockquote, autolink, bare URL, and a footnote

Autolink: <https://example.com/lab-autolink>
Bare URL: https://example.com/lab-bare-url/with/path
The method needs a citation[^fmt2].

[^fmt2]: Recorded in the lab notebook, page 12.`,
  },
  {
    slug: 'footnote-07-rare',
    markdown: `The boiling point needs a citation[^rare].

[^rare]: Measured at standard pressure, 100 degrees Celsius.`,
    excerpt: `The boiling point needs a citation[^rare].

[^rare]: Measured at standard pressure, 100 degrees Celsius.`,
  },
] as const

function argValue(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function git(args: string[]) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf-8' }).trim()
}

function materialize(ref: string) {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autolink-fn-ref-'))
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
  outputPath: string,
  markdown: string,
  label: string
) {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', view)
    await renderOnPage(page, MODEL, markdown, label)
    await shootContainer(page, outputPath)
  } finally {
    await browser.close()
  }
}

async function capturePair(
  baseRef: string,
  outDir: string,
  section: (typeof SECTIONS)[number],
  work: string,
  portBase: number
) {
  const base = materialize(baseRef)
  const headSha = git(['rev-parse', 'HEAD'])
  try {
    const baseVite = await launchVite({ port: portBase, frontendSrc: base.frontendSrc })
    try {
      await shoot(baseVite, PHONE_VIEW, path.join(work, 'before-phone.png'), section.markdown, section.slug)
      await shoot(baseVite, EVIDENCE_VIEW, path.join(work, 'before-960.png'), section.markdown, section.slug)
    } finally {
      baseVite.stop()
    }
    const headVite = await launchVite({
      port: portBase + 1,
      frontendSrc: path.join(REPO, 'frontend', 'src'),
    })
    try {
      await shoot(headVite, PHONE_VIEW, path.join(work, 'after-phone.png'), section.markdown, section.slug)
      await shoot(headVite, EVIDENCE_VIEW, path.join(work, 'after-960.png'), section.markdown, section.slug)
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
      const phoneOut = path.join(outDir, `${section.slug}-390-before-after.png`)
      await stackPhoneBeforeAfter(phonePage, {
        beforePng: path.join(work, 'before-phone.png'),
        afterPng: path.join(work, 'after-phone.png'),
        outputPath: phoneOut,
        beforeLabel: `BEFORE (master ${base.sha.slice(0, 7)}) · 390 CSS px · DPR 3`,
        afterLabel: `AFTER (${headSha.slice(0, 7)}) · 390 CSS px · DPR 3`,
        sourceExcerpt: section.excerpt,
      })

      const wideContext = await browser.newContext({
        viewport: { width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height },
        deviceScaleFactor: EVIDENCE_VIEW.deviceScaleFactor,
      })
      const widePage = await wideContext.newPage()
      const wideOut = path.join(outDir, `${section.slug}-960-before-after.png`)
      await stackBeforeAfter(widePage, {
        beforePng: path.join(work, 'before-960.png'),
        afterPng: path.join(work, 'after-960.png'),
        outputPath: wideOut,
        beforeLabel: `BEFORE (master ${base.sha.slice(0, 7)}) · 960 CSS px · DPR 2`,
        afterLabel: `AFTER (${headSha.slice(0, 7)}) · 960 CSS px · DPR 2`,
        sourceExcerpt: section.excerpt,
      })
      console.log(wideOut)
      console.log(phoneOut)
    } finally {
      await browser.close()
    }
  } finally {
    cleanup(base.dir)
  }
}

async function main() {
  const baseRef = argValue('base') ?? 'origin/master'
  const outDir = argValue('out') ?? '/opt/cursor/artifacts'
  fs.mkdirSync(outDir, { recursive: true })
  let port = 5190
  for (const section of SECTIONS) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), `autolink-fn-${section.slug}-`))
    await capturePair(baseRef, outDir, section, work, port)
    port += 2
    fs.rmSync(work, { recursive: true, force: true })
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})