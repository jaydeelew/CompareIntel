/**
 * Stack two full-section screenshots at phone width (390 CSS px), Before above After.
 */

import fs from 'fs/promises'
import type { Page } from 'playwright'
import { PHONE_VIEW } from './captures.js'

export async function stackPhoneBeforeAfter(
  page: Page,
  opts: {
    beforePng: string
    afterPng: string
    beforeLabel: string
    afterLabel: string
    sourceExcerpt: string
    outputPath: string
  }
): Promise<void> {
  const before = (await fs.readFile(opts.beforePng)).toString('base64')
  const after = (await fs.readFile(opts.afterPng)).toString('base64')
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  await page.setViewportSize({ width: PHONE_VIEW.width, height: 900 })
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      * { box-sizing: border-box; }
      body { margin: 0; width: 390px; font-family: system-ui, sans-serif; background: #fff; color: #111; }
      figcaption { font: 800 20px/1.2 system-ui; padding: 10px 8px 6px; }
      figcaption.before { background: #fef3c7; color: #78350f; border-top: 3px solid #f59e0b; }
      figcaption.after { background: #dcfce7; color: #14532d; border-top: 3px solid #22c55e; }
      figcaption.title { background: #1e293b; color: #f8fafc; font-size: 16px; border-top: none; }
      img { display: block; width: 390px; height: auto; margin: 0; background: #fff; }
      pre { margin: 0; padding: 10px 8px 14px; font-size: 11px; line-height: 1.35; white-space: pre-wrap;
        word-break: break-word; background: #f8fafc; border-top: 1px solid #e2e8f0; font-family: ui-monospace, monospace; }
    </style></head><body>
      <figcaption class="title">${esc(opts.beforeLabel.split(' · ')[0] || opts.beforeLabel)} · 390px CSS · DPR 3</figcaption>
      <figure><figcaption class="before">${esc(opts.beforeLabel)}</figcaption>
      <img alt="before" src="data:image/png;base64,${before}" /></figure>
      <figure><figcaption class="after">${esc(opts.afterLabel)}</figcaption>
      <img alt="after" src="data:image/png;base64,${after}" /></figure>
      <pre>${esc(opts.sourceExcerpt)}</pre>
    </body></html>`,
    { waitUntil: 'domcontentloaded' }
  )
  await page.waitForFunction(`() => {
    const images = Array.from(document.images)
    return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0)
  }`)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({ width: PHONE_VIEW.width, height: Math.min(height, 12000) })
  await page.screenshot({ path: opts.outputPath, clip: { x: 0, y: 0, width: PHONE_VIEW.width, height } })
}
