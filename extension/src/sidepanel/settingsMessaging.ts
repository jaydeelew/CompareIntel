import type { PanelScope } from '../shared/extensionSettings'
import browser from 'webextension-polyfill'

type SettingsMessage =
  | { type: 'GET_PANEL_SCOPE' }
  | { type: 'SET_PANEL_SCOPE'; scope: PanelScope }

type SettingsResponse =
  | { type: 'PANEL_SCOPE'; scope: PanelScope }
  | { type: 'OK' }
  | { type: 'ERROR'; message: string }

async function sendSettingsMessage(message: SettingsMessage): Promise<SettingsResponse> {
  if (typeof browser.runtime?.sendMessage !== 'function') {
    throw new Error('Extension runtime is unavailable')
  }
  const response = (await browser.runtime.sendMessage(message)) as SettingsResponse
  if (response?.type === 'ERROR') {
    throw new Error(response.message)
  }
  return response
}

export async function applyPanelScope(scope: PanelScope): Promise<void> {
  await sendSettingsMessage({ type: 'SET_PANEL_SCOPE', scope })
}

export async function fetchPanelScope(): Promise<PanelScope> {
  const response = await sendSettingsMessage({ type: 'GET_PANEL_SCOPE' })
  if (response.type === 'PANEL_SCOPE') {
    return response.scope
  }
  throw new Error('Unexpected settings response')
}
