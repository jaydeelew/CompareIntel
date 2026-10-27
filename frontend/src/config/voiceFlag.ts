/**
 * Voice tab feature flag (PR #93). Defaults off so production matches pre-Voice UI.
 * Enable with VITE_ENABLE_VOICE=true (and backend ENABLE_VOICE=true).
 */

export function parseVoiceFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

export function isVoiceEnabled(): boolean {
  return parseVoiceFlag(import.meta.env.VITE_ENABLE_VOICE)
}

export function isVoiceHistoryEntry(entry: { composer_mode?: string | null }): boolean {
  return entry.composer_mode === 'voice'
}

/** Hide stored voice comparisons from history lists when the flag is off. Data is kept. */
export function visibleHistoryEntries<T extends { composer_mode?: string | null }>(
  entries: T[],
  enabled: boolean = isVoiceEnabled()
): T[] {
  if (enabled) return entries
  return entries.filter(entry => !isVoiceHistoryEntry(entry))
}
