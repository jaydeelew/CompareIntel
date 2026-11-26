/**
 * Mid-stream before/after shots. Renders one partial reply with the harness.
 * Master paints the unclosed tail. Head holds it. No model API calls.
 *
 *   npx tsx scripts/capture-streaming-artifacts.ts --base=1f6fa0bd --head=HEAD
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

const harnessRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.resolve(harnessRoot, '..')
const evidenceDir = path.join(harnessRoot, 'evidence', 'streaming')

const PARTIAL = [
  'The quadratic formula is settled.',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  'A diagram is next.',
  '',
  '```mermaid',
  'graph TD',
  '  A-->B',
  '',
  '| Method | Result |',
  '| --- |',
  '',
  '\\[',
  '\\gamma = 1',
  '',
  '\\begin{align}',
  'y &= 2',
].join('\n')

function argValue(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : undefined
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim()
}

function materialize(ref: string): { dir: string; frontendSrc: string; sha: string } {
  const sha = git(['rev-parse', '--verify', ref])
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stream-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nm = path.join(repoRoot, 'node_modules')
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    fs.symlinkSync(nm, path.join(dir, 'node_modules'))
  }
  return { dir, frontendSrc: path.join(dir, 'frontend', 'src'), sha }
}

async function shoot(opts: {
  browser: Awaited<ReturnType<typeof chromium.launch>>
  frontendSrc?: string
  streaming: boolean
  port: number
  viewport: { width: number; height: number; deviceScaleFactor: number }
  outputPath: string
}): Promise<void> {
  const vite: ViteProcess = await launchVite({ port: opts.port, frontendSrc: opts.frontendSrc })
  try {
    const page = await openThemedPage(opts.browser, opts.port, 'light', opts.viewport)
    await renderOnPage(
      page,
      'openai/gpt-4o-mini',
      PARTIAL,
      `stream-${opts.viewport.width}`,
      30_000,
      opts.streaming
    )
    await shootContainer(page, opts.outputPath)
    await page.context().close()
  } finally {
    vite.stop()
  }
}

async function main() {
  const baseRef = argValue('base') ?? '1f6fa0bd'
  const headRef = argValue('head') ?? 'HEAD'
  const base = materialize(baseRef)
  const headSha = git(['rev-parse', '--verify', headRef])
  fs.mkdirSync(evidenceDir, { recursive: true })
  const sourcePath = path.join(evidenceDir, 'source.txt')
  fs.writeFileSync(sourcePath, `${PARTIAL}\n`)

  const before960 = path.join(evidenceDir, 'before-960.png')
  const after960 = path.join(evidenceDir, 'after-960.png')
  const before390 = path.join(evidenceDir, 'before-390.png')
  const after390 = path.join(evidenceDir, 'after-390.png')
  const stack960 = path.join(evidenceDir, 'streaming-960.png')
  const stack390 = path.join(evidenceDir, 'streaming-390.png')

  const browser = await chromium.launch().catch(async err => {
    try {
      git(['worktree', 'remove', '--force', base.dir])
    } catch {
      fs.rmSync(base.dir, { recursive: true, force: true })
    }
    throw err
  })
  try {
    await shoot({
      browser,
      frontendSrc: base.frontendSrc,
      streaming: false,
      port: 5185,
      viewport: EVIDENCE_VIEW,
      outputPath: before960,
    })
    await shoot({
      browser,
      streaming: true,
      port: 5186,
      viewport: EVIDENCE_VIEW,
      outputPath: after960,
    })
    await shoot({
      browser,
      frontendSrc: base.frontendSrc,
      streaming: false,
      port: 5185,
      viewport: PHONE_VIEW,
      outputPath: before390,
    })
    await shoot({
      browser,
      streaming: true,
      port: 5186,
      viewport: PHONE_VIEW,
      outputPath: after390,
    })

    const stackPage = await browser.newPage({
      viewport: { width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height },
      deviceScaleFactor: EVIDENCE_VIEW.deviceScaleFactor,
    })
    const beforeLabel = `Before · base ${base.sha.slice(0, 12)}`
    const afterLabel = `After · head ${headSha.slice(0, 12)}`
    await stackBeforeAfter(stackPage, {
      beforePng: before960,
      afterPng: after960,
      beforeLabel,
      afterLabel,
      sourceExcerpt: PARTIAL,
      outputPath: stack960,
    })
    await stackPage.close()

    const phonePage = await browser.newPage({
      viewport: { width: PHONE_VIEW.width, height: PHONE_VIEW.height },
      deviceScaleFactor: PHONE_VIEW.deviceScaleFactor,
    })
    await stackPhoneBeforeAfter(phonePage, {
      beforePng: before390,
      afterPng: after390,
      beforeLabel,
      afterLabel,
      sourceExcerpt: PARTIAL,
      outputPath: stack390,
    })
    await phonePage.close()
  } finally {
    await browser.close()
    try {
      git(['worktree', 'remove', '--force', base.dir])
    } catch {
      fs.rmSync(base.dir, { recursive: true, force: true })
    }
  }

  console.log(
    JSON.stringify(
      {
        base: base.sha,
        head: headSha,
        source: sourcePath,
        desktop: stack960,
        phone: stack390,
      },
      null,
      2
    )
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
