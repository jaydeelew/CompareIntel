import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyPreviewDeployEnv,
  BLOCKED_PRODUCTION_API_HOSTS,
  getApiBaseUrlFromEnv,
  isAnalyticsEnabledFromEnv,
  isBlockedProductionApiUrl,
  isPreviewDeployFromEnv,
  isStripeLiveUrl,
  PREVIEW_API_BASE_URL,
} from '../deployEnv'

describe('isPreviewDeployFromEnv', () => {
  it('treats VITE_DEPLOY_ENV=preview as a preview', () => {
    expect(isPreviewDeployFromEnv({ VITE_DEPLOY_ENV: 'preview' })).toBe(true)
    expect(isPreviewDeployFromEnv({ VITE_DEPLOY_ENV: 'PREVIEW' })).toBe(true)
  })

  it('treats CF_PAGES as a preview when deploy env is unset', () => {
    expect(isPreviewDeployFromEnv({ CF_PAGES: '1' })).toBe(true)
    expect(isPreviewDeployFromEnv({ CF_PAGES: 'true' })).toBe(true)
  })

  it('lets VITE_DEPLOY_ENV=production override CF_PAGES', () => {
    expect(isPreviewDeployFromEnv({ VITE_DEPLOY_ENV: 'production', CF_PAGES: '1' })).toBe(false)
  })

  it('is false for local development', () => {
    expect(isPreviewDeployFromEnv({ DEV: true, MODE: 'development' })).toBe(false)
    expect(isPreviewDeployFromEnv({})).toBe(false)
  })
})

describe('isAnalyticsEnabledFromEnv', () => {
  it('is disabled on preview even when an endpoint is set', () => {
    expect(
      isAnalyticsEnabledFromEnv({
        VITE_DEPLOY_ENV: 'preview',
        VITE_PERFORMANCE_ENDPOINT: 'https://compareintel.com/api/performance',
        PROD: true,
      })
    ).toBe(false)
  })

  it('is disabled in development', () => {
    expect(
      isAnalyticsEnabledFromEnv({
        DEV: true,
        VITE_PERFORMANCE_ENDPOINT: '/api/performance',
      })
    ).toBe(false)
  })

  it('is enabled in production when an endpoint is configured', () => {
    expect(
      isAnalyticsEnabledFromEnv({
        VITE_DEPLOY_ENV: 'production',
        VITE_PERFORMANCE_ENDPOINT: 'https://example.com/vitals',
        PROD: true,
      })
    ).toBe(true)
  })

  it('is disabled when no endpoint is configured', () => {
    expect(isAnalyticsEnabledFromEnv({ VITE_DEPLOY_ENV: 'production', PROD: true })).toBe(false)
  })
})

describe('getApiBaseUrlFromEnv', () => {
  it('forces the mock API base on preview even if production URL is set', () => {
    expect(
      getApiBaseUrlFromEnv({
        VITE_DEPLOY_ENV: 'preview',
        VITE_API_URL: 'https://compareintel.com/api',
      })
    ).toBe(PREVIEW_API_BASE_URL)
  })

  it('uses VITE_API_URL outside preview', () => {
    expect(getApiBaseUrlFromEnv({ VITE_API_URL: '/api' })).toBe('/api')
  })

  it('defaults to /api', () => {
    expect(getApiBaseUrlFromEnv({})).toBe('/api')
  })
})

describe('applyPreviewDeployEnv', () => {
  it('strips production secrets and forces the mock API', () => {
    const env = {
      VITE_DEPLOY_ENV: 'preview',
      VITE_API_URL: 'https://compareintel.com/api',
      VITE_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/1',
      VITE_PERFORMANCE_ENDPOINT: 'https://compareintel.com/api/performance',
      VITE_RECAPTCHA_SITE_KEY: 'prod-site-key',
      VITE_CF_BEACON_TOKEN: '423fd187f89f44bdadec92bc373b1829',
    }
    expect(applyPreviewDeployEnv(env)).toBe(true)
    expect(env.VITE_API_URL).toBe(PREVIEW_API_BASE_URL)
    expect(env.VITE_SENTRY_DSN).toBe('')
    expect(env.VITE_PERFORMANCE_ENDPOINT).toBe('')
    expect(env.VITE_RECAPTCHA_SITE_KEY).toBe('')
    expect(env.VITE_CF_BEACON_TOKEN).toBe('')
  })

  it('does not mutate production env', () => {
    const env = { VITE_API_URL: '/api', VITE_SENTRY_DSN: 'https://dsn.example/1' }
    expect(applyPreviewDeployEnv(env)).toBe(false)
    expect(env.VITE_SENTRY_DSN).toBe('https://dsn.example/1')
  })
})

describe('blocked production URLs', () => {
  it.each([...BLOCKED_PRODUCTION_API_HOSTS])('blocks %s', host => {
    expect(isBlockedProductionApiUrl(`https://${host}/api`)).toBe(true)
  })

  it('allows relative and preview-api URLs', () => {
    expect(isBlockedProductionApiUrl('/api')).toBe(false)
    expect(isBlockedProductionApiUrl('/preview-api/models')).toBe(false)
  })

  it('detects Stripe live hosts', () => {
    expect(isStripeLiveUrl('https://api.stripe.com/v1/checkout/sessions')).toBe(true)
    expect(isStripeLiveUrl('https://checkout.stripe.com/pay/cs_live_123')).toBe(true)
    expect(isStripeLiveUrl('/preview-api/billing/create-checkout-session')).toBe(false)
  })
})

describe('isPreviewDeploy runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reads VITE_DEPLOY_ENV from import.meta.env', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'preview')
    const { isPreviewDeploy } = await import('../deployEnv')
    expect(isPreviewDeploy()).toBe(true)
  })
})
