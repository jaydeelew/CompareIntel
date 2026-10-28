/**
 * Runtime fetch guard for Cloudflare Pages (and local) preview builds.
 *
 * Intercepts API and Stripe requests so a preview cannot write to the
 * production database or hit Stripe live mode. GET /models, /credits/balance,
 * and /rate-limit-status are served from bundled fixtures.
 */

import {
  isBlockedProductionApiUrl,
  isPreviewDeploy,
  isStripeLiveUrl,
  PREVIEW_API_BASE_URL,
} from '../config/deployEnv'

import creditsBalanceFixture from './fixtures/credits-balance.json'
import modelsFixture from './fixtures/models.json'
import rateLimitFixture from './fixtures/rate-limit-status.json'

const READ_ONLY_DETAIL =
  'Preview deployments are read-only. Database writes and Stripe live mode are disabled.'

const GET_FIXTURES: Record<string, unknown> = {
  '/models': modelsFixture,
  '/credits/balance': creditsBalanceFixture,
  '/rate-limit-status': rateLimitFixture,
}

const AUTH_UNAUTHENTICATED = new Set(['/auth/me', '/auth/refresh'])

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Preview-Mock': '1',
    },
  })
}

function requestMethod(init?: RequestInit, input?: RequestInfo | URL): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof input === 'object' && input !== null && 'method' in input) {
    const method = (input as Request).method
    if (method) return method.toUpperCase()
  }
  return 'GET'
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function pathnameOf(url: string): string {
  try {
    return new URL(url, 'https://preview.local').pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

/**
 * Map an API URL to a fixture path like `/models`.
 */
export function previewApiFixturePath(url: string): string | null {
  let pathname = pathnameOf(url)
  const prefixes = [PREVIEW_API_BASE_URL, '/api']
  for (const prefix of prefixes) {
    if (pathname === prefix) return '/'
    if (pathname.startsWith(`${prefix}/`)) {
      pathname = pathname.slice(prefix.length)
      break
    }
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPreviewInterceptedUrl(url: string): boolean {
  if (isStripeLiveUrl(url) || isBlockedProductionApiUrl(url)) return true
  const pathname = pathnameOf(url)
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith(`${PREVIEW_API_BASE_URL}/`)
  )
}

export function previewFetchResponse(url: string, method: string): Response | null {
  if (!isPreviewInterceptedUrl(url)) return null

  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if (!isRead) {
    return jsonResponse({ detail: READ_ONLY_DETAIL }, 403)
  }

  if (isStripeLiveUrl(url)) {
    return jsonResponse({ detail: READ_ONLY_DETAIL }, 403)
  }

  const fixturePath = previewApiFixturePath(url)
  if (fixturePath && AUTH_UNAUTHENTICATED.has(fixturePath)) {
    return jsonResponse({ detail: 'Not authenticated' }, 401)
  }
  if (fixturePath && fixturePath in GET_FIXTURES) {
    return jsonResponse(GET_FIXTURES[fixturePath], 200)
  }

  return jsonResponse({ detail: 'Not found in preview mock API' }, 404)
}

let installed = false

/**
 * Wrap window.fetch. Safe to call more than once.
 */
export function installPreviewApiGuard(): void {
  if (installed) return
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  if (!isPreviewDeploy()) return

  installed = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input)
    const method = requestMethod(init, input)
    const mocked = previewFetchResponse(url, method)
    if (mocked) return Promise.resolve(mocked)
    return originalFetch(input, init)
  }
}

/** Test-only: allow re-installing the guard. */
export function resetPreviewApiGuardForTests(): void {
  installed = false
}
