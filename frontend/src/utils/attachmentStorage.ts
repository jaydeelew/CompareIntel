import type { AttachedFile, StoredAttachedFile } from '../components/comparison/FileUpload'

/** Serialized attachment row in localStorage or API `file_contents`. */
export interface StoredFileContentRecord {
  name: string
  placeholder: string
  content?: string
  mime_type?: string
  base64_data?: string
}

export function isImageStoredRecord(record: StoredFileContentRecord): boolean {
  return Boolean(record.base64_data)
}

export function storedRecordsToAttachedFiles(
  records: StoredFileContentRecord[] | undefined
): StoredAttachedFile[] {
  if (!records?.length) return []

  return records.map((record, index) => {
    const id = `stored-${index}-${record.name}`
    if (isImageStoredRecord(record)) {
      return {
        id,
        name: record.name,
        placeholder: record.placeholder,
        base64Data: record.base64_data,
        mimeType: record.mime_type || 'image/png',
      }
    }
    return {
      id,
      name: record.name,
      placeholder: record.placeholder,
      content: record.content || '',
    }
  })
}

export function attachedFilesToStoredRecords(
  files: (AttachedFile | StoredAttachedFile)[]
): StoredFileContentRecord[] {
  return files.map(f => {
    if ('base64Data' in f && f.base64Data) {
      return {
        name: f.name,
        placeholder: f.placeholder,
        mime_type: ('mimeType' in f && f.mimeType) || 'image/png',
        base64_data: f.base64Data,
      }
    }
    const content = 'content' in f ? f.content : ''
    return {
      name: f.name,
      placeholder: f.placeholder,
      content,
    }
  })
}

export type ImageAttachmentForApi = {
  mime_type: string
  base64_data: string
  filename: string
  placeholder: string
}

/** Persist all attachments for anonymous local history (text + images). */
export async function collectFileContentsForStorage(
  attachedFiles: (AttachedFile | StoredAttachedFile)[],
  extractFromFiles: (files: AttachedFile[]) => Promise<StoredFileContentRecord[]>
): Promise<StoredFileContentRecord[]> {
  const withFileObject = attachedFiles.filter(
    (f): f is AttachedFile => 'file' in f && f.file instanceof File
  )
  const alreadyStored = attachedFiles.filter(
    f => !('file' in f && (f as AttachedFile).file instanceof File)
  )
  const fromNew = withFileObject.length > 0 ? await extractFromFiles(withFileObject) : []
  return [...fromNew, ...attachedFilesToStoredRecords(alreadyStored)]
}

export function getImageAttachmentsForApi(
  files: (AttachedFile | StoredAttachedFile)[]
): ImageAttachmentForApi[] {
  return files
    .filter(f => 'base64Data' in f && !!f.base64Data)
    .map(f => ({
      mime_type: ('mimeType' in f && f.mimeType) || 'image/png',
      base64_data: f.base64Data as string,
      filename: f.name,
      placeholder: f.placeholder,
    }))
}
