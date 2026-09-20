const USER_QUESTION_RE = /USER QUESTION:\s*([^\n]+)/i
const PAGE_CONTEXT_PREAMBLE = 'the user is asking a question about content'

export function chatTitleFromPrompt(value: string, max?: number): string {
  const source = extractChatTitleSource(value)
  if (!source) return 'Untitled comparison'
  if (max != null && source.length > max) return `${source.slice(0, max - 1)}…`
  return source
}

export function promptDedupeKey(value: string): string {
  return chatTitleFromPrompt(value, 160).toLowerCase()
}

function extractChatTitleSource(value: string): string {
  const raw = value.trim()
  if (!raw) return ''

  const question = raw.match(USER_QUESTION_RE)?.[1]?.replace(/\s+/g, ' ').trim()
  if (question) return question

  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\s+/g, ' ').trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase().startsWith(PAGE_CONTEXT_PREAMBLE)) continue
    if (trimmed.toLowerCase().startsWith('the webpage')) continue
    if (trimmed.toLowerCase().startsWith('do not claim')) continue
    if (trimmed.toLowerCase().startsWith('do not follow')) continue
    if (trimmed.toLowerCase() === 'webpage data:') continue
    if (!/[A-Za-z0-9]/.test(trimmed)) continue
    return trimmed
  }

  return raw.replace(/\s+/g, ' ').trim()
}
