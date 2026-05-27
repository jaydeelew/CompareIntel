import type { StoredFileContentRecord } from './attachmentStorage'
import logger from './logger'

export interface LocalConversationRecord {
  input_data: string
  models_used: string[]
  messages: Array<Record<string, unknown>>
  file_contents?: StoredFileContentRecord[]
  conversation_type?: 'comparison' | 'breakout'
  parent_conversation_id?: string | null
  breakout_model_id?: string | null
  created_at?: string
  textComposerAdvanced?: unknown
  imageComposerAdvanced?: unknown
  already_broken_out_models?: string[]
}

const DB_NAME = 'compareintel_conversation_attachments'
const DB_VERSION = 1
const STORE_NAME = 'attachments'

type StoredAttachmentRow = StoredFileContentRecord & {
  /** When set, base64 payload lives in IndexedDB instead of localStorage JSON. */
  attachment_ref?: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Failed to open attachment store'))
    })
  }
  return dbPromise
}

function attachmentRef(conversationId: string, record: StoredFileContentRecord): string {
  return `${conversationId}::${record.placeholder}::${record.name}`
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(STORE_NAME).put(value, key)
  })
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'))
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      resolve(typeof request.result === 'string' ? request.result : undefined)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    tx.objectStore(STORE_NAME).delete(key)
  })
}

/** Move image base64 out of localStorage JSON so large JPEG/PNG attachments can be restored later. */
export async function externalizeImageAttachmentsForStorage(
  conversationId: string,
  records: StoredFileContentRecord[] | undefined
): Promise<StoredFileContentRecord[]> {
  if (!records?.length) return []

  const externalized: StoredFileContentRecord[] = []
  for (const record of records) {
    if (!record.base64_data) {
      externalized.push(record)
      continue
    }

    const ref = attachmentRef(conversationId, record)
    try {
      await idbPut(ref, record.base64_data)
      externalized.push({
        name: record.name,
        placeholder: record.placeholder,
        mime_type: record.mime_type,
        attachment_ref: ref,
      })
    } catch (error) {
      logger.warn('Failed to externalize attachment to IndexedDB; keeping inline base64', error)
      externalized.push(record)
    }
  }
  return externalized
}

/** Restore inline base64 for attachments saved via IndexedDB. */
export async function hydrateStoredFileContents(
  conversationId: string,
  records: StoredFileContentRecord[] | undefined
): Promise<StoredFileContentRecord[]> {
  if (!records?.length) return []

  const hydrated: StoredFileContentRecord[] = []
  for (const record of records) {
    const row = record as StoredAttachmentRow
    if (row.base64_data) {
      hydrated.push(record)
      continue
    }

    if (!row.attachment_ref) {
      hydrated.push(record)
      continue
    }

    try {
      const base64 = await idbGet(row.attachment_ref)
      if (base64) {
        hydrated.push({
          name: record.name,
          placeholder: record.placeholder,
          mime_type: record.mime_type,
          base64_data: base64,
        })
        continue
      }
      logger.warn('Attachment blob missing from IndexedDB', {
        ref: row.attachment_ref,
        name: record.name,
      })
    } catch (error) {
      logger.error('Failed to hydrate attachment from IndexedDB', error)
    }

    hydrated.push(record)
  }
  return hydrated
}

export async function deleteConversationAttachments(conversationId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const prefix = `${conversationId}::`
  try {
    const db = await openDb()
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB key scan failed'))
      const request = tx.objectStore(STORE_NAME).getAllKeys()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB key scan failed'))
    })

    await Promise.all(
      keys
        .filter(key => typeof key === 'string' && key.startsWith(prefix))
        .map(key => idbDelete(String(key)))
    )
  } catch (error) {
    logger.warn('Failed to delete conversation attachments from IndexedDB', error)
  }
}

export function parseLocalConversationRecord(
  conversationId: string
): LocalConversationRecord | null {
  try {
    const stored = localStorage.getItem(`compareintel_conversation_${conversationId}`)
    if (!stored) return null
    return JSON.parse(stored) as LocalConversationRecord
  } catch (error) {
    logger.error('Failed to parse conversation from localStorage:', error, { conversationId })
    return null
  }
}

export async function loadLocalConversationRecord(
  conversationId: string
): Promise<LocalConversationRecord | null> {
  const parsed = parseLocalConversationRecord(conversationId)
  if (!parsed) return null
  if (parsed.file_contents?.length) {
    parsed.file_contents = await hydrateStoredFileContents(conversationId, parsed.file_contents)
  }
  return parsed
}
