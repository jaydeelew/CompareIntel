/**
 * Inspect a frontend dist/ folder for preview-safety: noindex + no analytics.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { distTextHasAnalyticsOrProdSecrets, headersHaveNoIndex, htmlHasNoIndex } from './artifacts'

export interface PreviewDistCheckResult {
  ok: boolean
  errors: string[]
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkFiles(full, acc)
    } else {
      acc.push(full)
    }
  }
  return acc
}

export function checkPreviewDist(distDir: string): PreviewDistCheckResult {
  const errors: string[] = []

  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    errors.push(`Missing ${indexPath}`)
    return { ok: false, errors }
  }

  const html = readFileSync(indexPath, 'utf8')
  if (!htmlHasNoIndex(html)) {
    errors.push('index.html is missing a noindex robots meta tag')
  }
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*index,\s*follow/i.test(html)) {
    errors.push('index.html still has index, follow robots meta')
  }

  const headersPath = join(distDir, '_headers')
  if (!existsSync(headersPath)) {
    errors.push('Missing dist/_headers (Cloudflare Pages X-Robots-Tag)')
  } else {
    const headers = readFileSync(headersPath, 'utf8')
    if (!headersHaveNoIndex(headers)) {
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
    // Canonical / OG URLs still mention compareintel.com; only flag API/secrets.
    const text = readFileSync(file, 'utf8')
    if (distTextHasAnalyticsOrProdSecrets(text)) {
      errors.push(`Possible analytics or production API leak in ${file}`)
    }
  }

  return { ok: errors.length === 0, errors }
}
