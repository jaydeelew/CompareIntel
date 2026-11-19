import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { cleanMalformedContent } from '../latex/cleanup'
import { fixLatexIssues } from '../latex/fixSyntax'
import { extractDisplayMath } from '../latex/mathRenderer'
import {
  extractInlineCode,
  literalizeUnpairedDoubleDollars,
  protectCurrencyDollars,
  protectEscapedDollars,
  protectParenthesizedDelimiterExamples,
} from '../latex/protection'

const FIXTURE = path.resolve(
  __dirname,
  '../../../../rendering-harness/fixtures/google_gemini-4-hydrogen_08-casual-prose.json'
)

function protectedProse(): string {
  const text = JSON.parse(readFileSync(FIXTURE, 'utf8')).response as string
  let p = extractInlineCode(text).text
  p = protectEscapedDollars(p)
  p = protectParenthesizedDelimiterExamples(p)
  p = literalizeUnpairedDoubleDollars(p)
  p = extractDisplayMath(p, []).text
  p = protectCurrencyDollars(p)
  return p
}

describe('cleanMalformedContent SVG heuristic', () => {
  it('does not strip casual prose with many numbers and commas (08-casual-prose)', () => {
    const p = protectedProse()
    const cleaned = cleanMalformedContent(p, { removeMathML: true, removeSVG: true })
    expect(cleaned).toBe(p)
    expect(fixLatexIssues(cleaned)).toBe(cleaned)
  })

  it('still removes dense coordinate blobs without sentence-like prose', () => {
    const svgLike =
      '12.3,45.6,78.9,10.1,22.3,44.5,66.7,88.9,11.2,33.4,55.6,77.8,90.1,12.3,45.6,78.9,aa,bb,cc,dd,ee,ff'
    const cleaned = cleanMalformedContent(svgLike, { removeMathML: true, removeSVG: true })
    expect(cleaned).toBe('')
  })
})