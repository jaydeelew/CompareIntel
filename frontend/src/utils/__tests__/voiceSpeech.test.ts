import { describe, expect, it } from 'vitest'

import { sanitizeVoiceSpeech } from '../voiceSpeech'

describe('sanitizeVoiceSpeech', () => {
  it('strips tables, lists, headers, emphasis, code, links, and emoji', () => {
    const raw = [
      '# Title',
      '',
      'Here is **bold** and *italic* and `code`.',
      '- first item',
      '1. second item',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      'See [docs](https://example.com) for more.',
      '```python',
      "print('nope')",
      '```',
      'Hello 😀 there.',
    ].join('\n')

    const cleaned = sanitizeVoiceSpeech(raw)
    expect(cleaned).not.toMatch(/#|\*\*|`|\||```|https:\/\/example\.com|😀/)
    expect(cleaned).not.toContain('- first')
    expect(cleaned).not.toContain('1.')
    expect(cleaned).toContain('bold')
    expect(cleaned).toContain('italic')
    expect(cleaned).toContain('code')
    expect(cleaned).toContain('docs')
    expect(cleaned).toContain('Hello')
    expect(cleaned).toContain('there')
  })

  it('leaves plain speech unchanged', () => {
    expect(sanitizeVoiceSpeech('Just a spoken sentence.')).toBe('Just a spoken sentence.')
    expect(sanitizeVoiceSpeech('')).toBe('')
  })
})
