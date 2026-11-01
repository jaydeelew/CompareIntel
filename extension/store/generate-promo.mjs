#!/usr/bin/env node
/**
 * Rasterize store promo HTML (and keep the matching SVGs as sources)
 * to opaque 24-bit PNGs using the CompareIntel logo.
 */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const logoSvgPath = path.join(repoRoot, 'frontend/public/brand/logo.svg')

const tiles = [
  { src: 'promo-small.html', out: 'small-promo-440x280.png', width: 440, height: 280, logo: 88 },
  { src: 'promo-marquee.html', out: 'marquee-1400x560.png', width: 1400, height: 560, logo: 176 },
]

const logoPng = await sharp(await readFile(logoSvgPath))
  .resize(256, 256, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer()

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ci-store-promo-'))
const browser = await chromium.launch({ headless: true })

try {
  for (const tile of tiles) {
    const logoForTile = await sharp(logoPng).resize(tile.logo, tile.logo).png().toBuffer()
    const dataUri = `data:image/png;base64,${logoForTile.toString('base64')}`
    const html = (await readFile(path.join(__dirname, tile.src), 'utf8')).replaceAll(
      '{{LOGO}}',
      dataUri
    )
    const htmlPath = path.join(tmpDir, tile.src)
    await writeFile(htmlPath, html)

    const page = await browser.newPage({
      viewport: { width: tile.width, height: tile.height },
      deviceScaleFactor: 1,
    })
    await page.goto(`file://${htmlPath}`)
    const screenshot = await page.screenshot({ type: 'png', animations: 'disabled' })
    await page.close()

    await sharp(screenshot)
      .resize(tile.width, tile.height)
      .flatten({ background: '#0B1220' })
      .removeAlpha()
      .png()
      .toFile(path.join(__dirname, tile.out))
    console.log(`✓ ${tile.out} (${tile.width}×${tile.height})`)
  }
} finally {
  await browser.close()
  await rm(tmpDir, { recursive: true, force: true })
}
