#!/usr/bin/env node
/**
 * Dynamic Sitemap Generator
 *
 * Generates sitemap.xml from the shared public-page list (static pages +
 * generated model pages). Same source as prerender and pageMetadata.ts.
 *
 * Usage: node scripts/generate-sitemap.js
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { getPublicPages } from './loadPublicPages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  const baseUrl = 'https://compareintel.com'
  const publicPages = getPublicPages()

  console.log('🗺️  Generating sitemap.xml...')
  console.log(`   Date: ${today}`)

  const urls = publicPages
    .map(page => {
      const loc = page.path === '/' ? baseUrl + '/' : baseUrl + page.path
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`
    })
    .join('\n  \n')

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  
  <!-- Generated automatically at build time from scripts/generate-sitemap.js -->
  <!-- Last updated: ${today} -->
  
${urls}
  
</urlset>
`

  const outputPath = join(__dirname, '..', 'public', 'sitemap.xml')
  writeFileSync(outputPath, sitemap, 'utf-8')

  console.log(`✅ Sitemap generated with ${publicPages.length} URLs`)
  console.log(`   Output: ${outputPath}`)
}

try {
  generateSitemap()
} catch (error) {
  console.error('❌ Error generating sitemap:', error.message)
  process.exit(1)
}
