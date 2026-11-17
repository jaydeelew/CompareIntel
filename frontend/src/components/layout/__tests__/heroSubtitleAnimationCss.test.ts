import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../../../styles/hero.css')

describe('hero subtitle rotation CSS', () => {
  const css = readFileSync(stylesPath, 'utf8')

  it('uses sequential keyframes and a slower cycle than the old 16s crossfade', () => {
    expect(css).toMatch(/@keyframes subtitlePrimarySequential/)
    expect(css).toMatch(/@keyframes subtitleAlternateSequential/)
    expect(css).not.toMatch(/@keyframes subtitleFadeInOut/)
    expect(css).toMatch(/subtitlePrimarySequential 24s/)
    expect(css).toMatch(/subtitleAlternateSequential 24s/)
    expect(css).not.toMatch(/subtitleAlternateSequential 24s[^\n]*8s/)
  })

  it('keeps a gap where both subtitles are fully transparent (no overlap)', () => {
    expect(css).toMatch(/41\.67%/)
    expect(css).toMatch(/47\.92%/)
    expect(css).toMatch(/89\.58%/)
  })

  it('stacks subtitles in one grid cell so height is reserved while fading', () => {
    expect(css).toMatch(/\.hero-subtitle-container\s*\{[^}]*display:\s*grid/)
    expect(css).toMatch(/\.hero-subtitle-container > \*\s*\{[^}]*grid-row:\s*1/)
  })

  it('disables rotation under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hero-subtitle--alternate\s*\{[^}]*display:\s*none/
    )
  })
})
