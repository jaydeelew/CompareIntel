/// <reference types="vite/client" />

/**
 * Preview vs production deploy detection.
 *
 * Cloudflare Pages sets CF_PAGES=1 on every Pages build. We also honor an
 * explicit VITE_DEPLOY_ENV=preview (local preview builds, CI checks).
 *
 * VITE_DEPLOY_ENV=production wins so a future Pages production host can opt out.
 * Until then, every Pages build is treated as a preview: noindex, mock API,
 * no analytics, no production secrets.
 */

export const PREVIEW_API_BASE_URL = '/preview-api'

/** Hosts the SPA must never call from a preview build. */
export const BLOCKED_PRODUCTION_API_HOSTS = [
  'compareintel.com',
  'www.compareintel.com',
  'api.compareintel.com',
  '54.163.207.252',
] as const

export type DeployEnvName = 'preview' | 'production' | 'development' | string

export interface DeployEnvVars {
  VITE_DEPLOY_ENV?: string
  VITE_API_URL?: string
  VITE_API_BASE_URL?: string
  VITE_SENTRY_DSN?: string
  VITE_PERFORMANCE_ENDPOINT?: string
  VITE_RECAPTCHA_SITE_KEY?: string
  CF_PAGES?: string
  MODE?: string
  DEV?: boolean | string
  PROD?: boolean | string
  [key: string]: string | boolean | undefined
}

function normalizeFlag(value: string | boolean | undefined): string {
  if (value === true) return '1'
  if (value === false || value == null) return ''
  return String(value).trim()
}

/**
 * True when this build/runtime is a PR preview (Cloudflare Pages or explicit env).
 */
export function isPreviewDeployFromEnv(env: DeployEnvVars): boolean {
  const explicit = normalizeFlag(env.VITE_DEPLOY_ENV).toLowerCase()
  if (explicit === 'production') return false
  if (explicit === 'preview') return true

  const cfPages = normalizeFlag(env.CF_PAGES).toLowerCase()
  return cfPages === '1' || cfPages === 'true'
}

/**
 * Client/runtime helper. Uses Vite-injected import.meta.env.
 */
export function isPreviewDeploy(): boolean {
  return isPreviewDeployFromEnv(import.meta.env as DeployEnvVars)
}

/**
 * Analytics (Web Vitals beacon, gtag, performance POST) is production-only.
 */
export function isAnalyticsEnabledFromEnv(env: DeployEnvVars): boolean {
  if (isPreviewDeployFromEnv(env)) return false
  if (normalizeFlag(env.DEV) === '1' || env.DEV === true) return false
  const endpoint = normalizeFlag(env.VITE_PERFORMANCE_ENDPOINT)
  return endpoint.length > 0
}

export function isAnalyticsEnabled(): boolean {
  return isAnalyticsEnabledFromEnv(import.meta.env as DeployEnvVars)
}

export function isBlockedProductionApiUrl(url: string): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return false

  let host = ''
  try {
    const parsed = new URL(trimmed, 'https://preview.local')
    host = parsed.hostname.toLowerCase()
  } catch {
    return false
  }

  return BLOCKED_PRODUCTION_API_HOSTS.some(
    blocked => host === blocked || host.endsWith(`.${blocked}`)
  )
}

export function isStripeLiveUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://preview.local')
    const host = parsed.hostname.toLowerCase()
    return host === 'api.stripe.com' || host.endsWith('.stripe.com')
  } catch {
    return false
  }
}

/**
 * API base for this deploy. Previews always use the same-origin mock, even if
 * a production URL was supplied in the Pages environment.
 */
export function getApiBaseUrlFromEnv(env: DeployEnvVars): string {
  if (isPreviewDeployFromEnv(env)) {
    return PREVIEW_API_BASE_URL
  }
  const configured = normalizeFlag(env.VITE_API_URL) || normalizeFlag(env.VITE_API_BASE_URL)
  if (configured) return configured
  return '/api'
}

export function getApiBaseUrl(): string {
  return getApiBaseUrlFromEnv(import.meta.env as DeployEnvVars)
}

const SECRET_ENV_KEYS = [
  'VITE_SENTRY_DSN',
  'VITE_PERFORMANCE_ENDPOINT',
  'VITE_RECAPTCHA_SITE_KEY',
] as const

/**
 * Mutate a Node env map so a preview build cannot bake production secrets or
 * a production API URL into the client bundle.
 *
 * @returns true when this is a preview build
 */
export function applyPreviewDeployEnv(env: DeployEnvVars): boolean {
  const preview = isPreviewDeployFromEnv(env)
  if (!preview) return false

  env.VITE_DEPLOY_ENV = 'preview'
  env.VITE_API_URL = PREVIEW_API_BASE_URL
  env.VITE_API_BASE_URL = PREVIEW_API_BASE_URL

  for (const key of SECRET_ENV_KEYS) {
    if (key in env) {
      env[key] = ''
    }
  }

  return true
}
