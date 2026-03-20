import type { TextComposerAdvancedSettings } from '../types/textComposerAdvanced'

export function getMaxOutputTokensCapForModels(
  selectedModelIds: string[],
  allModels: Array<{ id: string; max_output_tokens?: number }>
): number {
  if (selectedModelIds.length === 0) return 8192
  const caps = selectedModelIds
    .map(id => allModels.find(m => m.id === id)?.max_output_tokens ?? 8192)
    .filter((n): n is number => typeof n === 'number')
  return caps.length > 0 ? Math.max(256, Math.min(...caps)) : 8192
}

export function applyTextComposerAdvancedSettings(
  settings: TextComposerAdvancedSettings,
  modelIdsForCap: string[],
  allModels: Array<{ id: string; max_output_tokens?: number }>,
  setTemperature: (v: number) => void,
  setTopP: (v: number) => void,
  setMaxTokens: (v: number | null) => void
): void {
  setTemperature(Math.max(0, Math.min(2, settings.temperature)))
  setTopP(Math.max(0, Math.min(1, settings.topP)))
  const cap = getMaxOutputTokensCapForModels(modelIdsForCap, allModels)
  if (settings.maxTokens === null) setMaxTokens(null)
  else setMaxTokens(Math.min(settings.maxTokens, cap))
}
