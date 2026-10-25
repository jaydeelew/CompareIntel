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

const __dirname = dirname(fileURLToPath(import.meta.url))

// Page metadata - must match frontend/src/config/pageMetadata.ts
const PUBLIC_PAGES = [
  {
    path: '/',
    title: 'CompareIntel - Compare AI & Image Models Side-by-Side | Free',
    description:
      'Compare AI language and image models side-by-side. Test GPT-5, Claude, Gemini, FLUX, DALL-E from OpenAI, Anthropic, Google, Meta, xAI. Image generation comparison included. Free tier.',
    h1: 'Compare AI Language and Image Models Side by Side',
  },
  {
    path: '/about',
    title: 'About - CompareIntel',
    description:
      'Learn about CompareIntel, the AI model comparison platform that helps you test and compare language and image models from OpenAI, Anthropic, Google, Meta, and more.',
    h1: 'About CompareIntel',
  },
  {
    path: '/features',
    title: 'Features - CompareIntel',
    description:
      'Discover CompareIntel features: side-by-side AI comparison, latest models from OpenAI, Anthropic, Google, Meta, xAI, LaTeX rendering, syntax highlighting, and more.',
    h1: 'CompareIntel Features',
  },
  {
    path: '/how-it-works',
    title: 'How It Works - CompareIntel',
    description:
      'Learn how CompareIntel works: compare AI models side-by-side, test prompts across multiple models, view streaming responses, and find the best AI for your needs.',
    h1: 'How It Works',
  },
  {
    path: '/faq',
    title: 'FAQ - CompareIntel',
    description:
      'Frequently asked questions about CompareIntel: supported AI models, pricing, credits, image generation, data privacy, and how to get started.',
    h1: 'Frequently Asked Questions',
  },
  {
    path: '/image-generation',
    title: 'Image Generation - CompareIntel',
    description:
      'Compare AI image generation models side-by-side: FLUX, Imagen, GPT-5 Image, DALL-E, Riverflow. Test prompts and find the best image AI for your creative projects.',
    h1: 'AI Image Generation Comparison',
  },
  {
    path: '/help-me-choose-methodology',
    title: 'Help Me Choose Methodology - CompareIntel',
    description:
      'Learn about the CompareIntel methodology for choosing the right AI model: evaluation criteria, comparison framework, and best practices for testing AI models.',
    h1: 'Help Me Choose Methodology',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy - CompareIntel',
    description:
      'CompareIntel Privacy Policy: how we collect, use, and protect your data. Learn about our commitment to user privacy and data security.',
    h1: 'Privacy Policy',
  },
  {
    path: '/terms-of-service',
    title: 'Terms of Service - CompareIntel',
    description:
      'CompareIntel Terms of Service: user agreement, acceptable use policy, intellectual property rights, and terms governing use of our AI comparison platform.',
    h1: 'Terms of Service',
  },
]

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

// Create 404.html for proper 404 handling
function create404Page() {
  const distPath = process.argv[2] || join(__dirname, '..', 'dist')
  const indexPath = join(distPath, 'index.html')
  const notFoundPath = join(distPath, '404.html')

  if (!existsSync(indexPath)) {
    console.error(`❌ Error: index.html not found at ${indexPath}`)
    return
  }

  // Read index.html and use it as template for 404
  let html = readFileSync(indexPath, 'utf-8')

  // Update metadata for 404 page
  html = html.replace(
    /<title>[^<]*<\/title>/,
    '<title>404 - Page Not Found - CompareIntel</title>'
  )
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    '<meta name="description" content="Page not found. The URL you requested does not exist on CompareIntel."'
  )
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    '<meta property="og:title" content="404 - Page Not Found - CompareIntel"'
  )
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    '<meta name="twitter:title" content="404 - Page Not Found - CompareIntel"'
  )

  // Add noindex to prevent indexing 404 page
  html = html.replace(
    /<meta name="robots" content="[^"]*"/,
    '<meta name="robots" content="noindex, nofollow"'
  )

  writeFileSync(notFoundPath, html, 'utf-8')
  console.log('\n📄 Created 404.html')
}

// Run prerendering
prerenderPages()
  .then(() => {
    create404Page()
  })
  .catch(error => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
