/**
 * Rasterize CI_favicon_original.svg to purpose-named PNGs (full-bleed, transparent background).
 *
 * Usage: npm run generate:brand:fullbleed
 *
 * Output: frontend/public/brand/*.png
 */

import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')
const BRAND_DIR = join(PUBLIC_DIR, 'brand')
const SOURCE_SVG = join(PUBLIC_DIR, 'CI_favicon_original.svg')

/** @type {Array<[number, string, string]>} size, filename, description */
const OUTPUTS = [
  [16, 'icon-16.png', 'Browser tab / favicon fallback (16×16)'],
  [32, 'icon-32.png', 'Browser tab / favicon fallback (32×32)'],
  [180, 'apple-touch-icon-180.png', 'iOS / iPadOS home screen (apple-touch-icon)'],
  [192, 'pwa-any-192.png', 'PWA manifest purpose:any; shortcuts; Windows tile meta'],
  [512, 'pwa-any-512.png', 'PWA manifest purpose:any; JSON-LD logo; high-DPI install'],
]

async function main() {
  const svgBuffer = readFileSync(SOURCE_SVG)
  mkdirSync(BRAND_DIR, { recursive: true })

  console.log('Source:', SOURCE_SVG)
  console.log('Output dir:', BRAND_DIR)
  console.log('')

  for (const [size, filename, desc] of OUTPUTS) {
    const outPath = join(BRAND_DIR, filename)
    await sharp(Buffer.from(svgBuffer))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outPath)

    console.log(`✓ ${filename} (${size}×${size}) — ${desc}`)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
