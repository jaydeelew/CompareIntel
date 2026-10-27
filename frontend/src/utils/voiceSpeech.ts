/**
 * Voice-mode spoken replies: strip leftover markdown before TTS and display.
 * Keep in sync with backend/app/llm/voice_speech.py.
 */

const EMOJI_RE =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u{1F1E6}-\u{1F1FF}]/gu
const VARIATION_SELECTOR_RE = /[\uFE00-\uFE0F]/g

export function sanitizeVoiceSpeech(text: string): string {
  if (!text) return ''
  let s = text
  s = s.replace(/```[\w+-]*\n?[\s\S]*?```/g, ' ')
  s = s.replace(/```[\s\S]*/g, ' ')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/`/g, '')
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/^>\s?/gm, '')
  s = s.replace(/^\s*([-*_]){3,}\s*$/gm, '')
  s = s.replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, '')
  s = s.replace(/\|/g, ' ')
  s = s.replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, '$1')
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
  s = s.replace(/\*\*(.+?)\*\*/g, '$1')
  s = s.replace(/__(.+?)__/g, '$1')
  s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
  s = s.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1')
  s = s.replace(/~~(.+?)~~/g, '$1')
  s = s.replace(/\*\*/g, '').replace(/__/g, '')
  s = s.replace(VARIATION_SELECTOR_RE, '')
  s = s.replace(EMOJI_RE, '')
  s = s.replace(/[ \t]+/g, ' ')
  s = s.replace(/\s+/g, ' ')
  return s.trim()
}
