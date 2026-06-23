import browser from 'webextension-polyfill'

const STORAGE_KEY = 'pageContextIntroAcknowledged'

export async function hasAcknowledgedPageContextIntro(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] === true
}

export async function acknowledgePageContextIntro(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: true })
}
