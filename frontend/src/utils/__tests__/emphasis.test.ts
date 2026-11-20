import { describe, expect, it } from 'vitest'

import { replaceSingleUnderscoreEm } from '../latex/emphasis'

describe('replaceSingleUnderscoreEm', () => {
  it('does not emphasize intra-word underscores', () => {
    const input = 'Unescaped file_name_here may italicize wrongly.'
    expect(replaceSingleUnderscoreEm(input)).toBe(input)
  })

  it('emphasizes when delimiters are not intra-word', () => {
    expect(replaceSingleUnderscoreEm('_emphasis_ text')).toBe('<em>emphasis</em> text')
  })

  it('leaves backslash-escaped underscores intact for later unescape', () => {
    expect(replaceSingleUnderscoreEm('escape as file\\_name\\_here.')).toBe(
      'escape as file\\_name\\_here.'
    )
  })

  it('does not pair underscores inside rendered katex markup', () => {
    const katex = '<span class="katex"><span class="katex-html">x<sub>1</sub></span></span>'
    expect(replaceSingleUnderscoreEm(`before ${katex} after`)).toBe(`before ${katex} after`)
  })
})
