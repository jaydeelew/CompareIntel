const IMAGE_MIME_PREFIX = 'image/'

function mimeToExtension(mime: string): string {
  const normalized = mime.toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('pdf')) return 'pdf'
  if (normalized.includes('markdown')) return 'md'
  if (normalized === 'text/plain') return 'txt'
  if (normalized.includes('json')) return 'json'
  if (normalized.includes('html')) return 'html'
  if (normalized.includes('xml')) return 'xml'
  const slash = normalized.indexOf('/')
  if (slash >= 0 && slash < normalized.length - 1) {
    return normalized.slice(slash + 1).replace(/[^a-z0-9]/gi, '') || 'bin'
  }
  return 'bin'
}

function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith(IMAGE_MIME_PREFIX)
}

/** Clipboard screenshots often have an empty name; give a stable label for chips and placeholders. */
export function normalizeClipboardImageFile(file: File): File {
  if (file.name.trim()) return file
  const mime = file.type?.toLowerCase().startsWith(IMAGE_MIME_PREFIX) ? file.type : 'image/png'
  const ext = mimeToExtension(mime)
  return new File([file], `pasted-image.${ext}`, { type: mime })
}

/** Assign a stable filename when the OS omits one (common for screenshots and copied files). */
export function normalizeClipboardFile(file: File): File {
  if (file.name.trim()) return file
  const mime = file.type || 'application/octet-stream'
  if (isImageMime(mime)) return normalizeClipboardImageFile(file)
  const ext = mimeToExtension(mime)
  return new File([file], `pasted-file.${ext}`, { type: mime })
}

function pushFile(files: File[], seen: Set<File>, raw: File | null) {
  if (!raw || seen.has(raw)) return
  seen.add(raw)
  files.push(normalizeClipboardFile(raw))
}

/**
 * Collects file entries from the clipboard (items and files lists).
 * Does not include plain-text clipboard payloads.
 */
export function getFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return []

  const files: File[] = []
  const seen = new Set<File>()

  if (clipboardData.items?.length) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i]
      if (item.kind === 'string') continue
      pushFile(files, seen, item.getAsFile())
    }
  }

  if (clipboardData.files?.length) {
    for (const file of Array.from(clipboardData.files)) {
      pushFile(files, seen, file)
    }
  }

  return files
}

/** First attachable file on the clipboard, or null when the user is pasting text only. */
export function getFirstFileFromClipboard(clipboardData: DataTransfer | null): File | null {
  const files = getFilesFromClipboard(clipboardData)
  return files[0] ?? null
}

export function clipboardHasPasteableFiles(clipboardData: DataTransfer | null): boolean {
  return getFilesFromClipboard(clipboardData).length > 0
}
