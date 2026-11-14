import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const stylesPath = join(dirname(fileURLToPath(import.meta.url)), '../../../styles/results.css')

describe('saved selections composer toolbar layout CSS', () => {
  const css = readFileSync(stylesPath, 'utf8')

  it('groups the bookmark icon and default name in a tight cluster', () => {
    expect(css).toMatch(/\.saved-selections-bookmark-cluster\s*\{[^}]*display:\s*inline-flex/)
    expect(css).toMatch(/\.saved-selections-bookmark-cluster\s*\{[^}]*gap:\s*0\.125rem/)
  })

  it('keeps ellipsis truncation on long default selection names', () => {
    expect(css).toMatch(/\.default-selection-name\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.default-selection-name\s*\{[^}]*min-width:\s*0/)
  })
})
