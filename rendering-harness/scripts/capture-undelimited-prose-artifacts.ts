/**
 * Before/after phone screenshots (390 CSS px, DPR 3) for undelimited \\sqrt{3} prose.
 *   npx tsx scripts/capture-undelimited-prose-artifacts.ts --base=master
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { PHONE_VIEW, openThemedPage, renderOnPage, shootContainer } from '../captures.js'
import { launchVite, type ViteProcess } from '../launch-vite.js'
import { stackPhoneBeforeAfter } from '../phone-stack-shot.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const PARAGRAPH = [
  '(the height is \\sqrt{3}), and the space diagonal of a unit cube is \\sqrt{3}.',
  'tan(60°) = \\sqrt{3} and sin(60°) = \\sqrt{3}/2.',
].join('\n\n')
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undelimited-prose-ref-'))
  git(['worktree', 'add', '--detach', dir, sha])
  const nodeModules = path.join(REPO, 'node_modules')
  if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'))
  return { dir, sha, frontendSrc: path.join(dir, 'frontend', 'src') }
}

function cleanup(dir: string) {
  try {
    git(['worktree', 'remove', '--force', dir])
  } catch {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function shoot(vite: ViteProcess, outputPath: string) {
  const browser = await chromium.launch()
  try {
    const page = await openThemedPage(browser, vite.port, 'light', PHONE_VIEW)
    await renderOnPage(page, MODEL, PARAGRAPH, 'undelimited-prose')
    await shootContainer(page, outputPath)
  } finally {
    await browser.close()
  }
}

async function main() {
  const baseRef = argValue('base') || 'master'
  const outDir = argValue('out') || '/opt/cursor/artifacts'
  fs.mkdirSync(outDir, { recursive: true })
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'undelimited-prose-shots-'))
  const base = materialize(baseRef)
  const headSrc = path.join(REPO, 'frontend', 'src')
  const headSha = git(['rev-parse', 'HEAD'])
  try {
    const baseVite = await launchVite({ port: 5176, frontendSrc: base.frontendSrc })
    try {
      await shoot(baseVite, path.join(work, 'before-phone.png'))
    } finally {
      baseVite.stop()
    }
    const headVite = await launchVite({ port: 5176, frontendSrc: headSrc })
    try {
      await shoot(headVite, path.join(work, 'after-phone.png'))
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
      const phoneOut = path.join(outDir, 'undelimited-sqrt3-prose-phone-before-after.png')
      await stackPhoneBeforeAfter(phonePage, {
        beforePng: path.join(work, 'before-phone.png'),
        afterPng: path.join(work, 'after-phone.png'),
        beforeLabel: `Before ${baseRef}`,
        afterLabel: 'After undelimited prose math',
        sourceExcerpt: PARAGRAPH,
        outputPath: phoneOut,
      })
      console.log(`Wrote ${phoneOut}`)
      console.log(`Base ${base.sha}  Head ${headSha}`)
    } finally {
      await browser.close()
    }
  } finally {
    cleanup(base.dir)
    fs.rmSync(work, { recursive: true, force: true })
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})