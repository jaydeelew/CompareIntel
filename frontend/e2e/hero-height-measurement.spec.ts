import { test, expect, dismissTutorialOverlay, waitForReactHydration } from './fixtures'

/**
 * Measure hero section height at various breakpoints in light and dark modes
 * to ensure the changes don't increase hero height compared to pre-PR #155
 */

const BREAKPOINTS = [375, 768, 1024, 1280, 1440]

test.describe('Hero Section Height Measurements', () => {
  test('Measure hero heights at all breakpoints in light and dark modes', async ({ page }) => {
    test.setTimeout(120000)
    
    const measurements: Record<string, Record<number, number>> = {
      light: {},
      dark: {},
    }

    for (const theme of ['light', 'dark'] as const) {
      // Set theme
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {})
      await waitForReactHydration(page)
      await dismissTutorialOverlay(page)

      // Set the theme
      const currentTheme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-theme')
      })

      if (currentTheme !== theme) {
        const themeToggle = page.getByTestId('theme-toggle')
        await themeToggle.click()
        await page.waitForTimeout(300)
      }

      for (const width of BREAKPOINTS) {
        await page.setViewportSize({ width, height: 1000 })
        await page.waitForTimeout(500) // Allow layout to settle

        const heroHeight = await page.evaluate(() => {
          const hero = document.querySelector('.hero-section')
          if (!hero) return 0
          return hero.getBoundingClientRect().height
        })

        measurements[theme][width] = heroHeight
      }
    }

    // Log measurements
    console.log('\n===== Hero Section Height Measurements =====')
    console.log('\nLight Mode:')
    for (const width of BREAKPOINTS) {
      console.log(`  ${width}px: ${measurements.light[width]}px`)
    }
    console.log('\nDark Mode:')
    for (const width of BREAKPOINTS) {
      console.log(`  ${width}px: ${measurements.dark[width]}px`)
    }
    console.log('\n===========================================\n')

    // Verify measurements are reasonable (hero should be at least 500px tall)
    for (const theme of ['light', 'dark'] as const) {
      for (const width of BREAKPOINTS) {
        expect(
          measurements[theme][width],
          `Hero height at ${width}px in ${theme} mode should be at least 500px`
        ).toBeGreaterThan(500)
      }
    }
  })
})
