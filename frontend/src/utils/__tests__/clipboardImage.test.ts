import { describe, expect, it } from 'vitest'

import {
  clipboardHasImageFile,
  getImageFileFromClipboard,
  normalizeClipboardImageFile,
} from '../clipboardImage'

function mockClipboardData(
  options: {
    items?: Array<{ type: string; getAsFile: () => File | null }>
    files?: File[]
    types?: string[]
  } = {}
): DataTransfer {
  const itemDefs = options.items ?? []
  const files = options.files ?? []
  const itemList = itemDefs.map(item => ({
    kind: 'file' as const,
    type: item.type,
    getAsFile: item.getAsFile,
  }))
  Object.defineProperty(itemList, 'length', { value: itemDefs.length })
  return {
    items: itemList as unknown as DataTransferItemList,
    files: files as unknown as FileList,
    types: options.types ?? itemDefs.map(item => item.type),
  } as DataTransfer
}

describe('clipboardImage', () => {
  describe('normalizeClipboardImageFile', () => {
    it('assigns a filename when the clipboard image has no name', () => {
      const unnamed = new File([new Uint8Array([1, 2, 3])], '', { type: 'image/png' })
      const normalized = normalizeClipboardImageFile(unnamed)
      expect(normalized.name).toBe('pasted-image.png')
      expect(normalized.type).toBe('image/png')
    })

    it('preserves an existing filename', () => {
      const named = new File(['x'], 'screenshot.png', { type: 'image/png' })
      expect(normalizeClipboardImageFile(named)).toBe(named)
    })
  })

  describe('getImageFileFromClipboard', () => {
    it('returns null when clipboard has only text', () => {
      const dt = mockClipboardData({ types: ['text/plain'], items: [], files: [] })
      expect(getImageFileFromClipboard(dt)).toBeNull()
      expect(clipboardHasImageFile(dt)).toBe(false)
    })

    it('returns the first image from clipboard items', () => {
      const image = new File([new Uint8Array([1])], '', { type: 'image/png' })
      const dt = mockClipboardData({
        items: [{ type: 'image/png', getAsFile: () => image }],
      })
      const result = getImageFileFromClipboard(dt)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('pasted-image.png')
      expect(result!.type).toBe('image/png')
    })

    it('ignores non-image files on the clipboard', () => {
      const doc = new File(['text'], 'notes.txt', { type: 'text/plain' })
      const dt = mockClipboardData({
        items: [{ type: 'text/plain', getAsFile: () => doc }],
      })
      expect(getImageFileFromClipboard(dt)).toBeNull()
    })

    it('reads images from clipboardData.files when items have no image', () => {
      const image = new File([new Uint8Array([1])], 'clip.jpeg', { type: 'image/jpeg' })
      const dt = mockClipboardData({
        items: [],
        files: [image],
      })
      const result = getImageFileFromClipboard(dt)
      expect(result?.name).toBe('clip.jpeg')
      expect(result?.type).toBe('image/jpeg')
    })
  })
})
