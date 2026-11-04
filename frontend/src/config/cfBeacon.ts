/**
 * Cloudflare Web Analytics beacon helpers.
 *
 * The public token placeholder __CF_BEACON_TOKEN__ is in index.html and will be
 * replaced by a maintainer in a follow-up commit. The loader no-ops unless the
 * token is real and location.hostname is exactly compareintel.com, so localhost,
 * PR previews, E2E/CI, and the browser extension never beacon.
 */

import { isPreviewDeployFromEnv } from './deployEnv'

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
  return value.length === 0 || value.includes('__CF_') || value.includes('%VITE_')
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
 * Preview builds always clear the token so the beacon is not loaded.
 * For production builds, the token is already in index.html as __CF_BEACON_TOKEN__.
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

  // Token is now a literal placeholder in index.html, not injected by Vite
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
    html.includes('__CF_BEACON_TOKEN__') ||
    html.includes('%VITE_CF_BEACON_TOKEN%')
  )
}
