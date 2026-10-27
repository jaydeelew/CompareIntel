/**
 * Off-by-default Voice mode flag.
 *
 * Production omits VITE_ENABLE_VOICE so the Text-tab Voice toggle stays hidden.
 * Enable locally / in e2e with VITE_ENABLE_VOICE=true (backend: ENABLE_VOICE).
 */

function envFlagEnabled(value: string | boolean | undefined | null): boolean {
  if (value === true) return true
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function isVoiceFeatureEnabled(): boolean {
  return envFlagEnabled(import.meta.env.VITE_ENABLE_VOICE)
}
