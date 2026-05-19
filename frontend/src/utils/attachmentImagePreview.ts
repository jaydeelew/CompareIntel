import type { AttachedFile, StoredAttachedFile } from '../components/comparison/FileUpload'

export function isImageAttachment(f: AttachedFile | StoredAttachedFile): boolean {
  return 'base64Data' in f && !!(f as AttachedFile).base64Data
}

/** Data URL for composer image thumbnail previews. */
export function getImageAttachmentPreviewSrc(f: AttachedFile | StoredAttachedFile): string | null {
  if (!isImageAttachment(f)) return null
  const attached = f as AttachedFile
  const mime = attached.mimeType || 'image/png'
  return `data:${mime};base64,${attached.base64Data}`
}
