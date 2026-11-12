/// <reference types="vite/client" />

import { VERDICT_METHODOLOGY_PATH } from '../utils/verdictCopy'

import type { DeployEnvVars } from './deployEnv'

function normalizeFlag(value: string | boolean | undefined): string {
  if (value === true) return '1'
  if (value === false || value == null) return ''
  return String(value).trim()
}

function isTruthyEnvFlag(value: string | boolean | undefined): boolean {
  const normalized = normalizeFlag(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

/**
 * Verdict panel + /verdict-methodology are on when:
 * - Vite dev server (`npm run dev`), or
 * - VITE_ENABLE_VERDICT_PANEL is set to a truthy value at build/runtime.
 *
 * Production builds leave the flag unset so the panel stays hidden until launch.
 */
export function isVerdictPanelEnabledFromEnv(env: DeployEnvVars): boolean {
  if (isTruthyEnvFlag(env.VITE_ENABLE_VERDICT_PANEL)) return true
  if (isTruthyEnvFlag(env.DEV)) return true
  return false
}

export function isVerdictPanelEnabled(): boolean {
  return isVerdictPanelEnabledFromEnv(import.meta.env as DeployEnvVars)
}

export function isVerdictMethodologyPath(path: string): boolean {
  return path === VERDICT_METHODOLOGY_PATH
}
