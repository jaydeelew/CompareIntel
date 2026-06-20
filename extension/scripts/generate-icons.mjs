#!/usr/bin/env node
/**
 * Generate extension toolbar icons from frontend brand assets.
 * Source: frontend/public/brand/logo.svg
 */
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const logoSvg = path.join(repoRoot, 'frontend/public/brand/logo.svg')
const outDir = path.resolve(__dirname, '../public/icons')
const sizes = [16, 32, 48, 128]

mkdirSync(outDir, { recursive: true })

const svg = readFileSync(logoSvg)

for (const size of sizes) {
  const outPath = path.join(outDir, `icon-${size}.png`)
  await sharp(svg)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath)
  console.log(`✓ public/icons/icon-${size}.png (${size}×${size})`)
}
