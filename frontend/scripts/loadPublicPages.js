#!/usr/bin/env node
/**
 * Shared public-page list for sitemap, prerender, and the preview server.
 * Reads the same JSON files that frontend/src/config/pageMetadata.ts imports
 * so route lists cannot drift.
 */

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { isVerdictPanelEnabledInBuild } from './verdictPanelFlag.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const STATIC_PAGES_PATH = join(FRONTEND_ROOT, 'src/config/staticPublicPages.json')
const SEO_CATALOG_PATH = join(FRONTEND_ROOT, 'src/data/generated/seoCatalog.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function loadSeoCatalog() {
  if (!existsSync(SEO_CATALOG_PATH)) {
    throw new Error(
      `Missing ${SEO_CATALOG_PATH}. Run: node scripts/generate-seo-catalog.js`
    )
  }
  return readJson(SEO_CATALOG_PATH)
}

function canonicalStaticPages(staticPages) {
  return staticPages.map(({ aliases: _aliases, ...page }) => page)
}

const VERDICT_METHODOLOGY_PATH = '/verdict-methodology'

/**
 * Canonical public URLs only. Aliases such as /privacy are not separate
 * sitemap or prerender entries; they redirect to the canonical path.
 */
export function getPublicPages() {
  const staticPages = canonicalStaticPages(readJson(STATIC_PAGES_PATH))
  const catalog = loadSeoCatalog()
  const pages = [...staticPages, catalog.index, ...catalog.models.map(model => model.page)]
  if (isVerdictPanelEnabledInBuild()) return pages
  return pages.filter(page => page.path !== VERDICT_METHODOLOGY_PATH)
}

/** alias path → canonical path. Not included in the sitemap. */
export function getPathAliases() {
  const aliases = new Map()
  for (const page of readJson(STATIC_PAGES_PATH)) {
    if (!Array.isArray(page.aliases)) continue
    for (const alias of page.aliases) {
      aliases.set(alias, page.path)
    }
  }
  return aliases
}

export function getPublicPaths() {
  return getPublicPages().map(page => page.path)
}

export function getFeaturedModelSlugs() {
  return loadSeoCatalog().models.map(model => model.slug)
}
