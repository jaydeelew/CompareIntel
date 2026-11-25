import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const layoutDir = dirname(fileURLToPath(import.meta.url))
const stylesPath = join(layoutDir, '../../../styles/hero.css')
const heroPath = join(layoutDir, '../Hero.tsx')

/** Top-level @media bodies, including nested rules. */
function mediaBlocks(css: string, query: string): string[] {
  const needle = `@media ${query}`
  const blocks: string[] = []
  let from = 0
  while (from < css.length) {
    const start = css.indexOf(needle, from)
    if (start === -1) break
    const open = css.indexOf('{', start)
    let depth = 0
    let end = open
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++
      else if (css[end] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    blocks.push(css.slice(open, end + 1))
    from = end + 1
  }
  return blocks
}

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
    expect(css).toMatch(/\.hero-subtitle\s*\{[^}]*animation:\s*fadeInUp 0\.8s ease-out 0\.1s both/)
  })

  it('breaks before "artificial intelligence" only at the phone breakpoint', () => {
    const hero = readFileSync(heroPath, 'utf8')
    expect(hero).toContain(
      '<span className="hero-subtitle-first-line">Where human intelligence judges</span>'
    )
    expect(hero).toContain(
      '<span className="hero-subtitle-second-line">artificial intelligence</span>'
    )

    const phone = mediaBlocks(css, '(max-width: 480px)').join('\n')
    expect(phone).toMatch(/\.hero-subtitle-first-line\s*\{[^}]*white-space:\s*nowrap/)
    expect(phone).toMatch(/\.hero-subtitle-second-line\s*\{[^}]*display:\s*block\s*!important/)

    const upToTablet = mediaBlocks(css, '(max-width: 768px)').join('\n')
    expect(upToTablet).not.toMatch(/\.hero-subtitle-(first|second)-line\s*\{[^}]*display:\s*block/)

    expect(css).toMatch(
      /\.hero-subtitle-first-line,\s*\.hero-subtitle-second-line\s*\{\s*display:\s*inline;/
    )
  })
})
