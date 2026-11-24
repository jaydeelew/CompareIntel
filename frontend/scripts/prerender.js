#!/usr/bin/env node
/**
 * Static Prerendering Script
 * 
 * Generates static HTML files for all public pages using Playwright.
 * Each page gets its own HTML file with unique metadata, visible content,
 * and proper SEO tags.
 * 
 * Usage: node scripts/prerender.js <dist-path> [dev-server-url]
 * 
 * Example:
 *   node scripts/prerender.js ./dist http://localhost:4173
 */

import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { getPublicPages } from './loadPublicPages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PUBLIC_PAGES = getPublicPages()
const NOT_FOUND_PRERENDER_PATH = '/__prerender-not-found'
const SPA_DOCUMENT_ROUTES = [
  { path: '/admin', title: 'Admin Panel - CompareIntel' },
  { path: '/reset-password', title: 'Reset Password - CompareIntel' },
  { path: '/terms', title: 'Terms of Service - CompareIntel' },
]

function stripHomepageCanonical(html, title) {
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  out = out.replace(
    /<meta name="robots" content="[^"]*"/,
    '<meta name="robots" content="noindex, nofollow"'
  )
  out = out.replace(/\n?\s*<link rel="canonical"[^>]*>\s*/g, '\n')
  out = out.replace(/\n?\s*<meta property="og:url"[^>]*>\s*/g, '\n')
  out = out.replace(/\n?\s*<meta name="twitter:url"[^>]*>\s*/g, '\n')
  return out
}

function writeSpaDocumentShells(distPath, shellHtml) {
  for (const route of SPA_DOCUMENT_ROUTES) {
    const html = stripHomepageCanonical(shellHtml, route.title)
    if (/rel="canonical"/i.test(html)) {
      throw new Error(`SPA shell for ${route.path} still has a canonical link`)
    }
    if (!html.includes('noindex')) {
      throw new Error(`SPA shell for ${route.path} is missing noindex`)
    }
    const pagePath = join(distPath, route.path.slice(1))
    mkdirSync(pagePath, { recursive: true })
    writeFileSync(join(pagePath, 'index.html'), html, 'utf-8')
    console.log(`   ✅ SPA shell: ${route.path}/index.html`)
  }
}

async function prerenderPages() {
  const distPath = process.argv[2] || join(__dirname, '..', 'dist')
  const serverUrl = process.argv[3] || 'http://localhost:4173'

  console.log('🚀 Starting prerender process...')
  console.log(`   Dist path: ${distPath}`)
  console.log(`   Server URL: ${serverUrl}`)

  if (!existsSync(distPath)) {
    console.error(`❌ Error: dist directory not found at ${distPath}`)
    console.error('   Please build the project first with: npm run build')
    process.exit(1)
  }

  // Read the template index.html
  const indexPath = join(distPath, 'index.html')
  if (!existsSync(indexPath)) {
    console.error(`❌ Error: index.html not found at ${indexPath}`)
    process.exit(1)
  }

  const shellHtml = readFileSync(indexPath, 'utf-8')
  writeSpaDocumentShells(distPath, shellHtml)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  let successCount = 0
  let errorCount = 0

  for (const pageConfig of PUBLIC_PAGES) {
    try {
      const url = `${serverUrl}${pageConfig.path}`
      console.log(`\n📄 Prerendering: ${pageConfig.path}`)
      console.log(`   URL: ${url}`)

      // Navigate and wait for the page to be fully loaded
      await page.goto(url, { waitUntil: 'networkidle' })

      // Wait for React to hydrate and content to be visible
      await page.waitForTimeout(1000)

      // Portals (welcome modal, toasts, etc.) render as direct children of <body>, outside
      // #root. createRoot() only replaces #root, so any portal markup saved here would stay
      // in the page forever as an inert, listener-less copy. Keep only #root and assets.
      const strippedPortals = await page.evaluate(() => {
        const keepTags = new Set(['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK', 'TEMPLATE'])
        const removed = []
        for (const el of Array.from(document.body.children)) {
          if (el.id === 'root' || keepTags.has(el.tagName)) continue
          removed.push(el.className || el.tagName)
          el.remove()
        }
        return removed
      })
      if (strippedPortals.length > 0) {
        console.log(`   Stripped body-level portal nodes: ${strippedPortals.join(', ')}`)
      }

      // Get the full HTML after React has rendered
      const html = await page.content()

      // Verify the page has the expected content
      const title = await page.title()
      const h1 = await page.locator('h1').first().textContent()

      console.log(`   Title: ${title}`)
      console.log(`   H1: ${h1}`)

      // Verify metadata was applied correctly
      if (!title.includes(pageConfig.title.split(' - ')[0])) {
        console.warn(`   ⚠️  Warning: Title mismatch (expected to include "${pageConfig.title.split(' - ')[0]}")`)
      }

      // Save the prerendered HTML
      if (pageConfig.path === '/') {
        // Homepage: overwrite index.html
        writeFileSync(indexPath, html, 'utf-8')
        console.log(`   ✅ Saved to: index.html`)
      } else {
        // Other pages: create subdirectory and index.html
        const pagePath = join(distPath, pageConfig.path.slice(1))
        mkdirSync(pagePath, { recursive: true })
        const pageIndexPath = join(pagePath, 'index.html')
        writeFileSync(pageIndexPath, html, 'utf-8')
        console.log(`   ✅ Saved to: ${pageConfig.path.slice(1)}/index.html`)
      }

      successCount++
    } catch (error) {
      console.error(`   ❌ Error prerendering ${pageConfig.path}:`, error.message)
      errorCount++
    }
  }

  await prerenderNotFound(page, serverUrl, distPath)

  await browser.close()

  console.log('\n' + '='.repeat(60))
  console.log(`✨ Prerender complete!`)
  console.log(`   Success: ${successCount}/${PUBLIC_PAGES.length}`)
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`)
  }
  console.log('='.repeat(60))

  if (errorCount > 0) {
    process.exit(1)
  }
}

async function prerenderNotFound(page, serverUrl, distPath) {
  const url = `${serverUrl}${NOT_FOUND_PRERENDER_PATH}`
  console.log('\n📄 Prerendering not-found page')
  console.log(`   URL: ${url}`)

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => {
      const h1 = document.querySelector('h1')
      const robots = document.querySelector('meta[name="robots"]')
      const canonical = document.querySelector('link[rel="canonical"]')
      return (
        !!h1 &&
        (h1.textContent || '').includes('404 - Page Not Found') &&
        !!robots &&
        (robots.getAttribute('content') || '').includes('noindex') &&
        !canonical
      )
    },
    null,
    { timeout: 15000 }
  )

  await page.evaluate(() => {
    document.querySelectorAll('script[type="application/ld+json"]').forEach(node => node.remove())
    document.querySelectorAll('link[rel="canonical"]').forEach(node => node.remove())
    const ogUrl = document.querySelector('meta[property="og:url"]')
    const ogContent = (ogUrl && ogUrl.getAttribute('content')) || ''
    if (ogUrl && ogContent.replace(/\/$/, '') === 'https://compareintel.com') {
      ogUrl.remove()
    }
    const keepTags = new Set(['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK', 'TEMPLATE'])
    for (const el of Array.from(document.body.children)) {
      if (el.id === 'root' || keepTags.has(el.tagName)) continue
      el.remove()
    }
  })

  const html = await page.content()
  if (/rel="canonical"/i.test(html)) {
    throw new Error('404.html still contains a canonical link')
  }
  if (/property="og:url" content="https:\/\/compareintel\.com\/?"/.test(html)) {
    throw new Error('404.html still canonicalizes Open Graph to the homepage')
  }
  if (!html.includes('noindex')) {
    throw new Error('404.html is missing noindex')
  }
  if (!html.includes('404 - Page Not Found')) {
    throw new Error('404.html is missing the not-found heading')
  }

  writeFileSync(join(distPath, '404.html'), html, 'utf-8')
  console.log('   ✅ Saved to: 404.html')
}

// Run prerendering
prerenderPages().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
