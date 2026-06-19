import type { TabContextMessage, TabContextResponse } from '@compareintel/core'
import browser from 'webextension-polyfill'

export async function sendTabContextMessage<T extends TabContextResponse>(
  message: TabContextMessage
): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as T
  if (response?.type === 'ERROR') {
    throw new Error(response.message)
  }
  return response
}
