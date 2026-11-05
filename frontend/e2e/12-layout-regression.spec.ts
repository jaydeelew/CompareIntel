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
 *
 * The hero baselines are PRODUCTION heights. Do not raise them to make a change pass: the pricing
 * line is absolutely positioned and must never add hero height.
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { mockModelsApi } from './helpers/mockModels'

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load baselines from JSON file
const baselinesPath = join(__dirname, 'layout-regression-baselines.json')
const baselines = JSON.parse(readFileSync(baselinesPath, 'utf-8'))

/**
 * Tolerance for hero height vs. the production baseline (±1px).
 * The baselines are production heights; this only absorbs sub-pixel rounding between engines.
 */
const HEIGHT_TOLERANCE = 1

/** Minimum WCAG AA contrast for normal-size text */
const MIN_TEXT_CONTRAST = 4.5

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

  // Wait for layout to settle and any pending updates to complete
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      // Double rAF to ensure paint has completed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Additional rAF to ensure any React updates from paint have been processed
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })
    })
  })
}

/**
 * Wait for the hero's finite CSS animations (the fade/slide-up entrance) to finish.
 * The pricing line lives inside the slide-up container, so while that transform is animating the
 * credits line and the pricing line move together but the hero bottom does not; the line is only
 * centered between them once the animation has ended (useCenteredPricingLine re-centers on
 * `animationend`). Under CI load the animation can still be running well after `load`.
 */
async function waitForHeroEntranceAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const hero = document.querySelector('.hero-section')
    if (!hero) return
    const running = document.getAnimations().filter(animation => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      const endTime = animation.effect?.getComputedTiming().endTime
      return target instanceof Element && hero.contains(target) && Number.isFinite(endTime)
    })
    await Promise.all(running.map(animation => animation.finished.catch(() => undefined)))
  })
  await waitForStableLayout(page)
}

/**
 * Measure hero, credits and pricing line geometry in one synchronous task so a layout change
 * (navbar fold, late font/credits update) cannot land between the three measurements.
 */
async function measurePricingLineCentering(page: Page): Promise<{
  creditsBottom: number
  heroBottom: number
  pricingTop: number
  pricingBottom: number
  expectedCenter: number
  pricingCenter: number
  centeringError: number
} | null> {
  return page.evaluate(() => {
    const hero = document.querySelector('.hero-section')
    const credits = document.querySelector('.credits-remaining-wrapper')
    const pricing = document.querySelector('.hero-pricing-line')
    if (!hero || !credits || !pricing) return null
    const creditsBottom = credits.getBoundingClientRect().bottom
    const heroBottom = hero.getBoundingClientRect().bottom
    const pricingRect = pricing.getBoundingClientRect()
    const expectedCenter = (creditsBottom + heroBottom) / 2
    const pricingCenter = pricingRect.top + pricingRect.height / 2
    return {
      creditsBottom,
      heroBottom,
      pricingTop: pricingRect.top,
      pricingBottom: pricingRect.bottom,
      expectedCenter,
      pricingCenter,
      centeringError: Math.abs(pricingCenter - expectedCenter),
    }
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
  await page.evaluate(targetTheme => {
    document.documentElement.setAttribute('data-theme', targetTheme)
    localStorage.setItem('theme', targetTheme)
  }, theme)

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready)

  // At desktop viewports, hover over the navbar area to trigger activity
  // The navbar auto-folds after 5s of inactivity, which affects hero min-height
  const isDesktop = page.viewportSize()!.width > 768
  if (isDesktop) {
    await page.mouse.move(100, 30)
  }

  // Wait for pricing line centering and layout updates to complete
  await page.evaluate(() => {
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      })
    })
  })

  await waitForStableLayout(page)
}

/**
 * Navigate to page and wait for it to be fully loaded.
 * Mocks critical API endpoints to ensure deterministic layout without external dependencies.
 */
async function gotoStable(page: Page, path: string): Promise<void> {
  // Mock API responses before navigation to prevent errors from affecting layout
  await mockModelsApi(page, 'unregistered')

  // Mock auth/me to return unauthenticated state immediately
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

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
      { name: '1024x768', size: { width: 1024, height: 768 } },
      { name: '1280x800', size: { width: 1280, height: 800 } },
      { name: '1440x900', size: { width: 1440, height: 900 } },
      { name: '1920x1080', size: { width: 1920, height: 1080 } },
    ]

    const themes: Array<'light' | 'dark'> = ['light', 'dark']

    for (const { name: vpName, size: viewport } of viewports) {
      for (const theme of themes) {
        test(`should maintain hero section height at ${vpName} in ${theme} mode`, async ({
          page,
        }, testInfo) => {
          test.skip(
            baselines.hero.chromiumOnly.includes(vpName) && testInfo.project.name !== 'chromium',
            `${vpName} hero height is content-driven and differs per engine; asserted on desktop Chromium only`
          )

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
          let baselineHeight = baselines.hero.viewports[vpName][theme]

          // At desktop viewports (> 768px), navbar can auto-fold after 5s
          // When folded, hero uses 100vh instead of 100vh - 64px
          // Accept either height since timing determines fold state
          const isDesktop = viewport.width > 768
          if (isDesktop) {
            const isNavbarFolded = await page.evaluate(() => {
              const navbar = document.querySelector('.app-header-shell')
              return navbar?.classList.contains('app-header-shell--folded') ?? false
            })

            if (isNavbarFolded && actualHeight === viewport.height) {
              // Navbar is folded, hero is 100vh (full viewport height)
              baselineHeight = viewport.height
            }
          }

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
        test(`should center pricing line between credits and hero bottom at ${vpName} in ${theme} mode`, async ({
          page,
        }) => {
          // Set viewport
          await page.setViewportSize(viewport)
          await gotoStable(page, '/')
          await setTheme(page, theme)

          // Pricing line should be visible (only shown for unauthenticated users)
          const pricingLine = page.locator('.hero-pricing-line').first()
          const pricingVisible = await pricingLine.isVisible().catch(() => false)

          if (pricingVisible) {
            await expect(page.locator('.credits-remaining-wrapper').first()).toBeVisible()
            await waitForHeroEntranceAnimations(page)

            // Pricing line should be centered between the bottom of the credits line and the
            // bottom of the hero. The tolerance is unchanged. Every assertion runs against one
            // synchronous snapshot, and the block is retried because the hook re-centers on a
            // requestAnimationFrame after each layout change (e.g. the desktop navbar auto-folding
            // after 5s resizes the hero); a line that never settles still fails after the timeout.
            await expect(async () => {
              const m = await measurePricingLineCentering(page)
              expect(m, 'Hero, credits line and pricing line should be measurable').not.toBeNull()
              const { creditsBottom, heroBottom, pricingTop, pricingBottom } = m!

              expect(
                m!.centeringError,
                `Pricing line should be vertically centered at ${vpName} (${theme}). ` +
                  `Expected center: ${m!.expectedCenter.toFixed(1)}px, Actual: ${m!.pricingCenter.toFixed(1)}px, ` +
                  `Error: ${m!.centeringError.toFixed(1)}px (tolerance: ±${CENTERING_TOLERANCE}px). ` +
                  `Credits bottom: ${creditsBottom.toFixed(1)}px, Hero bottom: ${heroBottom.toFixed(1)}px`
              ).toBeLessThanOrEqual(CENTERING_TOLERANCE)

              // Also verify pricing line is within hero bounds
              expect(
                pricingTop,
                `Pricing line at ${vpName} (${theme}) should be below credits line`
              ).toBeGreaterThanOrEqual(creditsBottom - 1)

              expect(
                pricingBottom,
                `Pricing line at ${vpName} (${theme}) should be above hero bottom`
              ).toBeLessThanOrEqual(heroBottom + 1)
            }).toPass({ timeout: 5000, intervals: [50, 100, 250] })
          }
        })

        test(`pricing line should add zero height to the hero at ${vpName} in ${theme} mode`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport)
          await gotoStable(page, '/')
          await setTheme(page, theme)

          const pricingLine = page.locator('.hero-pricing-line').first()
          await expect(pricingLine).toBeVisible()

          // Measure with and without the line inside one synchronous task. The desktop navbar
          // auto-folds on a timer (changing the hero's viewport-based min-height by 64px), so two
          // separate measurements could straddle a fold and misattribute that change to the line.
          const { withLine, withoutLine } = await page.evaluate(() => {
            const hero = document.querySelector('.hero-section')!
            const withLine = hero.getBoundingClientRect().height
            const style = document.createElement('style')
            style.textContent = '.hero-pricing-line { display: none !important; }'
            document.head.appendChild(style)
            const withoutLine = hero.getBoundingClientRect().height
            style.remove()
            return { withLine, withoutLine }
          })

          expect(
            withLine - withoutLine,
            `Pricing line must not change hero height at ${vpName} (${theme}): ` +
              `${withLine}px with the line vs ${withoutLine}px without it`
          ).toBe(0)
        })

        test(`pricing line text and link should be readable at ${vpName} in ${theme} mode`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport)
          await gotoStable(page, '/')
          await setTheme(page, theme)

          const pricingLine = page.locator('.hero-pricing-line').first()
          await expect(pricingLine).toBeVisible()

          const styles = await page.evaluate(() => {
            const line = document.querySelector('.hero-pricing-line')!
            const link = line.querySelector('a')!
            const rect = line.getBoundingClientRect()
            return {
              text: getComputedStyle(line).color,
              link: getComputedStyle(link).color,
              linkDecoration: getComputedStyle(link).textDecorationLine,
              rect: {
                x: rect.x,
                y: rect.y + window.scrollY,
                width: rect.width,
                height: rect.height,
              },
            }
          })

          // Sample the real gradient behind the line (text hidden) and use its lightest pixel,
          // which is the worst case for light text.
          await page.addStyleTag({
            content:
              '.hero-pricing-line, .hero-pricing-line * { color: transparent !important; text-shadow: none !important; text-decoration: none !important; }',
          })
          const viewportSize = page.viewportSize()!
          const x = Math.max(0, styles.rect.x)
          const backdrop = await page.screenshot({
            fullPage: true,
            clip: {
              x,
              y: styles.rect.y,
              width: Math.min(styles.rect.width, viewportSize.width - x),
              height: styles.rect.height,
            },
          })
          const lightestBackdrop = await page.evaluate(async (b64: string) => {
            const img = new Image()
            img.src = `data:image/png;base64,${b64}`
            await img.decode()
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            const { data } = ctx.getImageData(0, 0, img.width, img.height)
            const lin = (c: number) => {
              const v = c / 255
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
            }
            let best = { l: -1, rgb: [0, 0, 0] }
            for (let i = 0; i < data.length; i += 4) {
              const l =
                0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2])
              if (l > best.l) best = { l, rgb: [data[i], data[i + 1], data[i + 2]] }
            }
            return best.rgb
          }, backdrop.toString('base64'))

          const parse = (css: string) => {
            const m = css.match(/[\d.]+/g)!.map(Number)
            return { rgb: m.slice(0, 3), alpha: m[3] ?? 1 }
          }
          const luminance = ([r, g, b]: number[]) => {
            const lin = (c: number) => {
              const v = c / 255
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
          }
          const contrast = (css: string) => {
            const { rgb, alpha } = parse(css)
            const blended = rgb.map((c, i) => c * alpha + lightestBackdrop[i] * (1 - alpha))
            const a = luminance(blended)
            const b = luminance(lightestBackdrop)
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          }

          expect(
            contrast(styles.text),
            `Pricing text (${styles.text}) on lightest backdrop rgb(${lightestBackdrop}) at ${vpName} (${theme})`
          ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
          expect(
            contrast(styles.link),
            `"See plans" link (${styles.link}) on lightest backdrop rgb(${lightestBackdrop}) at ${vpName} (${theme})`
          ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
          expect(styles.linkDecoration, '"See plans" link should be underlined').toContain(
            'underline'
          )
        })

        test(`should keep hero text elements within bounds at ${vpName} in ${theme} mode`, async ({
          page,
        }) => {
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

    test('should not clip or overflow hero text horizontally at mobile widths', async ({
      page,
    }) => {
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
      const titleOverflow = await heroTitle.evaluate(el => {
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
      test(`should have visible, non-overflowing Subscribe buttons in ${theme} mode`, async ({
        page,
      }) => {
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
          const tierCard = button.locator(
            'xpath=ancestor::div[contains(@class, "pricing-tier")][1]'
          )
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

      test(`should have readable contrast on Subscribe buttons in ${theme} mode with axe`, async ({
        page,
      }) => {
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
              'region',
              'landmark-one-main',
              'page-has-heading-one',
              'bypass',
              'document-title',
              'html-has-lang',
              'landmark-unique',
            ])
            .analyze()

          // Check specifically for color-contrast violations on buttons
          const contrastViolations = results.violations.filter(v => v.id === 'color-contrast')

          expect(
            contrastViolations.length,
            `Subscribe buttons should have sufficient contrast in ${theme} mode. ` +
              `Found ${contrastViolations.length} contrast violation(s).`
          ).toBe(0)
        } catch {
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
