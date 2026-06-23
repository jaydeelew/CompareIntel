const DEFAULT_MODEL_ERROR = 'Model returned an error'

/** Turn streamed model output into a user-visible error message. */
export function deriveStreamErrorMessage(
  content: string,
  fallback: string = DEFAULT_MODEL_ERROR
): string {
  const trimmed = content.trim()
  if (!trimmed) return fallback

  const errorMatch = trimmed.match(/^Error:\s*(.+)$/is)
  if (errorMatch) {
    const detail = errorMatch[1].trim()
    return detail || fallback
  }

  return trimmed
}
