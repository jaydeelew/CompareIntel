/**
 * Stack two full-section screenshots, Before above After, at 960 CSS px and
 * device pixel ratio 2. Images are shown at their natural width with no crop.
 */

import fs from 'fs/promises'
import type { Page } from 'playwright'
import { EVIDENCE_VIEW } from './captures.js'

export async function stackBeforeAfter(
  page: Page,
  opts: {
    beforePng: string
    afterPng: string
    beforeLabel: string
    afterLabel: string
    outputPath: string
  }
): Promise<void> {
  const before = (await fs.readFile(opts.beforePng)).toString('base64')
  const after = (await fs.readFile(opts.afterPng)).toString('base64')
  await page.setViewportSize({ width: EVIDENCE_VIEW.width, height: EVIDENCE_VIEW.height })
  await page.setContent(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #111; color: #fff; }
    figure { margin: 0; width: 960px; }
    figcaption {
      font: 800 64px/1.05 system-ui, sans-serif;
      padding: 28px 24px 18px;
      letter-spacing: -0.03em;
    }
    img { display: block; width: auto; max-width: 960px; height: auto; background: #fff; }
  </style>
</head>
<body>
  <figure>
    <figcaption>${escapeHtml(opts.beforeLabel)}</figcaption>
    <img alt="${escapeHtml(opts.beforeLabel)}" src="data:image/png;base64,${before}" />
  </figure>
  <figure>
    <figcaption>${escapeHtml(opts.afterLabel)}</figcaption>
    <img alt="${escapeHtml(opts.afterLabel)}" src="data:image/png;base64,${after}" />
  </figure>
</body>
</html>`,
    { waitUntil: 'domcontentloaded' }
  )
  await page.waitForFunction(`() => {
    const images = Array.from(document.images)
    return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0)
  }`)
  await page.screenshot({ path: opts.outputPath, fullPage: true })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
