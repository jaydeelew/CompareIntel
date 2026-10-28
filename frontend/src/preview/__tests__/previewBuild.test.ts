import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyPreviewNoIndex,
  distTextHasAnalyticsOrProdSecrets,
  headersHaveNoIndex,
  htmlHasNoIndex,
  PREVIEW_ROBOTS_CONTENT,
} from '../artifacts'
import { checkPreviewDist } from '../checkPreviewDist'

const SAMPLE_INDEX = `<!doctype html>
<html>
<head>
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <title>CompareIntel</title>
</head>
<body><div id="root"></div></body>
</html>`

describe('applyPreviewNoIndex', () => {
  it('replaces index, follow with noindex and adds googlebot', () => {
    const html = applyPreviewNoIndex(SAMPLE_INDEX)
    expect(htmlHasNoIndex(html)).toBe(true)
    expect(html).toMatch(/name="googlebot"/)
    expect(html).not.toMatch(/content="index, follow/)
  })

  it('inserts a robots meta tag when missing', () => {
    const html = applyPreviewNoIndex('<html><head></head><body></body></html>')
    expect(htmlHasNoIndex(html)).toBe(true)
  })
})

describe('preview dist artifacts', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  it('passes when noindex, headers, mock API, and no analytics leaks are present', () => {
    dir = mkdtempSync(join(tmpdir(), 'preview-dist-'))
    writeFileSync(join(dir, 'index.html'), applyPreviewNoIndex(SAMPLE_INDEX))
    writeFileSync(
      join(dir, '_headers'),
      '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n'
    )
    writeFileSync(join(dir, '_redirects'), '/preview-api/models /preview-api/models.json 200\n')
    writeFileSync(join(dir, 'robots.txt'), PREVIEW_ROBOTS_CONTENT)
    mkdirSync(join(dir, 'preview-api'))
    writeFileSync(join(dir, 'preview-api', 'models.json'), '{"models":[]}')
    writeFileSync(join(dir, 'preview-api', 'credits-balance.json'), '{}')
    writeFileSync(join(dir, 'preview-api', 'rate-limit-status.json'), '{}')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', 'index.js'), 'console.log("preview-api")')

    const result = checkPreviewDist(dir)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('fails when robots still allow indexing or analytics URLs leak', () => {
    dir = mkdtempSync(join(tmpdir(), 'preview-dist-bad-'))
    writeFileSync(join(dir, 'index.html'), SAMPLE_INDEX)
    writeFileSync(join(dir, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n')
    mkdirSync(join(dir, 'assets'))
    writeFileSync(
      join(dir, 'assets', 'index.js'),
      'fetch("https://www.google-analytics.com/g/collect")'
    )

    const result = checkPreviewDist(dir)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => /noindex/i.test(e))).toBe(true)
    expect(result.errors.some(e => /analytics or production API leak/i.test(e))).toBe(true)
  })
})

describe('headersHaveNoIndex / analytics leak detector', () => {
  it('requires X-Robots-Tag noindex', () => {
    expect(headersHaveNoIndex('/*\n  X-Robots-Tag: noindex, nofollow\n')).toBe(true)
    expect(headersHaveNoIndex('/*\n  X-Content-Type-Options: nosniff\n')).toBe(false)
  })

  it('flags analytics beacons, Stripe live, Sentry DSN, and prod API', () => {
    expect(distTextHasAnalyticsOrProdSecrets('https://www.google-analytics.com/g/collect')).toBe(
      true
    )
    expect(distTextHasAnalyticsOrProdSecrets('https://api.stripe.com/v1/charges')).toBe(true)
    expect(distTextHasAnalyticsOrProdSecrets('hostname==="api.stripe.com"')).toBe(false)
    expect(distTextHasAnalyticsOrProdSecrets('https://o1.ingest.us.sentry.io/123')).toBe(true)
    expect(distTextHasAnalyticsOrProdSecrets('https://compareintel.com/api/models')).toBe(true)
    expect(distTextHasAnalyticsOrProdSecrets('const api="/preview-api"')).toBe(false)
  })
})

describe('previewDeployPlugin closeBundle', () => {
  let dir: string | undefined

  afterEach(() => {
    delete process.env.VITE_DEPLOY_ENV
    vi.unstubAllEnvs()
    vi.resetModules()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  it('writes noindex headers, redirects, robots, and mock API into dist', async () => {
    process.env.VITE_DEPLOY_ENV = 'preview'
    vi.stubEnv('VITE_DEPLOY_ENV', 'preview')
    dir = mkdtempSync(join(tmpdir(), 'preview-plugin-'))
    const { previewDeployPlugin } = await import('../../../vite-plugin-preview-deploy')
    const plugin = previewDeployPlugin()
    const htmlHook = plugin.transformIndexHtml
    const transform =
      htmlHook && typeof htmlHook === 'object' && 'handler' in htmlHook
        ? htmlHook.handler
        : htmlHook
    expect(typeof transform).toBe('function')
    const transformed = (transform as (html: string) => string)(SAMPLE_INDEX)
    expect(htmlHasNoIndex(transformed)).toBe(true)

    const resolved = plugin.configResolved
    const close = plugin.closeBundle
    expect(typeof resolved).toBe('function')
    expect(typeof close).toBe('function')

    const handler = typeof resolved === 'function' ? resolved : resolved?.handler
    handler?.({ build: { outDir: dir } } as never)

    const closeHandler = typeof close === 'function' ? close : close?.handler
    closeHandler?.()

    expect(headersHaveNoIndex(readFileSync(join(dir, '_headers'), 'utf8'))).toBe(true)
    expect(htmlHasNoIndex(applyPreviewNoIndex(SAMPLE_INDEX))).toBe(true)
    expect(readFileSync(join(dir, 'robots.txt'), 'utf8')).toMatch(/Disallow:\s*\//)
    expect(readFileSync(join(dir, 'preview-api', 'models.json'), 'utf8')).toMatch(/models/)
    expect(checkPreviewDist(dir).ok).toBe(false) // no index.html yet

    writeFileSync(join(dir, 'index.html'), applyPreviewNoIndex(SAMPLE_INDEX))
    const result = checkPreviewDist(dir)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })
})
