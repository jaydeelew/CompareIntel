import { describe, expect, it } from 'vitest'

import {
  clipboardHasPasteableFiles,
  getFilesFromClipboard,
  getFirstFileFromClipboard,
  normalizeClipboardFile,
  normalizeClipboardImageFile,
} from '../clipboardFiles'

function mockClipboardData(
  options: {
    items?: Array<{ kind?: string; type: string; getAsFile: () => File | null }>
    files?: File[]
    types?: string[]
  } = {}
): DataTransfer {
  const itemDefs = options.items ?? []
  const files = options.files ?? []
  const itemList = itemDefs.map(item => ({
    kind: item.kind ?? 'file',
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

describe('clipboardFiles', () => {
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

  describe('normalizeClipboardFile', () => {
    it('assigns a filename for unnamed non-image files', () => {
      const unnamed = new File(['hello'], '', { type: 'text/plain' })
      const normalized = normalizeClipboardFile(unnamed)
      expect(normalized.name).toBe('pasted-file.txt')
    })
  })

  describe('getFirstFileFromClipboard', () => {
    it('returns null when clipboard has only text', () => {
      const dt = mockClipboardData({
        types: ['text/plain'],
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [],
      })
      expect(getFirstFileFromClipboard(dt)).toBeNull()
      expect(clipboardHasPasteableFiles(dt)).toBe(false)
    })

    it('returns the first image from clipboard items', () => {
      const image = new File([new Uint8Array([1])], '', { type: 'image/png' })
      const dt = mockClipboardData({
        items: [{ type: 'image/png', getAsFile: () => image }],
      })
      const result = getFirstFileFromClipboard(dt)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('pasted-image.png')
      expect(result!.type).toBe('image/png')
    })

    it('returns pasted document files', () => {
      const pdf = new File([new Uint8Array([1])], 'report.pdf', { type: 'application/pdf' })
      const dt = mockClipboardData({
        items: [{ type: 'application/pdf', getAsFile: () => pdf }],
      })
      expect(getFirstFileFromClipboard(dt)?.name).toBe('report.pdf')
    })

    it('returns text files copied from the file system', () => {
      const txt = new File(['content'], 'notes.txt', { type: 'text/plain' })
      const dt = mockClipboardData({
        items: [],
        files: [txt],
        types: ['Files'],
      })
      expect(getFirstFileFromClipboard(dt)?.name).toBe('notes.txt')
    })

    it('skips string clipboard items and returns the file entry', () => {
      const doc = new File(['text'], 'notes.txt', { type: 'text/plain' })
      const dt = mockClipboardData({
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { type: 'text/plain', getAsFile: () => doc },
        ],
      })
      expect(getFirstFileFromClipboard(dt)?.name).toBe('notes.txt')
    })

    it('collects multiple files but getFirst returns only the first', () => {
      const a = new File(['a'], 'a.txt', { type: 'text/plain' })
      const b = new File(['b'], 'b.txt', { type: 'text/plain' })
      const dt = mockClipboardData({ files: [a, b], types: ['Files'] })
      expect(getFilesFromClipboard(dt)).toHaveLength(2)
      expect(getFirstFileFromClipboard(dt)?.name).toBe('a.txt')
    })
  })
})
