import browser from 'webextension-polyfill'

export type PanelScope = 'always_open' | 'per_tab'

const STORAGE_KEY = 'panelScope'

export const DEFAULT_PANEL_SCOPE: PanelScope = 'always_open'

export async function getPanelScope(): Promise<PanelScope> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const value = result[STORAGE_KEY]
  return value === 'per_tab' ? 'per_tab' : 'always_open'
}

export async function setPanelScope(scope: PanelScope): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: scope })
}
