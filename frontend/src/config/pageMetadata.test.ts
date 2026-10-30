import { describe, expect, it } from 'vitest'

import seoCatalog from '../data/generated/seoCatalog.json'
import featuredModels from '../data/seo/featuredModels.json'

import { PUBLIC_PAGES, getPageMetadata, getPageTitle } from './pageMetadata'
import staticPublicPages from './staticPublicPages.json'

describe('PUBLIC_PAGES shared route list', () => {
  it('includes static pages, the models index, and every featured model', () => {
    const paths = PUBLIC_PAGES.map(page => page.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/models')
    expect(paths).toContain('/models/claude-opus-5')
    expect(paths).toContain('/models/gpt-5-5')
    expect(paths).toEqual([
      ...staticPublicPages.map(page => page.path),
      seoCatalog.index.path,
      ...seoCatalog.models.map(model => model.path),
    ])
  })

  it('has unique titles, descriptions, and canonical paths', () => {
    const titles = PUBLIC_PAGES.map(page => page.title)
    const descriptions = PUBLIC_PAGES.map(page => page.description)
    const paths = PUBLIC_PAGES.map(page => page.path)
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('skips models that are being removed', () => {
    const ids = seoCatalog.models.map(model => model.id)
    expect(ids).not.toContain('qwen/qwen3-next-80b-a3b-thinking')
    expect(ids).not.toContain('x-ai/grok-5')
    for (const skipId of featuredModels.skipIds) {
      expect(ids).not.toContain(skipId)
    }
  })

  it('keeps compare-pair data ready for later /compare/<a>-vs-<b> pages', () => {
    expect(seoCatalog.comparePairs.length).toBeGreaterThan(0)
    expect(seoCatalog.comparePairs[0].path).toMatch(/^\/compare\/.+-vs-.+$/)
    expect(PUBLIC_PAGES.some(page => page.path.startsWith('/compare/'))).toBe(false)
  })
})

describe('getPageMetadata', () => {
  it('returns model page metadata including title and canonical path', () => {
    const meta = getPageMetadata('/models/claude-opus-5')
    expect(meta?.title).toBe('Claude Opus 5 by Anthropic - CompareIntel')
    expect(meta?.h1).toBe('Claude Opus 5 by Anthropic')
    expect(meta?.path).toBe('/models/claude-opus-5')
  })

  it('ignores a trailing slash', () => {
    expect(getPageMetadata('/models/')?.path).toBe('/models')
  })

  it('returns undefined for unknown model slugs', () => {
    expect(getPageMetadata('/models/not-a-real-model')).toBeUndefined()
    expect(getPageTitle('/models/not-a-real-model')).toBe('CompareIntel')
  })
})
