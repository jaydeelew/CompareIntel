/**
 * Cloudflare Web Analytics beacon helpers.
 *
 * The public token is baked into production HTML via VITE_CF_BEACON_TOKEN.
 * The loader still no-ops unless location.hostname is exactly compareintel.com,
 * so localhost, PR previews, E2E/CI, and the browser extension never beacon.
 */

import { isPreviewDeployFromEnv } from './deployEnv'

export const DEFAULT_CF_BEACON_TOKEN = '423fd187f89f44bdadec92bc373b1829'
export const CF_BEACON_SCRIPT_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'
export const PRODUCTION_ANALYTICS_HOSTNAME = 'compareintel.com'
export const CF_BEACON_LOADER_ID = 'cf-beacon-loader'

export interface CfBeaconGate {
  token?: string
  hostname?: string
  isDev?: boolean
  isPreview?: boolean
}

function normalizeToken(token: string | undefined): string {
  return String(token ?? '').trim()
}

export function isCfBeaconTokenPlaceholder(token: string | undefined): boolean {
  const value = normalizeToken(token)
  return value.length === 0 || value.includes('%VITE_')
}

/**
 * True only when a real token is present, the build is not preview/dev, and the
 * page is served on the production hostname.
 */
export function shouldLoadCfBeacon(gate: CfBeaconGate): boolean {
  if (gate.isDev) return false
  if (gate.isPreview) return false
  if (isCfBeaconTokenPlaceholder(gate.token)) return false
  return (gate.hostname || '').toLowerCase() === PRODUCTION_ANALYTICS_HOSTNAME
}

/**
 * Production builds get the public token when none was supplied. Preview builds
 * always clear it so Vite cannot inline the beacon into Pages HTML.
 */
export function applyCfBeaconBuildEnv(
  env: {
    VITE_CF_BEACON_TOKEN?: string
    VITE_DEPLOY_ENV?: string
    CF_PAGES?: string
    [key: string]: string | boolean | undefined
  },
  mode: string
): string {
  if (isPreviewDeployFromEnv(env)) {
    env.VITE_CF_BEACON_TOKEN = ''
    return ''
  }

  if (mode === 'production') {
    if (!normalizeToken(env.VITE_CF_BEACON_TOKEN)) {
      env.VITE_CF_BEACON_TOKEN = DEFAULT_CF_BEACON_TOKEN
    }
    return normalizeToken(env.VITE_CF_BEACON_TOKEN)
  }

  return normalizeToken(env.VITE_CF_BEACON_TOKEN)
}

export function stripCfBeaconLoader(html: string): string {
  const wrapped = html.replace(
    /\s*<!--\s*cf-beacon-start\s*-->[\s\S]*?<!--\s*cf-beacon-end\s*-->/i,
    ''
  )
  if (wrapped !== html) return wrapped
  return html.replace(/\s*<script\b[^>]*\bid=["']cf-beacon-loader["'][^>]*>[\s\S]*?<\/script>/i, '')
}

export function htmlHasCfBeaconLoader(html: string): boolean {
  return (
    html.includes(CF_BEACON_LOADER_ID) ||
    html.includes(CF_BEACON_SCRIPT_SRC) ||
    html.includes('%VITE_CF_BEACON_TOKEN%')
  )
}
