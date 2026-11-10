#!/usr/bin/env node
/**
 * Three-frame phone captures for results-section overflow fix.
 * 390 CSS px × DPR 3 (1170 physical px wide). Band around probed wide element.
 */
import fs from 'fs'
import path from 'path'
import { chromium, type Page } from 'playwright'
import { PHONE_VIEW, openThemedPage, renderOnPage } from '../captures.js'
import { launchVite } from '../launch-vite.js'
import { findSavedCell } from '../saved-cells.js'
import { stackPhoneTriple } from '../phone-stack-triple.js'
import {
  captureClipTargetViewportBand,
  probeWideContentClip,
  rawSourceExcerptForProbe,
  scrollClipTargetToEnd,
} from '../../frontend/e2e/helpers/harnessKatexOverflow.ts'

const artifactRoot = process.env.ARTIFACT_ROOT || '/opt/cursor/artifacts'

const REPRESENTATIVE: Array<{ modelId: string; promptName: string; slug: string; label: string }> = [
  {
    modelId: 'google/gemini-3.8-flash',
    promptName: '05-complex-scenarios',
    slug: 'google-gemini-3-8-flash-05-complex-scenarios',
    label: 'google/gemini-3.8-flash · 05-complex-scenarios',
  },
  {
    modelId: 'anthropic/claude-opus-5',
    promptName: '04-mixed-markdown-latex',
    slug: 'anthropic-claude-opus-5-04-mixed-markdown-latex',
    label: 'anthropic/claude-opus-5 · 04-mixed-markdown-latex',
  },
  {
    modelId: 'minimax/minimax-m3.1-flash',
    promptName: '05-complex-scenarios',
    slug: 'minimax-minimax-m3-1-flash-05-complex-scenarios',
    label: 'minimax/minimax-m3.1-flash · 05-complex-scenarios',
  },
]

const BROKEN_SECTION_CSS = `
.results-section {
  overflow-x: hidden !important;
}
`

async function applyBrokenSectionClip(page: Page): Promise<void> {
  await page.addStyleTag({ content: BROKEN_SECTION_CSS, id: 'broken-section-overflow' })
  await page.evaluate(() => document.fonts.ready)
}

async function clearBrokenSectionClip(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('broken-section-overflow')?.remove())
}

async function captureCell(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  vitePort: number,
  tmp: string,
  cell: (typeof REPRESENTATIVE)[number],
  content: string
): Promise<void> {
  const beforePage = await openThemedPage(browser, vitePort, 'light', PHONE_VIEW)
  const afterPage = await openThemedPage(browser, vitePort, 'light', PHONE_VIEW)

  await renderOnPage(beforePage, cell.modelId, content, `${cell.slug}:before`)
  await applyBrokenSectionClip(beforePage)
  const probeBefore = await probeWideContentClip(beforePage)
  if (!probeBefore.clipped) {
    throw new Error(`BEFORE did not clip for ${cell.label}: ${JSON.stringify(probeBefore)}`)
  }
  const beforePath = path.join(tmp, `${cell.slug}-before.png`)
  fs.writeFileSync(beforePath, await captureClipTargetViewportBand(beforePage, probeBefore))
  await beforePage.close()

  await renderOnPage(afterPage, cell.modelId, content, `${cell.slug}:after`)
  await clearBrokenSectionClip(afterPage)
  const probeAfter = await probeWideContentClip(afterPage)
  if (probeAfter.clipped) {
    throw new Error(`AFTER still clipped for ${cell.label}: ${JSON.stringify(probeAfter)}`)
  }
  const afterPath = path.join(tmp, `${cell.slug}-after.png`)
  fs.writeFileSync(afterPath, await captureClipTargetViewportBand(afterPage, probeBefore))
  await scrollClipTargetToEnd(afterPage, probeBefore)
  const afterScrolledPath = path.join(tmp, `${cell.slug}-after-scrolled.png`)
  fs.writeFileSync(afterScrolledPath, await captureClipTargetViewportBand(afterPage, probeBefore))
  await afterPage.close()

  const source = rawSourceExcerptForProbe(probeBefore, content)
  const outPath = path.join(
    artifactRoot,
    `mobile-${cell.slug}-section-overflow-before-after-stacked.png`
  )

  const stacker = await chromium.launch()
  const stackCtx = await stacker.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 3,
  })
  const stackPage = await stackCtx.newPage()
  await stackPhoneTriple(stackPage, {
    beforePng: beforePath,
    afterPng: afterPath,
    afterScrolledPng: afterScrolledPath,
    cellTitle: cell.label,
    beforeLabel: 'BEFORE — .results-section overflow-x: hidden clips wide content',
    afterLabel: 'AFTER — scrollable box at start',
    afterScrolledLabel: 'AFTER — scrolled to reveal right side',
    sourceExcerpt: source,
    outputPath: outPath,
  })
  await stackCtx.close()
  await stacker.close()

  fs.writeFileSync(
    path.join(artifactRoot, `mobile-${cell.slug}-section-overflow-source-excerpt.txt`),
    `${source}\n`
  )
  console.log(outPath)
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const tmp = path.join(artifactRoot, 'tmp-section-overflow-band')
  fs.mkdirSync(tmp, { recursive: true })
  const vite = await launchVite()
  const browser = await chromium.launch()
  try {
    for (const cell of REPRESENTATIVE) {
      const saved = await findSavedCell(`${cell.modelId}:${cell.promptName}`)
      await captureCell(browser, vite.port, tmp, cell, saved.response)
    }
  } finally {
    await browser.close()
    vite.stop()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
