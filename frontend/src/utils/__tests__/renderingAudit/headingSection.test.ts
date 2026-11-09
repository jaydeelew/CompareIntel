import { describe, expect, it } from 'vitest'

import { extractHeadingSection, headingPositions } from './section'

const SAMPLE = `# Title

Intro.

## Alpha

alpha body

### Nested

nested body

## Bravo

bravo body
`

describe('extractHeadingSection', () => {
  it('takes an ATX heading through the next same-or-higher heading', () => {
    const alpha = extractHeadingSection(SAMPLE, '^## Alpha')
    expect(alpha).toContain('## Alpha')
    expect(alpha).toContain('### Nested')
    expect(alpha).not.toContain('## Bravo')
  })

  it('can stop only at a higher heading so sibling sections stay together', () => {
    const both = extractHeadingSection(SAMPLE, '^## Alpha', 1)
    expect(both).toContain('## Alpha')
    expect(both).toContain('## Bravo')
  })

  it('returns the whole document when there are no headings', () => {
    const body = '1. **Links**\n\n   See [Wikipedia](https://example.com).\n'
    expect(extractHeadingSection(body, 'Links')).toBe(body.replace(/\s+$/, '') + '\n')
    expect(headingPositions(body.split('\n'))).toEqual([])
  })
})
