#!/usr/bin/env node
/**
 * Shared public-page list for sitemap, prerender, and the preview server.
 * Reads the same JSON files that frontend/src/config/pageMetadata.ts imports
 * so route lists cannot drift.
 */

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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

export function getPublicPages() {
  const staticPages = readJson(STATIC_PAGES_PATH)
  const catalog = loadSeoCatalog()
  return [...staticPages, catalog.index, ...catalog.models.map(model => model.page)]
}

export function getPublicPaths() {
  return getPublicPages().map(page => page.path)
}

export function getFeaturedModelSlugs() {
  return loadSeoCatalog().models.map(model => model.slug)
}
