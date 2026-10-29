import { afterEach, describe, expect, it, vi } from 'vitest'

import { PREVIEW_API_BASE_URL } from '../../config/deployEnv'
import {
  isPreviewInterceptedUrl,
  previewApiFixturePath,
  previewFetchResponse,
  resetPreviewApiGuardForTests,
} from '../apiGuard'

describe('previewApiFixturePath', () => {
  it('maps /preview-api and /api prefixes', () => {
    expect(previewApiFixturePath('https://x.pages.dev/preview-api/models')).toBe('/models')
    expect(previewApiFixturePath('/api/credits/balance?fingerprint=abc')).toBe('/credits/balance')
    expect(previewApiFixturePath(`${PREVIEW_API_BASE_URL}/rate-limit-status`)).toBe(
      '/rate-limit-status'
    )
  })
})

describe('isPreviewInterceptedUrl', () => {
  it('intercepts mock API, prod API, and Stripe', () => {
    expect(isPreviewInterceptedUrl('/preview-api/models')).toBe(true)
    expect(isPreviewInterceptedUrl('/api/models')).toBe(true)
    expect(isPreviewInterceptedUrl('https://compareintel.com/api/models')).toBe(true)
    expect(isPreviewInterceptedUrl('https://api.stripe.com/v1/charges')).toBe(true)
    expect(isPreviewInterceptedUrl('https://fonts.googleapis.com/css2')).toBe(false)
  })
})

describe('previewFetchResponse', () => {
  it('serves GET fixtures for models, credits, and rate limits', async () => {
    const models = previewFetchResponse('/preview-api/models', 'GET')
    expect(models?.status).toBe(200)
    const modelsBody = (await models?.json()) as { models: unknown[] }
    expect(modelsBody.models.length).toBeGreaterThan(0)

    const credits = previewFetchResponse('/api/credits/balance?fingerprint=x', 'GET')
    expect(credits?.status).toBe(200)

    const rate = previewFetchResponse('/preview-api/rate-limit-status', 'GET')
    expect(rate?.status).toBe(200)
  })

  it('returns 401 for auth me/refresh so previews stay logged out', async () => {
    const me = previewFetchResponse('/preview-api/auth/me', 'GET')
    expect(me?.status).toBe(401)
  })

  it('blocks writes including Stripe and compare', async () => {
    const compare = previewFetchResponse('/preview-api/compare-stream', 'POST')
    expect(compare?.status).toBe(403)
    const body = (await compare?.json()) as { detail: string }
    expect(body.detail).toMatch(/read-only/i)

    const checkout = previewFetchResponse('/api/billing/create-checkout-session', 'POST')
    expect(checkout?.status).toBe(403)

    const stripe = previewFetchResponse('https://api.stripe.com/v1/checkout/sessions', 'POST')
    expect(stripe?.status).toBe(403)
  })

  it('does not intercept unrelated requests', () => {
    expect(previewFetchResponse('/brand/logo.svg', 'GET')).toBeNull()
  })
})

describe('installPreviewApiGuard', () => {
  afterEach(() => {
    resetPreviewApiGuardForTests()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('wraps fetch on preview deploys', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'preview')
    const { installPreviewApiGuard } = await import('../apiGuard')
    installPreviewApiGuard()

    const res = await fetch('/preview-api/models')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { models: unknown[] }
    expect(Array.isArray(body.models)).toBe(true)

    const write = await fetch('/preview-api/billing/create-checkout-session', { method: 'POST' })
    expect(write.status).toBe(403)
  })
})
