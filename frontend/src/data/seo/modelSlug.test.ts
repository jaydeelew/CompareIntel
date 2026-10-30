import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as scriptSlug from '../../../scripts/lib/modelSlug.js'

import {
  buildCompareAppHref,
  buildComparePath,
  buildComparePathFromIds,
  buildModelPath,
  modelIdToSlug,
  stripProviderPrefix,
} from './modelSlug'

describe('modelIdToSlug', () => {
  it('strips the provider prefix and turns . and : into -', () => {
    expect(modelIdToSlug('openai/gpt-5.5')).toBe('gpt-5-5')
    expect(modelIdToSlug('google/gemini-3.1-pro-preview')).toBe('gemini-3-1-pro-preview')
    expect(modelIdToSlug('anthropic/claude-sonnet-4.6')).toBe('claude-sonnet-4-6')
  })

  it('drops a trailing :free suffix before replacing remaining colons', () => {
    expect(modelIdToSlug('nvidia/nemotron-3-ultra-550b-a55b:free')).toBe(
      'nemotron-3-ultra-550b-a55b'
    )
  })

  it('keeps ids that already have no provider prefix', () => {
    expect(stripProviderPrefix('gpt-5.5')).toBe('gpt-5.5')
    expect(modelIdToSlug('gpt-5.5')).toBe('gpt-5-5')
  })
})

describe('compare path helpers', () => {
  it('builds /models and /compare paths', () => {
    expect(buildModelPath('claude-opus-5')).toBe('/models/claude-opus-5')
    expect(buildComparePath('claude-opus-5', 'gpt-5-5')).toBe('/compare/claude-opus-5-vs-gpt-5-5')
    expect(buildComparePathFromIds('anthropic/claude-opus-5', 'openai/gpt-5.5')).toBe(
      '/compare/claude-opus-5-vs-gpt-5-5'
    )
  })

  it('builds a homepage CTA that preselects the model', () => {
    expect(buildCompareAppHref('anthropic/claude-opus-5')).toBe(
      '/?models=anthropic%2Fclaude-opus-5'
    )
  })
})

describe('script slug helper stays in sync with TypeScript', () => {
  it('matches the TS implementation for representative ids', () => {
    const ids = [
      'openai/gpt-5.5',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'google/gemini-3.1-pro-preview',
    ]
    for (const id of ids) {
      expect(scriptSlug.modelIdToSlug(id)).toBe(modelIdToSlug(id))
      expect(scriptSlug.buildComparePathFromIds(id, 'openai/gpt-5.5')).toBe(
        buildComparePathFromIds(id, 'openai/gpt-5.5')
      )
    }
  })

  it('does not hard-code a second public page list in sitemap/prerender scripts', () => {
    const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts')
    const sitemap = readFileSync(join(scriptsDir, 'generate-sitemap.js'), 'utf-8')
    const prerender = readFileSync(join(scriptsDir, 'prerender.js'), 'utf-8')
    const preview = readFileSync(join(scriptsDir, 'preview-server.js'), 'utf-8')
    expect(sitemap).toContain("from './loadPublicPages.js'")
    expect(prerender).toContain("from './loadPublicPages.js'")
    expect(preview).toContain("from './loadPublicPages.js'")
    expect(sitemap).not.toMatch(/const PUBLIC_PAGES = \[/)
    expect(prerender).not.toMatch(/path: '\/about'/)
  })
})
