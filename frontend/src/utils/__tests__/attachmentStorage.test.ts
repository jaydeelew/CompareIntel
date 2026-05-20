import { describe, expect, it } from 'vitest'

import type { StoredAttachedFile } from '../../components/comparison/FileUpload'
import {
  attachedFilesToStoredRecords,
  collectFileContentsForStorage,
  getImageAttachmentsForApi,
  storedRecordsToAttachedFiles,
} from '../attachmentStorage'

describe('attachmentStorage', () => {
  it('round-trips image records to StoredAttachedFile', () => {
    const records = [
      {
        name: 'photo.png',
        placeholder: '[image: photo.png]',
        mime_type: 'image/png',
        base64_data: 'YWJj',
      },
    ]
    const restored = storedRecordsToAttachedFiles(records)
    expect(restored[0]).toMatchObject({
      name: 'photo.png',
      base64Data: 'YWJj',
      mimeType: 'image/png',
    })
  })

  it('round-trips text records', () => {
    const records = [
      {
        name: 'notes.txt',
        placeholder: '[file: notes.txt]',
        content: 'hello',
      },
    ]
    const restored = storedRecordsToAttachedFiles(records)
    expect(restored[0]).toMatchObject({
      name: 'notes.txt',
      content: 'hello',
    })
  })

  it('getImageAttachmentsForApi includes stored images', () => {
    const files: StoredAttachedFile[] = [
      {
        id: '1',
        name: 'x.jpg',
        placeholder: '[image: x.jpg]',
        base64Data: 'eA==',
        mimeType: 'image/jpeg',
      },
    ]
    expect(getImageAttachmentsForApi(files)).toEqual([
      {
        mime_type: 'image/jpeg',
        base64_data: 'eA==',
        filename: 'x.jpg',
        placeholder: '[image: x.jpg]',
      },
    ])
  })

  it('collectFileContentsForStorage merges new extracts and stored attachments', async () => {
    const stored: StoredAttachedFile[] = [
      {
        id: 's1',
        name: 'old.png',
        placeholder: '[image: old.png]',
        base64Data: 'old',
        mimeType: 'image/png',
      },
    ]
    const withFile = {
      id: 'f1',
      name: 'doc.txt',
      placeholder: '[file: doc.txt]',
      file: new File(['text'], 'doc.txt', { type: 'text/plain' }),
    }
    const result = await collectFileContentsForStorage([withFile, ...stored], async () => [
      { name: 'doc.txt', placeholder: '[file: doc.txt]', content: 'text' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('text')
    expect(result[1].base64_data).toBe('old')
  })

  it('attachedFilesToStoredRecords serializes images', () => {
    const records = attachedFilesToStoredRecords([
      {
        id: '1',
        name: 'a.png',
        placeholder: '[image: a.png]',
        base64Data: 'qq',
        mimeType: 'image/png',
      },
    ])
    expect(records[0].base64_data).toBe('qq')
    expect(records[0].mime_type).toBe('image/png')
  })
})
