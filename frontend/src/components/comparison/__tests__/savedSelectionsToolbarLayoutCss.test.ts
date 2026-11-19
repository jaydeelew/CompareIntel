import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../styles')
const resultsCss = readFileSync(join(stylesDir, 'results.css'), 'utf8')
const heroCss = readFileSync(join(stylesDir, 'hero.css'), 'utf8')

describe('saved selections composer toolbar layout CSS', () => {
  it('groups the bookmark icon and default name in a tight cluster', () => {
    expect(resultsCss).toMatch(
      /\.saved-selections-bookmark-cluster\s*\{[^}]*display:\s*inline-flex/
    )
    expect(resultsCss).toMatch(/\.saved-selections-bookmark-cluster\s*\{[^}]*gap:\s*0\.125rem/)
    expect(resultsCss).toMatch(
      /\.saved-selections-bookmark-cluster\s*\{[^}]*justify-content:\s*flex-start/
    )
  })

  it('pins composer action buttons to the right with margin-left auto', () => {
    expect(heroCss).toMatch(/\.composer-toolbar \.textarea-actions\s*\{[^}]*margin-left:\s*auto/)
  })

  it('keeps ellipsis truncation on long default selection names', () => {
    expect(resultsCss).toMatch(/\.default-selection-name\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(resultsCss).toMatch(/\.default-selection-name\s*\{[^}]*min-width:\s*0/)
    expect(resultsCss).toMatch(
      /\.saved-selections-bookmark-cluster > \.tooltip\.default-selection-name-tooltip\s*\{[^}]*justify-content:\s*flex-start/
    )
    expect(resultsCss).toMatch(
      /\.saved-selections-bookmark-cluster > \.tooltip\.default-selection-name-tooltip\s*\{[^}]*min-width:\s*0/
    )
  })
})
