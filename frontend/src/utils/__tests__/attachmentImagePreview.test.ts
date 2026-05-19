import { describe, expect, it } from 'vitest'

import type { AttachedFile } from '../../components/comparison/FileUpload'
import { getImageAttachmentPreviewSrc, isImageAttachment } from '../attachmentImagePreview'

describe('attachmentImagePreview', () => {
  it('detects image attachments by base64Data', () => {
    const image: AttachedFile = {
      id: '1',
      file: new File([], 'a.png', { type: 'image/png' }),
      name: 'a.png',
      placeholder: '[image: a.png]',
      base64Data: 'abc',
      mimeType: 'image/png',
    }
    expect(isImageAttachment(image)).toBe(true)
    expect(getImageAttachmentPreviewSrc(image)).toBe('data:image/png;base64,abc')
  })

  it('returns null for non-image attachments', () => {
    const doc: AttachedFile = {
      id: '2',
      file: new File([], 'doc.txt', { type: 'text/plain' }),
      name: 'doc.txt',
      placeholder: '[file: doc.txt]',
    }
    expect(isImageAttachment(doc)).toBe(false)
    expect(getImageAttachmentPreviewSrc(doc)).toBeNull()
  })
})
