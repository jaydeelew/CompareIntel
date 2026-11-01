#!/usr/bin/env node
/**
 * Assert a frontend dist/ folder was built as a Cloudflare Pages preview:
 * noindex meta + X-Robots-Tag, mock API fixtures, no analytics/prod API leaks.
 *
 * Usage: node scripts/check-preview-dist.js [distDir]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ANALYTICS_LEAK_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /www\.google-analytics\.com/i,
  /gtag\/js/i,
  /static\.cloudflareinsights\.com\/beacon\.min\.js/i,
  /data-cf-beacon/i,
  /423fd187f89f44bdadec92bc373b1829/,
  /https?:\/\/api\.stripe\.com/i,
  /ingest\.(us\.)?sentry\.io\/[0-9]+/i,
  /sentry\.io\/api\//i,
  /https:\/\/compareintel\.com\/api/i,
  /https:\/\/www\.compareintel\.com\/api/i,
  /https:\/\/api\.compareintel\.com/i,
]

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walkFiles(full, acc)
    } else {
      acc.push(full)
    }
  }
  return acc
}

export function checkPreviewDist(distDir) {
  const errors = []

  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    errors.push(`Missing ${indexPath}`)
    return { ok: false, errors }
  }

  const html = readFileSync(indexPath, 'utf8')
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(html)) {
    errors.push('index.html is missing a noindex robots meta tag')
  }
  if (/<meta\s+name=["']robots["']\s+content=["']\s*index\s*,/i.test(html)) {
    errors.push('index.html still has index, follow robots meta')
  }

  const headersPath = join(distDir, '_headers')
  if (!existsSync(headersPath)) {
    errors.push('Missing dist/_headers (Cloudflare Pages X-Robots-Tag)')
  } else {
    const headers = readFileSync(headersPath, 'utf8')
    if (!/X-Robots-Tag\s*:\s*noindex/i.test(headers)) {
      errors.push('_headers is missing X-Robots-Tag: noindex')
    }
  }

  const robotsPath = join(distDir, 'robots.txt')
  if (!existsSync(robotsPath)) {
    errors.push('Missing dist/robots.txt')
  } else {
    const robots = readFileSync(robotsPath, 'utf8')
    if (!/Disallow:\s*\//i.test(robots)) {
      errors.push('robots.txt does not Disallow: /')
    }
    if (/Sitemap:\s*https:\/\/compareintel\.com/i.test(robots)) {
      errors.push('preview robots.txt must not advertise the production sitemap')
    }
  }

  const redirectsPath = join(distDir, '_redirects')
  if (!existsSync(redirectsPath)) {
    errors.push('Missing dist/_redirects')
  }

  const previewApiDir = join(distDir, 'preview-api')
  for (const fixture of ['models.json', 'credits-balance.json', 'rate-limit-status.json']) {
    if (!existsSync(join(previewApiDir, fixture))) {
      errors.push(`Missing dist/preview-api/${fixture}`)
    }
  }

  const textFiles = walkFiles(distDir).filter(file => /\.(html|js|txt|json|csv|map)$/i.test(file))
  for (const file of textFiles) {
    const text = readFileSync(file, 'utf8')
    if (ANALYTICS_LEAK_PATTERNS.some(pattern => pattern.test(text))) {
      errors.push(`Possible analytics or production API leak in ${file}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

const isCli = import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  const distDir = process.argv[2] || join(__dirname, '..', 'dist')
  const result = checkPreviewDist(distDir)
  if (!result.ok) {
    console.error('Preview dist check failed:')
    for (const err of result.errors) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }
  console.log(`Preview dist check passed: ${distDir}`)
}
