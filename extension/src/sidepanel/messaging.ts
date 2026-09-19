import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import browser from 'webextension-polyfill'

export async function sendTabContextMessage<T extends TabContextResponse>(
  message: TabContextMessage
): Promise<T> {
  if (typeof browser.runtime?.sendMessage !== 'function') {
    throw new Error('Extension runtime is unavailable')
  }
  const response = (await browser.runtime.sendMessage(message)) as T
  if (response?.type === 'ERROR') {
    throw new Error(response.message)
  }
  return response
}
