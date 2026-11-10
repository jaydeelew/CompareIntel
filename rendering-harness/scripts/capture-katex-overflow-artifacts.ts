/**
 * Full-width result-card before/after captures at 390 CSS px (DPR 3).
 * Requires harness on :5174. Regenerate stacks:
 *   npx tsx scripts/capture-katex-overflow-artifacts.ts
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { chromium, type Page } from 'playwright'

import {
  ARTIFACT_REPRESENTATIVE_CELLS,
  applyBeforeClipCss,
  captureCardFullViewport,
  loadHarnessResponse,
  openHarnessWithContent,
  probeWideContentClip,
  scrollClipTargetToEnd,
  texExcerptFromProbe,
  type ClipProbe,
} from '../../frontend/e2e/helpers/harnessKatexOverflow'

const artifactRoot = process.env.ARTIFACT_ROOT || '/opt/cursor/artifacts'
const harnessBase = process.env.HARNESS_BASE_URL || 'http://127.0.0.1:5174'

function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function renderCell(page: Page, modelId: string, content: string): Promise<void> {
  await openHarnessWithContent(page, harnessBase, modelId, content)
}

async function stackCellComposite(
  page: Page,
  cellLabel: string,
  slug: string,
  before: Buffer,
  after: Buffer,
  afterScrolled: Buffer,
  source: string,
  outPath: string
): Promise<void> {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}
    body{margin:0;width:390px;font-family:system-ui,sans-serif;background:#fff;color:#111}
    .label{font-size:22px;font-weight:800;line-height:1.2;padding:10px 8px 6px;background:#fef3c7;color:#78350f;border-top:3px solid #f59e0b}
    .label.after{background:#dcfce7;color:#14532d;border-top-color:#22c55e}
    .label.after-scroll{background:#e0f2fe;color:#0c4a6e;border-top-color:#0ea5e9}
    .label.cell{padding:12px 8px;background:#1e293b;color:#f8fafc;font-size:18px;border-top:none}
    img{display:block;width:390px;height:auto;margin:0}
    pre{margin:0;padding:10px 8px 14px;font-size:11px;line-height:1.35;white-space:pre-wrap;word-break:break-word;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:ui-monospace,monospace}
  </style></head><body>
    <div class="label cell">${esc(cellLabel)} · 390px CSS · DPR 3</div>
    <div class="label">BEFORE — equation clipped at card edge</div>
    <img alt="before" src="data:image/png;base64,${before.toString('base64')}" />
    <div class="label after">AFTER — scrollable box (start)</div>
    <img alt="after" src="data:image/png;base64,${after.toString('base64')}" />
    <div class="label after-scroll">AFTER — scrolled to reveal right side</div>
    <img alt="after-scrolled" src="data:image/png;base64,${afterScrolled.toString('base64')}" />
    <pre>${esc(source)}</pre>
  </body></html>`)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 390, height: Math.min(height, 8000) })
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 390, height } })
}

async function capturePhasesForCell(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  slug: string,
  cellLabel: string,
  modelId: string,
  content: string
): Promise<{ source: string; probeBefore: ClipProbe }> {
  const pageOpts = { deviceScaleFactor: 3, viewport: { width: 390, height: 900 } } as const

  const beforePage = await browser.newPage(pageOpts)
  await renderCell(beforePage, modelId, content)
  await applyBeforeClipCss(beforePage)
  const probeBefore = await probeWideContentClip(beforePage)
  if (!probeBefore.clipped) {
    await beforePage.close()
    throw new Error(`BEFORE did not clip for ${cellLabel}: ${JSON.stringify(probeBefore)}`)
  }
  const beforeShot = await captureCardFullViewport(beforePage)
  await beforePage.close()

  const afterPage = await browser.newPage(pageOpts)
  await renderCell(afterPage, modelId, content)
  const probeAfter = await probeWideContentClip(afterPage)
  if (probeAfter.clipped) {
    await afterPage.close()
    throw new Error(`AFTER still reports clip for ${cellLabel}: ${JSON.stringify(probeAfter)}`)
  }
  const afterShot = await captureCardFullViewport(afterPage)
  await scrollClipTargetToEnd(afterPage, probeBefore)
  const afterScrolledShot = await captureCardFullViewport(afterPage)
  await afterPage.close()

  const source = texExcerptFromProbe(probeBefore, content)
  const stacker = await chromium.launch()
  const stackPage = await stacker.newPage()
  const stackedPath = path.join(artifactRoot, `mobile-${slug}-before-after-stacked.png`)
  await stackCellComposite(
    stackPage,
    cellLabel,
    slug,
    beforeShot,
    afterShot,
    afterScrolledShot,
    source,
    stackedPath
  )
  await stacker.close()

  fs.writeFileSync(path.join(artifactRoot, `mobile-${slug}-source-excerpt.txt`), `${source}\n`, 'utf-8')
  console.log(stackedPath)
  return { source, probeBefore }
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const browser = await chromium.launch()

  for (const cell of ARTIFACT_REPRESENTATIVE_CELLS) {
    const slug = slugFromLabel(cell.label)
    const { modelId, content } = loadHarnessResponse(cell.jsonPath)
    await capturePhasesForCell(browser, slug, cell.label, modelId, content)
  }

  await browser.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
