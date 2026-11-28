/// <reference types="vite/client" />

import { VERDICT_METHODOLOGY_PATH } from '../utils/verdictCopy'

import type { DeployEnvVars } from './deployEnv'

/**
 * Verdict panel, favorite buttons, and /verdict-methodology.
 *
 * On only for the Vite dev server (`import.meta.env.DEV`). Production builds
 * and Cloudflare Pages preview builds leave `DEV` false and `MODE` as
 * `production`, so the UI is not rendered. There is no `VITE_*` override.
 *
 * Playwright's GitHub Actions jobs start `npm run dev`, where `DEV` is true.
 * A non-production Vite mode named `verdict-e2e` can also enable the UI for a
 * build that is not a production build (`vite build --mode verdict-e2e`).
 * `npm run build` and Cloudflare Pages never use that mode, and setting any
 * environment variable on a production build cannot turn the mode on.
 */
export function isVerdictPanelEnabledFromEnv(env: DeployEnvVars): boolean {
  if (env.DEV === true || env.DEV === 'true') return true
  return env.MODE === 'verdict-e2e'
}

export function isVerdictPanelEnabled(): boolean {
  return isVerdictPanelEnabledFromEnv(import.meta.env as DeployEnvVars)
}

export function isVerdictMethodologyPath(path: string): boolean {
  return path === VERDICT_METHODOLOGY_PATH
}
