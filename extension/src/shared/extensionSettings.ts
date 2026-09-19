import browser from 'webextension-polyfill'

export type PanelScope = 'always_open' | 'per_tab'

const PANEL_SCOPE_KEY = 'panelScope'
const INPUT_FONT_SIZE_KEY = 'inputFontSize'
const CONVERSATION_FONT_SIZE_KEY = 'conversationFontSize'

export const DEFAULT_PANEL_SCOPE: PanelScope = 'always_open'
export const DEFAULT_INPUT_FONT_SIZE = 16
export const DEFAULT_CONVERSATION_FONT_SIZE = 14
export const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20] as const

export interface FontSizes {
  inputFontSize: number
  conversationFontSize: number
}

function normalizeFontSize(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return FONT_SIZE_OPTIONS.includes(parsed as (typeof FONT_SIZE_OPTIONS)[number])
    ? parsed
    : fallback
}

export async function getPanelScope(): Promise<PanelScope> {
  const result = await browser.storage.local.get(PANEL_SCOPE_KEY)
  const value = result[PANEL_SCOPE_KEY]
  return value === 'per_tab' ? 'per_tab' : 'always_open'
}

export async function setPanelScope(scope: PanelScope): Promise<void> {
  await browser.storage.local.set({ [PANEL_SCOPE_KEY]: scope })
}

export async function getFontSizes(): Promise<FontSizes> {
  const result = await browser.storage.local.get([
    INPUT_FONT_SIZE_KEY,
    CONVERSATION_FONT_SIZE_KEY,
  ])
  return {
    inputFontSize: normalizeFontSize(result[INPUT_FONT_SIZE_KEY], DEFAULT_INPUT_FONT_SIZE),
    conversationFontSize: normalizeFontSize(
      result[CONVERSATION_FONT_SIZE_KEY],
      DEFAULT_CONVERSATION_FONT_SIZE
    ),
  }
}

export async function setFontSizes(sizes: FontSizes): Promise<void> {
  await browser.storage.local.set({
    [INPUT_FONT_SIZE_KEY]: normalizeFontSize(sizes.inputFontSize, DEFAULT_INPUT_FONT_SIZE),
    [CONVERSATION_FONT_SIZE_KEY]: normalizeFontSize(
      sizes.conversationFontSize,
      DEFAULT_CONVERSATION_FONT_SIZE
    ),
  })
}
