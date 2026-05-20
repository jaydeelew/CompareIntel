import type { Locator } from '@playwright/test'

export type ComposerPasteFilePayload = {
  /** UTF-8 string or byte array for binary content */
  content: string | number[]
  name: string
  type: string
}

/**
 * Simulates pasting a file into the composer textarea.
 *
 * Firefox does not expose files on synthetic ClipboardEvent.clipboardData (see WPT
 * clipboard tests); attaching the DataTransfer to a plain paste Event matches
 * how file data remains available in Firefox while Chromium accepts both forms.
 */
export async function dispatchComposerFilePaste(
  textarea: Locator,
  payload: ComposerPasteFilePayload
): Promise<void> {
  await textarea.evaluate((el, p) => {
    const body = typeof p.content === 'string' ? p.content : new Uint8Array(p.content)
    const file = new File([body], p.name, { type: p.type })
    const dt = new DataTransfer()
    dt.items.add(file)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: dt })
    el.dispatchEvent(event)
  }, payload)
}
