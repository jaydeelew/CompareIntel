#!/usr/bin/env node
/**
 * Dynamic Sitemap Generator
 * 
 * Generates sitemap.xml from the same page metadata used for prerendering.
 * Ensures consistency between prerendered pages and sitemap.
 * 
 * Usage: node scripts/generate-sitemap.js
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Page metadata - must match frontend/src/config/pageMetadata.ts
const PUBLIC_PAGES = [
  {
    path: '/',
    priority: 1.0,
    changefreq: 'weekly',
  },
  {
    path: '/about',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/features',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/how-it-works',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/faq',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    path: '/image-generation',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/help-me-choose-methodology',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    path: '/privacy-policy',
    priority: 0.5,
    changefreq: 'yearly',
  },
  {
    path: '/terms-of-service',
    priority: 0.5,
    changefreq: 'yearly',
  },
]

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  const baseUrl = 'https://compareintel.com'

  console.log('🗺️  Generating sitemap.xml...')
  console.log(`   Date: ${today}`)

  const urls = PUBLIC_PAGES.map(page => {
    const loc = page.path === '/' ? baseUrl + '/' : baseUrl + page.path
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`
  }).join('\n  \n')

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

  console.log(`✅ Sitemap generated with ${PUBLIC_PAGES.length} URLs`)
  console.log(`   Output: ${outputPath}`)
}

try {
  generateSitemap()
} catch (error) {
  console.error('❌ Error generating sitemap:', error.message)
  process.exit(1)
}
