#!/usr/bin/env node
/**
 * Comprehensive hero height and pricing line gap measurement script
 * Compares current build against baseline e600964f
 * Tests: 11 widths × 4 viewport heights × 2 themes = 88 combinations
 */

import { chromium } from '@playwright/test'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const WIDTHS = [320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920]
const VIEWPORT_HEIGHTS = [600, 700, 800, 1000]
const THEMES = ['light', 'dark']

// Colors for console output
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
  await page.waitForTimeout(200)

  return await page.evaluate(() => {
    const heroSection = document.querySelector('.hero-section')
    if (!heroSection) return null

    const rect = heroSection.getBoundingClientRect()
    return {
      height: rect.height,
      bottom: rect.bottom,
    }
  })
}

async function measurePricingLineGaps(page, width) {
  const gaps = await page.evaluate(() => {
    const pricingLine = document.querySelector('.hero-pricing-line')
    const usageContainer = document.querySelector('.usage-preview-container')
    const heroSection = document.querySelector('.hero-section')

    if (!pricingLine || !usageContainer || !heroSection) {
      return { error: 'Elements not found' }
    }

    // Check if pricing line is visible
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
      difference: Math.round((Math.abs(gapAbove - gapBelow) * 100)) / 100,
    }
  })

  return gaps
}

async function getBaselineHeights() {
  console.log(`${colors.cyan}📏 Fetching baseline heights from e600964f...${colors.reset}`)
  
  // Check if we have baseline cached
  const cacheFile = '/tmp/hero-baseline-e600964f.json'
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(require('fs').readFileSync(cacheFile, 'utf8'))
    console.log(`${colors.green}✓ Using cached baseline${colors.reset}\n`)
    return cached
  }

  // Build baseline version
  execSync('git stash', { stdio: 'ignore', cwd: '/workspace' })
  try {
    execSync('git checkout e600964f', { stdio: 'ignore', cwd: '/workspace' })
    execSync('npm run build', { stdio: 'ignore', cwd: '/workspace/frontend' })

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

    const baseline = {}
    for (const width of WIDTHS) {
      baseline[width] = {}
      for (const height of VIEWPORT_HEIGHTS) {
        baseline[width][height] = {}
        for (const theme of THEMES) {
          const result = await measureHeroHeight(page, width, height, theme)
          baseline[width][height][theme] = result?.height || 0
        }
      }
    }

    await browser.close()
    require('fs').writeFileSync(cacheFile, JSON.stringify(baseline, null, 2))
    return baseline
  } finally {
    execSync('git checkout -', { stdio: 'ignore', cwd: '/workspace' })
    try {
      execSync('git stash pop', { stdio: 'ignore', cwd: '/workspace' })
    } catch {
      // No stash to pop
    }
  }
}

async function main() {
  console.log(`${colors.cyan}🔬 Hero Height & Pricing Line Gap Measurement${colors.reset}`)
  console.log(`${colors.dim}Testing: ${WIDTHS.length} widths × ${VIEWPORT_HEIGHTS.length} heights × ${THEMES.length} themes = ${WIDTHS.length * VIEWPORT_HEIGHTS.length * THEMES.length} combinations${colors.reset}\n`)

  const baseline = await getBaselineHeights()

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

  const results = []
  const pricingGaps = {}
  let maxDiff = 0
  let failures = 0

  console.log(`${colors.cyan}📊 Hero Height Differences (Current vs Baseline e600964f):${colors.reset}\n`)
  console.log('Width  VH   Light     Dark')
  console.log('─────────────────────────────')

  for (const width of WIDTHS) {
    // Measure pricing line gaps at this width (use 1000vh for consistency)
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.waitForTimeout(200)
    const gaps = await measurePricingLineGaps(page, width)
    pricingGaps[width] = gaps

    for (const height of VIEWPORT_HEIGHTS) {
      const lightResult = await measureHeroHeight(page, width, height, 'light')
      const darkResult = await measureHeroHeight(page, width, height, 'dark')

      const lightDiff = lightResult ? lightResult.height - baseline[width][height].light : 0
      const darkDiff = darkResult ? darkResult.height - baseline[width][height].dark : 0

      maxDiff = Math.max(maxDiff, Math.abs(lightDiff), Math.abs(darkDiff))

      if (Math.abs(lightDiff) > 0.5 || Math.abs(darkDiff) > 0.5) {
        failures++
      }

      const lightStatus = Math.abs(lightDiff) <= 0.5 ? colors.green : colors.red
      const darkStatus = Math.abs(darkDiff) <= 0.5 ? colors.green : colors.red

      console.log(
        `${width.toString().padStart(4)}  ${height.toString().padStart(3)}  ` +
        `${lightStatus}${lightDiff >= 0 ? '+' : ''}${lightDiff.toFixed(2).padStart(6)}${colors.reset}  ` +
        `${darkStatus}${darkDiff >= 0 ? '+' : ''}${darkDiff.toFixed(2).padStart(6)}${colors.reset}`
      )

      results.push({
        width,
        height,
        theme: 'light',
        diff: lightDiff,
        pass: Math.abs(lightDiff) <= 0.5,
      })
      results.push({
        width,
        height,
        theme: 'dark',
        diff: darkDiff,
        pass: Math.abs(darkDiff) <= 0.5,
      })
    }
  }

  console.log('\n' + `${colors.cyan}📏 Pricing Line Gap Analysis (Signed Out, Dark Mode):${colors.reset}\n`)
  console.log('Width   Gap Above  Gap Below  Difference  Status')
  console.log('───────────────────────────────────────────────────')

  for (const width of WIDTHS) {
    const gaps = pricingGaps[width]
    if (gaps.error) {
      console.log(`${width.toString().padStart(4)}   ${colors.yellow}${gaps.error}${colors.reset}`)
    } else {
      const balanced = gaps.difference <= 2
      const status = balanced ? `${colors.green}✓ Balanced${colors.reset}` : `${colors.yellow}⚠ Unbalanced${colors.reset}`
      console.log(
        `${width.toString().padStart(4)}   ${gaps.gapAbove.toFixed(2).padStart(9)}  ` +
        `${gaps.gapBelow.toFixed(2).padStart(9)}  ${gaps.difference.toFixed(2).padStart(10)}  ${status}`
      )
    }
  }

  await browser.close()

  const totalTests = results.length
  const passed = results.filter(r => r.pass).length

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`)
  console.log(`${colors.cyan}Summary:${colors.reset}`)
  console.log(`  Tests: ${totalTests}`)
  console.log(`  Passed: ${passed} (${colors.green}${((passed / totalTests) * 100).toFixed(1)}%${colors.reset})`)
  console.log(`  Failed: ${failures} ${failures > 0 ? colors.red : colors.green}(${((failures / totalTests) * 100).toFixed(1)}%)${colors.reset}`)
  console.log(`  Max difference: ${maxDiff > 0.5 ? colors.red : colors.green}${maxDiff.toFixed(2)}px${colors.reset}`)
  console.log(`  Target: ≤0.5px from baseline e600964f`)
  console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`)

  if (failures > 0) {
    console.log(`${colors.red}❌ ${failures} measurements exceeded 0.5px threshold${colors.reset}\n`)
    process.exit(1)
  } else {
    console.log(`${colors.green}✅ All measurements within 0.5px of baseline!${colors.reset}\n`)
  }
}

main().catch(console.error)
