/** HEIC/HEIF MIME types reported by iOS, macOS, and some browsers. */
export const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
] as const

export const HEIC_EXTENSIONS = ['.heic', '.heif'] as const

const JPEG_QUALITY = 0.92

export function isHeicFile(file: File): boolean {
  const mime = file.type?.toLowerCase() ?? ''
  const name = file.name.toLowerCase()
  return (
    HEIC_MIME_TYPES.some(type => mime === type || mime.includes('heic') || mime.includes('heif')) ||
    HEIC_EXTENSIONS.some(ext => name.endsWith(ext))
  )
}

/** Replace HEIC/HEIF extension with .jpg for the converted attachment name. */
export function heicOutputFileName(originalName: string): string {
  const trimmed = originalName.trim()
  if (!trimmed) return 'photo.jpg'
  const lower = trimmed.toLowerCase()
  for (const ext of HEIC_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return `${trimmed.slice(0, -ext.length)}.jpg`
    }
  }
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? trimmed : `${trimmed}.jpg`
}

type Heic2AnyFn = (options: {
  blob: Blob
  toType: string
  quality: number
}) => Promise<Blob | Blob[]>

let heic2anyModule: Heic2AnyFn | null = null

async function loadHeic2Any(): Promise<Heic2AnyFn> {
  if (!heic2anyModule) {
    const mod = await import('heic2any')
    heic2anyModule = mod.default as Heic2AnyFn
  }
  return heic2anyModule
}

/**
 * Convert a HEIC/HEIF file to JPEG for vision-model upload.
 * Dynamically imports heic2any only when conversion runs.
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = await loadHeic2Any()
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  })

  const blob = Array.isArray(result) ? result[0] : result
  if (!blob) {
    throw new Error('HEIC conversion produced no image data')
  }

  return new File([blob], heicOutputFileName(file.name), { type: 'image/jpeg' })
}
