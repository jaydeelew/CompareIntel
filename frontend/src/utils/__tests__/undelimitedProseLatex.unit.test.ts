import { describe, expect, it } from 'vitest'

import { convertImplicitMath } from '../latex/implicitMath'
import { wrapUndelimitedLatexInProse } from '../latex/undelimitedProseLatex'

describe('wrapUndelimitedLatexInProse', () => {
  it('wraps sqrt in prose without touching link destinations', () => {
    const src = 'See [docs](\\sqrt{2}) and \\sqrt{3} here.'
    expect(wrapUndelimitedLatexInProse(src)).toBe(
      'See [docs](\\sqrt{2}) and \\(\\sqrt{3}\\) here.'
    )
  })

  it('convertImplicitMath keeps Gemma paren regression', () => {
    const src =
      'The square root of 2 (\\sqrt{2}) is an irrational number.'
    expect(convertImplicitMath(src)).toBe(
      'The square root of 2 (\\(\\sqrt{2}\\)) is an irrational number.'
    )
  })
})