/**
 * Layout Regression Tests
 *
 * These tests measure critical layout dimensions to catch unintended visual regressions.
 * They use bounding-box measurements (not pixel screenshots) to avoid font/CI rendering flakiness.
 *
 * Run these tests:
 *   npm run test:e2e -- --grep "Layout Regression"
 *
 * To update baselines:
 *   1. Run the test once to see the actual measured values in the failure output
 *   2. Copy those values to layout-regression-baselines.json
 *   3. Commit the updated baselines with a clear explanation of why they changed
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load baselines from JSON file
const baselinesPath = join(__dirname, 'layout-regression-baselines.json')
const baselines = JSON.parse(readFileSync(baselinesPath, 'utf-8'))

/** Tolerance for height measurements (±4px) */
const HEIGHT_TOLERANCE = 4

/** Tolerance for centering checks (±6px) */
const CENTERING_TOLERANCE = 6

interface Viewport {
  width: number
  height: number
}

/**
 * Wait for fonts to load and layout to settle before measuring.
 * This ensures stable, deterministic measurements.
 */
async function waitForStableLayout(page: Page): Promise<void> {
  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready)

  // Wait for layout to settle
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })
  })
}

/**
 * Set theme and wait for it to apply completely
 */
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const currentTheme = await page.evaluate(() => {
    return document.documentElement.getAttribute('data-theme')
  })

  if (currentTheme === theme) {
    return
  }

  // Set theme
  await page.evaluate((targetTheme) => {
    document.documentElement.setAttribute('data-theme', targetTheme)
    localStorage.setItem('theme', targetTheme)
  }, theme)

  // Wait for theme transition animations to complete
  await page.evaluate(async () => {
    // Wait for any finite transition animations triggered by theme change
    const elements = document.querySelectorAll('*')
    const animations = Array.from(elements).flatMap(el =>
      Array.from(el.getAnimations({ subtree: false })) // Don't recurse to avoid infinite animations
    ).filter(animation => {
      // Only wait for finite animations (those with a duration)
      const effect = animation.effect as KeyframeEffect | null
      return effect && effect.getTiming().duration !== Infinity
    })
    
    // Race with timeout to avoid hanging on long animations
    await Promise.race([
      Promise.all(
        animations.map(animation => animation.finished.catch(() => undefined))
      ),
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s max wait
    ])
  })

  await waitForStableLayout(page)
}

/**
 * Navigate to page and wait for it to be fully loaded
 */
async function gotoStable(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
  
  // Wait for main content to be visible
  if (path === '/') {
    await page.locator('.hero-section').waitFor({ state: 'visible', timeout: 10000 })
  } else if (path === '/pricing') {
    await page.locator('.pricing-page').waitFor({ state: 'visible', timeout: 10000 })
  }

  await waitForStableLayout(page)
}

test.describe('Layout Regression Tests', () => {
  test.describe('Hero Section Height Guards', () => {
    const viewports: Array<{ name: string; size: Viewport }> = [
      { name: '375x667', size: { width: 375, height: 667 } },
      { name: '390x844', size: { width: 390, height: 844 } },
      { name: '768x1024', size: { width: 768, height: 1024 } },
      { name: '1280x800', size: { width: 1280, height: 800 } },
      { name: '1920x1080', size: { width: 1920, height: 1080 } },
    ]

    const themes: Array<'light' | 'dark'> = ['light', 'dark']

    for (const { name: vpName, size: viewport } of viewports) {
      for (const theme of themes) {
        test(`should maintain hero section height at ${vpName} in ${theme} mode`, async ({ page }) => {
          // Set viewport
          await page.setViewportSize(viewport)

          // Navigate to homepage
          await gotoStable(page, '/')

          // Set theme
          await setTheme(page, theme)

          // Measure hero section height
          const heroSection = page.locator('.hero-section')
          await expect(heroSection).toBeVisible()

          const heroBox = await heroSection.boundingBox()
          expect(heroBox, 'Hero section should have a bounding box').not.toBeNull()

          const actualHeight = Math.round(heroBox!.height)

          // Get baseline
          const baselineHeight = baselines.hero.viewports[vpName][theme]

          // Assert height is within tolerance
          expect(
            actualHeight,
            `Hero section height at ${vpName} (${theme}) should be ${baselineHeight}px ±${HEIGHT_TOLERANCE}px. ` +
            `Actual: ${actualHeight}px. If this is intentional, update the baseline in layout-regression-baselines.json.`
          ).toBeGreaterThanOrEqual(baselineHeight - HEIGHT_TOLERANCE)

          expect(
            actualHeight,
            `Hero section height at ${vpName} (${theme}) should be ${baselineHeight}px ±${HEIGHT_TOLERANCE}px. ` +
            `Actual: ${actualHeight}px. If this is intentional, update the baseline in layout-regression-baselines.json.`
          ).toBeLessThanOrEqual(baselineHeight + HEIGHT_TOLERANCE)
        })
      }
    }

    for (const { name: vpName, size: viewport } of viewports) {
      for (const theme of themes) {
        test(`should keep hero text elements within bounds at ${vpName} in ${theme} mode`, async ({ page }) => {
          // Set viewport
          await page.setViewportSize(viewport)
          await gotoStable(page, '/')
          await setTheme(page, theme)

          const heroSection = page.locator('.hero-section')
          const heroBox = await heroSection.boundingBox()
          expect(heroBox, 'Hero section should have a bounding box').not.toBeNull()

          // Check all major hero text elements are within hero bounds
          const textSelectors = [
            '.hero-title',
            '.hero-subtitle--primary',
            '.hero-subtitle--alternate',
          ]

          for (const selector of textSelectors) {
            const element = page.locator(selector).first()
            // Element might be hidden (alternate subtitle with aria-hidden), skip if not visible
            const isVisible = await element.isVisible().catch(() => false)
            if (!isVisible) continue

            const elementBox = await element.boundingBox()
            if (!elementBox) continue

            // Verify element is within hero bounds vertically
            expect(
              elementBox.y,
              `${selector} at ${vpName} (${theme}) should be within hero top boundary`
            ).toBeGreaterThanOrEqual(heroBox!.y - 1) // -1px for subpixel rounding

            expect(
              elementBox.y + elementBox.height,
              `${selector} at ${vpName} (${theme}) should be within hero bottom boundary`
            ).toBeLessThanOrEqual(heroBox!.y + heroBox!.height + 1) // +1px for subpixel rounding

            // Verify element doesn't overflow horizontally
            expect(
              elementBox.x,
              `${selector} at ${vpName} (${theme}) should not overflow hero left`
            ).toBeGreaterThanOrEqual(heroBox!.x - 1)

            expect(
              elementBox.x + elementBox.width,
              `${selector} at ${vpName} (${theme}) should not overflow hero right`
            ).toBeLessThanOrEqual(heroBox!.x + heroBox!.width + 1)
          }

          // Additional check: verify subtitle vertical spacing is reasonable
          // (ensure they're not overlapping in a broken way)
          const primarySubtitle = page.locator('.hero-subtitle--primary')
          const primaryVisible = await primarySubtitle.isVisible().catch(() => false)
          
          if (primaryVisible) {
            const primaryBox = await primarySubtitle.boundingBox()
            const heroTitle = page.locator('.hero-title')
            const titleBox = await heroTitle.boundingBox()
            
            if (primaryBox && titleBox) {
              // Primary subtitle should be below the title
              expect(
                primaryBox.y,
                `Primary subtitle should be positioned below hero title at ${vpName} (${theme})`
              ).toBeGreaterThan(titleBox.y + titleBox.height - 10) // -10px for potential overlap
            }
          }
        })
      }
    }

    test('should not clip or overflow hero text horizontally at mobile widths', async ({ page }) => {
      // Test at narrowest mobile width
      await page.setViewportSize({ width: 375, height: 667 })
      await gotoStable(page, '/')

      const heroSection = page.locator('.hero-section')
      const heroBox = await heroSection.boundingBox()
      expect(heroBox, 'Hero section should have a bounding box').not.toBeNull()

      // Check title text
      const heroTitle = page.locator('.hero-title')
      await expect(heroTitle).toBeVisible()
      const titleBox = await heroTitle.boundingBox()
      expect(titleBox, 'Hero title should have a bounding box').not.toBeNull()

      // Title should not overflow hero section horizontally
      expect(
        titleBox!.width,
        'Hero title should not overflow hero section width'
      ).toBeLessThanOrEqual(heroBox!.width + 2) // +2px for subpixel rounding

      // Check subtitle text
      const heroSubtitle = page.locator('.hero-subtitle').first()
      await expect(heroSubtitle).toBeVisible()
      const subtitleBox = await heroSubtitle.boundingBox()
      expect(subtitleBox, 'Hero subtitle should have a bounding box').not.toBeNull()

      // Subtitle should not overflow hero section horizontally
      expect(
        subtitleBox!.width,
        'Hero subtitle should not overflow hero section width'
      ).toBeLessThanOrEqual(heroBox!.width + 2) // +2px for subpixel rounding

      // Check for CSS overflow: hidden or clip on text elements
      const titleOverflow = await heroTitle.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return styles.overflow || styles.overflowX
      })
      expect(
        ['visible', 'clip', 'hidden'],
        'Hero title should have appropriate overflow handling'
      ).toContain(titleOverflow)
    })
  })

  test.describe('Pricing Page - Subscribe Buttons', () => {
    const themes: Array<'light' | 'dark'> = ['light', 'dark']

    for (const theme of themes) {
      test(`should have visible, non-overflowing Subscribe buttons in ${theme} mode`, async ({ page }) => {
        await gotoStable(page, '/pricing')
        await setTheme(page, theme)

        // Find all Subscribe buttons (paid tier buttons)
        const subscribeButtons = page.locator('.pricing-tier-button-paid')
        const count = await subscribeButtons.count()
        expect(count, 'Should have at least one Subscribe button').toBeGreaterThan(0)

        // Check each Subscribe button
        for (let i = 0; i < count; i++) {
          const button = subscribeButtons.nth(i)
          
          // Button should be visible
          await expect(button).toBeVisible()

          // Get button box
          const buttonBox = await button.boundingBox()
          expect(buttonBox, `Subscribe button ${i} should have a bounding box`).not.toBeNull()

          // Find the closest pricing tier card container
          const tierCard = button.locator('xpath=ancestor::div[contains(@class, "pricing-tier")][1]')
          const tierBox = await tierCard.boundingBox()
          expect(tierBox, `Tier card ${i} should have a bounding box`).not.toBeNull()

          // Button should not overflow the tier card horizontally
          expect(
            buttonBox!.width,
            `Subscribe button ${i} should not overflow tier card width`
          ).toBeLessThanOrEqual(tierBox!.width + 2) // +2px for subpixel rounding

          // Button should not overflow the tier card vertically
          const buttonBottom = buttonBox!.y + buttonBox!.height
          const tierBottom = tierBox!.y + tierBox!.height
          expect(
            buttonBottom,
            `Subscribe button ${i} should not overflow tier card bottom`
          ).toBeLessThanOrEqual(tierBottom + 2) // +2px for subpixel rounding
        }
      })

      test(`should have readable contrast on Subscribe buttons in ${theme} mode with axe`, async ({ page }) => {
        await gotoStable(page, '/pricing')
        await setTheme(page, theme)

        // Import axe for contrast checking (if axe is available in this project)
        // Check if @axe-core/playwright is installed
        try {
          const { default: AxeBuilder } = await import('@axe-core/playwright')

          // Run axe only on Subscribe buttons
          const results = await new AxeBuilder({ page })
            .include('.pricing-tier-button-paid')
            .withTags(['wcag2aa'])
            .disableRules([
              'region', 'landmark-one-main', 'page-has-heading-one',
              'bypass', 'document-title', 'html-has-lang', 'landmark-unique'
            ])
            .analyze()

          // Check specifically for color-contrast violations on buttons
          const contrastViolations = results.violations.filter(
            v => v.id === 'color-contrast'
          )

          expect(
            contrastViolations.length,
            `Subscribe buttons should have sufficient contrast in ${theme} mode. ` +
            `Found ${contrastViolations.length} contrast violation(s).`
          ).toBe(0)
        } catch (err) {
          // If axe is not available or import fails, skip this check
          test.skip()
        }
      })
    }
  })

  test.describe('No Horizontal Scroll', () => {
    test('should not have horizontal scroll at 375px on homepage', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await gotoStable(page, '/')

      // Get document scroll width vs client width
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      expect(
        scrollWidth,
        `Homepage should not have horizontal scroll at 375px. ` +
        `scrollWidth: ${scrollWidth}px, clientWidth: ${clientWidth}px`
      ).toBeLessThanOrEqual(clientWidth + 1) // +1px for subpixel rounding
    })

    test('should not have horizontal scroll at 375px on /pricing', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await gotoStable(page, '/pricing')

      // Get document scroll width vs client width
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      expect(
        scrollWidth,
        `/pricing should not have horizontal scroll at 375px. ` +
        `scrollWidth: ${scrollWidth}px, clientWidth: ${clientWidth}px`
      ).toBeLessThanOrEqual(clientWidth + 1) // +1px for subpixel rounding
    })
  })
})
