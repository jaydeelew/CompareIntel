/**
 * Captures labeled equation-region screenshots for before/after comparisons.
 * Harness dev server must already be running (default http://127.0.0.1:5174).
 *
 *   HARNESS_BASE_URL=http://127.0.0.1:5175 npx tsx scripts/capture-katex-overflow-artifacts.ts --phase=before
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { chromium, type Page } from 'playwright'

import {
  ARTIFACT_REPRESENTATIVE_CELLS,
  loadHarnessResponse,
  harnessUrl,
  waitForHarnessRender,
} from '../../frontend/e2e/helpers/harnessKatexOverflow'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const artifactRoot = process.env.ARTIFACT_ROOT || '/opt/cursor/artifacts'
const harnessBase = process.env.HARNESS_BASE_URL || 'http://127.0.0.1:5174'
const phase = (process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || 'after') as
  | 'before'
  | 'after'

const MASTER_MOBILE_CLIP_CSS = `
.message-content,
.message-content .result-output {
  overflow-x: hidden !important;
}
@media (max-width: 768px) {
  .result-card {
    overflow-x: hidden !important;
  }
  .results-section {
    overflow-x: hidden !important;
  }
}
`

const DESKTOP_CELL = ARTIFACT_REPRESENTATIVE_CELLS[0]

function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function excerptForDisplayMath(content: string): string {
  const match = content.match(/(\$\$[\s\S]{20,900}?\$\$)/)
  if (match) return match[1].trim()
  const idx = content.indexOf('Edge Case D')
  if (idx >= 0) return content.slice(idx, idx + 700).trim()
  return content.slice(0, 600).trim()
}

/** Smallest markdown slice that still includes the widest `$$` block (fast harness renders). */
function visualCaptureMarkdown(content: string): string {
  const blocks = [...content.matchAll(/\$\$[\s\S]*?\$\$/g)].map(m => m[0])
  const display = blocks.sort((a, b) => b.length - a.length)[0]
  if (!display) return content.slice(0, 3500)
  return ['### Wide display math region', '', display, ''].join('\n')
}

async function cropWidestKatexRegion(page: Page): Promise<Buffer> {
  const box = await page.evaluate(() => {
    const displays = Array.from(document.querySelectorAll('.katex-display')) as HTMLElement[]
    if (displays.length === 0) {
      const card = document.querySelector('.result-card')
      if (!card) return null
      const r = card.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 520) }
    }
    let best = displays[0].getBoundingClientRect()
    for (const el of displays) {
      const r = el.getBoundingClientRect()
      if (r.width > best.width) best = r
    }
    const pad = 12
    return {
      x: Math.max(0, best.x - pad),
      y: Math.max(0, best.y - pad),
      width: best.width + pad * 2,
      height: best.height + pad * 2,
    }
  })
  if (!box) throw new Error('No result card region to capture')
  if (box.width < 8 || box.height < 8) {
    const card = page.locator('.result-card').first()
    return card.screenshot()
  }
  try {
    return await page.screenshot({ clip: box })
  } catch {
    const card = page.locator('.result-card').first()
    return card.screenshot()
  }
}

async function labeledComposite(
  page: Page,
  label: string,
  shot: Buffer,
  outPath: string
): Promise<void> {
  const b64 = shot.toString('base64')
  await page.setViewportSize({ width: 420, height: 2200 })
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc}
    .banner{font-size:30px;font-weight:800;padding:18px 12px;text-align:center;letter-spacing:0.06em}
    img{display:block;width:390px;margin:0 auto;background:#fff}
  </style></head><body>
    <div class="banner">${label}</div>
    <img alt="capture" src="data:image/png;base64,${b64}" />
  </body></html>`)
  await page.screenshot({ path: outPath, fullPage: true })
}

async function openHarnessWithContent(
  page: Page,
  modelId: string,
  content: string
): Promise<void> {
  const useUrl = content.length < 6000
  if (useUrl) {
    await page.goto(`${harnessBase}${harnessUrl(modelId, content)}`)
  } else {
    await page.goto(`${harnessBase}/?modelId=${encodeURIComponent(modelId)}`)
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || ''
        return (
          text.includes('Waiting for render request') ||
          Boolean(document.querySelector('[data-render-complete]'))
        )
      },
      { timeout: 90000 }
    )
    await page.evaluate(
      ({ modelId: mid, content: body }) => {
        window.postMessage({ type: 'render', modelId: mid, content: body }, '*')
      },
      { modelId, content }
    )
  }
  await waitForHarnessRender(page)
  if (phase === 'before') {
    await page.addStyleTag({ content: MASTER_MOBILE_CLIP_CSS })
    await page.evaluate(() => document.fonts.ready)
  }
}

async function captureRepresentatives(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  for (const cell of ARTIFACT_REPRESENTATIVE_CELLS) {
    const slug = slugFromLabel(cell.label)
    const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 390, height: 900 } })
    const { modelId, content } = loadHarnessResponse(cell.jsonPath)
    await openHarnessWithContent(page, modelId, visualCaptureMarkdown(content))
    const shot = await cropWidestKatexRegion(page)
    const out = path.join(artifactRoot, `mobile-${slug}-${phase}-dpr3-region.png`)
    await labeledComposite(page, `${phase.toUpperCase()} · ${cell.label} · 390px DPR 3`, shot, out)

    const excerptPath = path.join(artifactRoot, `mobile-${slug}-source-excerpt.txt`)
    if (!fs.existsSync(excerptPath)) {
      fs.writeFileSync(excerptPath, excerptForDisplayMath(content) + '\n', 'utf-8')
    }
    console.log(out)
    await page.close()
  }

  const desktopPage = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 960, height: 900 },
  })
  const { modelId, content } = loadHarnessResponse(DESKTOP_CELL.jsonPath)
  await openHarnessWithContent(desktopPage, modelId, visualCaptureMarkdown(content))
  const desktopShot = await cropWidestKatexRegion(desktopPage)
  const desktopOut = path.join(
    artifactRoot,
    `desktop-${slugFromLabel(DESKTOP_CELL.label)}-${phase}-dpr2-region.png`
  )
  await labeledComposite(
    desktopPage,
    `${phase.toUpperCase()} · ${DESKTOP_CELL.label} · 960px DPR 2`,
    desktopShot,
    desktopOut
  )
  console.log(desktopOut)
  await desktopPage.close()
}

async function stackBeforeAfter(): Promise<void> {
  const stacker = await chromium.launch()
  const page = await stacker.newPage({ viewport: { width: 440, height: 4000 } })

  for (const cell of ARTIFACT_REPRESENTATIVE_CELLS) {
    const slug = slugFromLabel(cell.label)
    const beforePath = path.join(artifactRoot, `mobile-${slug}-before-dpr3-region.png`)
    const afterPath = path.join(artifactRoot, `mobile-${slug}-after-dpr3-region.png`)
    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) continue
    const beforeB64 = fs.readFileSync(beforePath).toString('base64')
    const afterB64 = fs.readFileSync(afterPath).toString('base64')
    const out = path.join(artifactRoot, `mobile-${slug}-before-after-stacked.png`)
    await page.setContent(`<!doctype html><html><head><style>
      body{margin:0;font-family:system-ui,sans-serif;background:#020617;color:#e2e8f0}
      h1{font-size:22px;text-align:center;padding:12px}
      img{display:block;width:100%;margin:0 0 16px}
    </style></head><body>
      <h1>${cell.label}</h1>
      <img src="data:image/png;base64,${beforeB64}" />
      <img src="data:image/png;base64,${afterB64}" />
    </body></html>`)
    await page.screenshot({ path: out, fullPage: true })
    console.log(out)
  }

  const dslug = slugFromLabel(DESKTOP_CELL.label)
  const db = path.join(artifactRoot, `desktop-${dslug}-before-dpr2-region.png`)
  const da = path.join(artifactRoot, `desktop-${dslug}-after-dpr2-region.png`)
  if (fs.existsSync(db) && fs.existsSync(da)) {
    const out = path.join(artifactRoot, `desktop-${dslug}-before-after-stacked.png`)
    await page.setContent(`<!doctype html><html><head><style>
      body{margin:0;font-family:system-ui,sans-serif;background:#020617}
      img{display:block;width:100%;margin:0 0 12px}
    </style></head><body>
      <img src="data:image/png;base64,${fs.readFileSync(db).toString('base64')}" />
      <img src="data:image/png;base64,${fs.readFileSync(da).toString('base64')}" />
    </body></html>`)
    await page.screenshot({ path: out, fullPage: true })
    console.log(out)
  }
  await stacker.close()
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true })
  if (process.argv.includes('--stack-only')) {
    await stackBeforeAfter()
    return
  }
  const browser = await chromium.launch()
  await captureRepresentatives(browser)
  await browser.close()
  if (phase === 'after') {
    await stackBeforeAfter()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
