import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { getPathAliases, getPublicPages } from '../../scripts/loadPublicPages.js'

const sitemapPath = join(dirname(fileURLToPath(import.meta.url)), '../../public/sitemap.xml')

describe('sitemap canonical URLs', () => {
  it('does not list alias URLs such as /privacy', () => {
    const xml = readFileSync(sitemapPath, 'utf-8')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    expect(locs).toContain('https://compareintel.com/privacy-policy')
    expect(locs).not.toContain('https://compareintel.com/privacy')
    for (const alias of getPathAliases().keys()) {
      expect(locs).not.toContain(`https://compareintel.com${alias}`)
    }
  })

  it('builds the public page list from canonical paths only', () => {
    const aliases = getPathAliases()
    expect(aliases.get('/privacy')).toBe('/privacy-policy')
    const paths = getPublicPages().map(page => page.path)
    expect(paths).toContain('/privacy-policy')
    expect(paths).not.toContain('/privacy')
    for (const alias of aliases.keys()) {
      expect(paths).not.toContain(alias)
    }
  })
})
