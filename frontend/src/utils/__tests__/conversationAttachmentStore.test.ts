import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  externalizeImageAttachmentsForStorage,
  hydrateStoredFileContents,
  loadLocalConversationRecord,
  parseLocalConversationRecord,
} from '../conversationAttachmentStore'

describe('conversationAttachmentStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('externalizes image base64 to IndexedDB and hydrates on load', async () => {
    const conversationId = '12345'
    const externalized = await externalizeImageAttachmentsForStorage(conversationId, [
      {
        name: 'photo.jpg',
        placeholder: '[image: photo.jpg]',
        mime_type: 'image/jpeg',
        base64_data: 'abc123',
      },
    ])

    expect(externalized[0].base64_data).toBeUndefined()
    expect(externalized[0].attachment_ref).toContain(conversationId)

    const hydrated = await hydrateStoredFileContents(conversationId, externalized)
    expect(hydrated[0].base64_data).toBe('abc123')
    expect(hydrated[0].mime_type).toBe('image/jpeg')
  })

  it('loadLocalConversationRecord hydrates attachments from IndexedDB', async () => {
    const conversationId = '999'
    const externalized = await externalizeImageAttachmentsForStorage(conversationId, [
      {
        name: 'snap.jpeg',
        placeholder: '[image: snap.jpeg]',
        mime_type: 'image/jpeg',
        base64_data: 'jpeg-data',
      },
    ])

    localStorage.setItem(
      `compareintel_conversation_${conversationId}`,
      JSON.stringify({
        input_data: '',
        models_used: ['openai/gpt-4o'],
        messages: [],
        file_contents: externalized,
      })
    )

    const loaded = await loadLocalConversationRecord(conversationId)
    expect(loaded?.file_contents?.[0]?.base64_data).toBe('jpeg-data')
  })

  it('parseLocalConversationRecord returns null when missing', () => {
    expect(parseLocalConversationRecord('missing')).toBeNull()
  })
})
