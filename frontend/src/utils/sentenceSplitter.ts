/**
 * Split streaming assistant text into speakable sentences.
 * Incomplete trailing text stays in `rest` until a terminator or flush.
 */

const SENTENCE_END = /([.!?…]+)(\s+|$)/g

export function splitCompleteSentences(buffer: string): { complete: string[]; rest: string } {
  const complete: string[] = []
  let lastIndex = 0
  const re = new RegExp(SENTENCE_END.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(buffer)) !== null) {
    const end = match.index + match[0].length
    const sentence = buffer.slice(lastIndex, end).trim()
    if (sentence) complete.push(sentence)
    lastIndex = end
  }
  return { complete, rest: buffer.slice(lastIndex) }
}

/** Newly speakable sentences since `spokenPrefix` was last flushed. */
export function nextSpeakableSentences(
  fullText: string,
  spokenPrefix: string,
  flushRemainder: boolean
): { sentences: string[]; spokenPrefix: string } {
  const incoming = fullText.startsWith(spokenPrefix)
    ? fullText.slice(spokenPrefix.length)
    : fullText
  const { complete, rest } = splitCompleteSentences(incoming)
  const sentences = [...complete]
  let prefix = spokenPrefix + complete.join(complete.length ? ' ' : '')
  if (flushRemainder && rest.trim()) {
    sentences.push(rest.trim())
    prefix = fullText
  }
  // Reconstruct spoken prefix from original text when possible so spaces stay aligned.
  if (fullText.startsWith(spokenPrefix) && !flushRemainder) {
    const consumed = fullText.length - rest.length
    prefix = fullText.slice(0, Math.max(spokenPrefix.length, consumed))
  }
  return { sentences, spokenPrefix: prefix }
}
