import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../../../styles/hero.css')

describe('hero subtitle CSS', () => {
  const css = readFileSync(stylesPath, 'utf8')

  it('uses a single static subtitle without rotation keyframes', () => {
    expect(css).toMatch(/\.hero-subtitle\s*\{/)
    expect(css).not.toMatch(/@keyframes subtitlePrimarySequential/)
    expect(css).not.toMatch(/@keyframes subtitleAlternateSequential/)
    expect(css).not.toMatch(/\.hero-subtitle--alternate/)
    expect(css).not.toMatch(/\.hero-subtitle-container/)
  })

  it('keeps entrance fade on the hero subtitle', () => {
    expect(css).toMatch(
      /\.hero-subtitle\s*\{[^}]*animation:\s*fadeInUp 0\.8s ease-out 0\.1s both/
    )
  })
})