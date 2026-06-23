import { describe, expect, it } from 'vitest'

import { buildPromptWithPageContext, sanitizePageText, truncateText } from '../promptBuilder'
import type { TabContextBundle } from '../types'

describe('promptBuilder', () => {
  it('returns user prompt when no context', () => {
    expect(buildPromptWithPageContext('hello', null)).toBe('hello')
  })

  it('wraps page content with injection-safe structure', () => {
    const bundle: TabContextBundle = {
      tabs: [
        {
          tabId: 1,
          url: 'https://example.com',
          title: 'Example',
          text: 'Page body text',
          selection: '',
          extractedAt: Date.now(),
        },
      ],
      tokenEstimate: 10,
    }
    const result = buildPromptWithPageContext('What is this about?', bundle)
    expect(result).toContain('USER QUESTION: What is this about?')
    expect(result).toContain('UNTRUSTED DATA')
    expect(result).toContain('WEBPAGE DATA')
    expect(result).toContain('Example (https://example.com)')
    expect(result).toContain('Page body text')
  })

  it('sanitizes zero-width characters', () => {
    expect(sanitizePageText('hello\u200Bworld')).toBe('helloworld')
  })

  it('truncates long text', () => {
    const long = 'a'.repeat(100)
    expect(truncateText(long, 50).length).toBeGreaterThan(50)
    expect(truncateText(long, 50)).toContain('truncated')
  })
})
