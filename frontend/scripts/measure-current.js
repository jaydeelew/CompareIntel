#!/usr/bin/env node
/**
 * Measure hero heights and pricing line gaps for current build
 */

import { chromium } from '@playwright/test'

const WIDTHS = [320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920]
const VIEWPORT_HEIGHTS = [600, 700, 800, 1000]
const THEMES = ['light', 'dark']

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

async function measureHeroHeight(page, width, height, theme) {
  await page.setViewportSize({ width, height })
  await page.evaluate(theme => {
    document.documentElement.setAttribute('data-theme', theme)
  }, theme)
  await page.waitForTimeout(300)

  return await page.evaluate(() => {
    const heroSection = document.querySelector('.hero-section')
    if (!heroSection) return null

    const rect = heroSection.getBoundingClientRect()
    return Math.round(rect.height * 100) / 100
  })
}

async function measurePricingLineGaps(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(300)

  const gaps = await page.evaluate(() => {
    const pricingLine = document.querySelector('.hero-pricing-line')
    const usageContainer = document.querySelector('.usage-preview-container')
    const heroSection = document.querySelector('.hero-section')

    if (!pricingLine || !usageContainer || !heroSection) {
      return { error: 'Elements not found' }
    }

    const pricingStyle = window.getComputedStyle(pricingLine)
    if (pricingStyle.display === 'none' || pricingStyle.visibility === 'hidden') {
      return { error: 'Pricing line hidden' }
    }

    const pricingRect = pricingLine.getBoundingClientRect()
    const usageRect = usageContainer.getBoundingClientRect()
    const heroRect = heroSection.getBoundingClientRect()

    const gapAbove = pricingRect.top - usageRect.bottom
    const gapBelow = heroRect.bottom - pricingRect.bottom

    return {
      gapAbove: Math.round(gapAbove * 100) / 100,
      gapBelow: Math.round(gapBelow * 100) / 100,
      difference: Math.round(Math.abs(gapAbove - gapBelow) * 100) / 100,
      pricingTop: Math.round(pricingRect.top * 100) / 100,
      pricingBottom: Math.round(pricingRect.bottom * 100) / 100,
      usageBottom: Math.round(usageRect.bottom * 100) / 100,
      heroBottom: Math.round(heroRect.bottom * 100) / 100,
    }
  })

  return gaps
}

async function checkSubtitlesInDOM(page) {
  return await page.evaluate(() => {
    const subtitles = document.querySelectorAll('.hero-subtitle')
    const texts = Array.from(subtitles).map(el => el.textContent.trim())
    return {
      count: subtitles.length,
      texts,
      hasFirst: texts.some(t => t.includes('Built for humans')),
      hasSecond: texts.some(t => t.includes('Choose the right AI model')),
    }
  })
}

async function main() {
  console.log(`${colors.cyan}🔬 Hero Height & Pricing Line Gap Measurement${colors.reset}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' })

  // Mock signed-out state
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  })
  await page.reload({ waitUntil: 'networkidle' })

  // Check subtitles
  const subtitles = await checkSubtitlesInDOM(page)
  console.log(`${colors.cyan}📝 Subtitle Check:${colors.reset}`)
  console.log(`  Count: ${subtitles.count}`)
  console.log(`  Has "Built for humans": ${subtitles.hasFirst ? colors.green + '✓' + colors.reset : colors.red + '✗' + colors.reset}`)
  console.log(`  Has "Choose the right AI model": ${subtitles.hasSecond ? colors.green + '✓' + colors.reset : colors.red + '✗' + colors.reset}`)
  console.log(`  Texts: ${subtitles.texts.map(t => '"' + t + '"').join(', ')}\n`)

  console.log(`${colors.cyan}📊 Hero Heights (px):${colors.reset}\n`)
  console.log('Width  VH    Light      Dark')
  console.log('───────────────────────────────')

  const heightResults = {}
  for (const width of WIDTHS) {
    heightResults[width] = {}
    for (const height of VIEWPORT_HEIGHTS) {
      const light = await measureHeroHeight(page, width, height, 'light')
      const dark = await measureHeroHeight(page, width, height, 'dark')
      heightResults[width][height] = { light, dark }

      console.log(
        `${width.toString().padStart(4)}  ${height.toString().padStart(3)}  ` +
        `${light.toFixed(2).padStart(9)}  ${dark.toFixed(2).padStart(9)}`
      )
    }
  }

  console.log(`\n${colors.cyan}📏 Pricing Line Gap Analysis:${colors.reset}\n`)
  console.log('Width   VH    Gap Above  Gap Below  Diff   Status')
  console.log('─────────────────────────────────────────────────────')

  const gapResults = {}
  for (const width of WIDTHS) {
    gapResults[width] = {}
    for (const height of VIEWPORT_HEIGHTS) {
      await page.setViewportSize({ width, height })
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark')
      })
      const gaps = await measurePricingLineGaps(page, width, height)
      gapResults[width][height] = gaps

      if (gaps.error) {
        console.log(`${width.toString().padStart(4)}  ${height.toString().padStart(4)}   ${colors.yellow}${gaps.error}${colors.reset}`)
      } else {
        const balanced = gaps.difference <= 2
        const status = balanced ? `${colors.green}✓${colors.reset}` : `${colors.yellow}⚠${colors.reset}`
        console.log(
          `${width.toString().padStart(4)}  ${height.toString().padStart(4)}  ` +
          `${gaps.gapAbove.toFixed(2).padStart(9)}  ${gaps.gapBelow.toFixed(2).padStart(9)}  ` +
          `${gaps.difference.toFixed(2).padStart(5)}  ${status}`
        )
      }
    }
  }

  await browser.close()

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`)

  // Save results to file
  const fs = await import('fs')
  fs.writeFileSync(
    '/tmp/hero-measurements.json',
    JSON.stringify({ heights: heightResults, gaps: gapResults, subtitles }, null, 2)
  )
  console.log(`${colors.green}✓ Results saved to /tmp/hero-measurements.json${colors.reset}\n`)
}

main().catch(console.error)
