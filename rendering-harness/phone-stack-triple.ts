/**
 * Stack three phone-width screenshots (Before / After start / After scrolled)
 * at 390 CSS px. Caller must use deviceScaleFactor 3 for 1170px output.
 */

import fs from 'fs/promises'
import type { Page } from 'playwright'

export async function stackPhoneTriple(
  page: Page,
  opts: {
    beforePng: string
    afterPng: string
    afterScrolledPng: string
    cellTitle: string
    beforeLabel: string
    afterLabel: string
    afterScrolledLabel: string
    sourceExcerpt: string
    outputPath: string
  }
): Promise<void> {
  const before = (await fs.readFile(opts.beforePng)).toString('base64')
  const after = (await fs.readFile(opts.afterPng)).toString('base64')
  const afterScrolled = (await fs.readFile(opts.afterScrolledPng)).toString('base64')
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8" /><style>
    *{box-sizing:border-box}
    body{margin:0;width:390px;font-family:system-ui,sans-serif;background:#fff;color:#111}
    .label{font-size:22px;font-weight:800;line-height:1.2;padding:10px 8px 6px}
    .label.before{background:#fef3c7;color:#78350f;border-top:3px solid #f59e0b}
    .label.after{background:#dcfce7;color:#14532d;border-top-color:#22c55e}
    .label.after-scroll{background:#e0f2fe;color:#0c4a6e;border-top-color:#0ea5e9}
    .label.cell{padding:12px 8px;background:#1e293b;color:#f8fafc;font-size:18px;border-top:none}
    img{display:block;width:390px;height:auto;margin:0}
    pre{margin:0;padding:10px 8px 14px;font-size:11px;line-height:1.35;white-space:pre-wrap;word-break:break-word;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:ui-monospace,monospace}
  </style></head><body>
    <div class="label cell">${esc(opts.cellTitle)} · 390 CSS px · DPR 3</div>
    <div class="label before">${esc(opts.beforeLabel)}</div>
    <img alt="before" src="data:image/png;base64,${before}" />
    <div class="label after">${esc(opts.afterLabel)}</div>
    <img alt="after" src="data:image/png;base64,${after}" />
    <div class="label after-scroll">${esc(opts.afterScrolledLabel)}</div>
    <img alt="after-scrolled" src="data:image/png;base64,${afterScrolled}" />
    <pre>${esc(opts.sourceExcerpt)}</pre>
  </body></html>`,
    { waitUntil: 'domcontentloaded' }
  )
  await page.waitForFunction(() => {
    const images = Array.from(document.images)
    return images.length === 3 && images.every(img => img.complete && img.naturalWidth > 0)
  })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 390, height: Math.min(height, 12000) })
  await page.screenshot({ path: opts.outputPath, clip: { x: 0, y: 0, width: 390, height } })
}
