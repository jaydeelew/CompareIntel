const IMAGE_MIME_PREFIX = 'image/'

function mimeToExtension(mime: string): string {
  const normalized = mime.toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('png')) return 'png'
  return 'png'
}

/** Clipboard screenshots often have an empty name; give a stable label for chips and placeholders. */
export function normalizeClipboardImageFile(file: File): File {
  if (file.name.trim()) return file
  const mime = file.type?.toLowerCase().startsWith(IMAGE_MIME_PREFIX) ? file.type : 'image/png'
  const ext = mimeToExtension(mime)
  return new File([file], `pasted-image.${ext}`, { type: mime })
}

function isClipboardImageFile(file: File): boolean {
  const mime = file.type?.toLowerCase() ?? ''
  return mime.startsWith(IMAGE_MIME_PREFIX)
}

/**
 * Returns the first image file from the clipboard, if any.
 * Used when the user pastes a screenshot or copied image into the composer.
 */
export function getImageFileFromClipboard(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null

  if (clipboardData.items?.length) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i]
      if (!item.type.toLowerCase().startsWith(IMAGE_MIME_PREFIX)) continue
      const file = item.getAsFile()
      if (file && isClipboardImageFile(file)) {
        return normalizeClipboardImageFile(file)
      }
    }
  }

  if (clipboardData.files?.length) {
    for (const file of Array.from(clipboardData.files)) {
      if (isClipboardImageFile(file)) {
        return normalizeClipboardImageFile(file)
      }
    }
  }

  return null
}

export function clipboardHasImageFile(clipboardData: DataTransfer | null): boolean {
  return getImageFileFromClipboard(clipboardData) !== null
}
