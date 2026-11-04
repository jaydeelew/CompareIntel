import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  applyCfBeaconBuildEnv,
  CF_BEACON_SCRIPT_SRC,
  htmlHasCfBeaconLoader,
  PRODUCTION_ANALYTICS_HOSTNAME,
  shouldLoadCfBeacon,
  stripCfBeaconLoader,
} from '../cfBeacon'

const repoFrontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

describe('shouldLoadCfBeacon', () => {
  const prod = {
    token: 'real-token-value',
    hostname: PRODUCTION_ANALYTICS_HOSTNAME,
  }

  it('loads only on compareintel.com with a real token', () => {
    expect(shouldLoadCfBeacon(prod)).toBe(true)
  })

  it('does nothing on localhost, previews, dev, or without a token', () => {
    expect(shouldLoadCfBeacon({ ...prod, hostname: 'localhost' })).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, hostname: 'www.compareintel.com' })).toBe(false)
    expect(
      shouldLoadCfBeacon({ ...prod, hostname: 'compareintel-frontend-previews.pages.dev' })
    ).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, isDev: true })).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, isPreview: true })).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, token: '' })).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, token: '__CF_BEACON_TOKEN__' })).toBe(false)
    expect(shouldLoadCfBeacon({ ...prod, token: '%VITE_CF_BEACON_TOKEN%' })).toBe(false)
  })
})

describe('applyCfBeaconBuildEnv', () => {
  it('returns empty for production builds without explicit token', () => {
    const env = {}
    expect(applyCfBeaconBuildEnv(env, 'production')).toBe('')
  })

  it('returns the explicit production token if provided', () => {
    const env = { VITE_CF_BEACON_TOKEN: 'custom-token' }
    expect(applyCfBeaconBuildEnv(env, 'production')).toBe('custom-token')
  })

  it('clears the token for preview and leaves development unset', () => {
    const preview = {
      VITE_DEPLOY_ENV: 'preview',
      VITE_CF_BEACON_TOKEN: 'some-token',
    }
    expect(applyCfBeaconBuildEnv(preview, 'production')).toBe('')
    expect(preview.VITE_CF_BEACON_TOKEN).toBe('')

    const dev = {}
    expect(applyCfBeaconBuildEnv(dev, 'development')).toBe('')
    expect(dev.VITE_CF_BEACON_TOKEN).toBeUndefined()
  })
})

describe('index.html Cloudflare beacon loader', () => {
  const html = readFileSync(path.join(repoFrontend, 'index.html'), 'utf8')

  it('has a hostname-guarded beacon loader with __CF_BEACON_TOKEN__ placeholder', () => {
    expect(htmlHasCfBeaconLoader(html)).toBe(true)
    expect(html).toContain("var token = '__CF_BEACON_TOKEN__'")
    expect(html).toContain("location.hostname !== 'compareintel.com'")
    expect(html).toContain(CF_BEACON_SCRIPT_SRC)
  })

  it('can strip the loader so preview HTML has no beacon', () => {
    const stripped = stripCfBeaconLoader(html)
    expect(htmlHasCfBeaconLoader(stripped)).toBe(false)
    expect(stripped).not.toContain(CF_BEACON_SCRIPT_SRC)
    expect(stripped).not.toContain('data-cf-beacon')
  })
})
