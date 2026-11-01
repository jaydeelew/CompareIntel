import { test, expect } from '@playwright/test'

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const rsrgb = r / 255
  const gsrgb = g / 255
  const bsrgb = b / 255

  const rlin = rsrgb <= 0.03928 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4)
  const glin = gsrgb <= 0.03928 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4)
  const blin = bsrgb <= 0.03928 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4)

  return 0.2126 * rlin + 0.7152 * glin + 0.0722 * blin
}

function getContrastRatio(rgb1: number[], rgb2: number[]): number {
  const l1 = getRelativeLuminance(rgb1[0], rgb1[1], rgb1[2])
  const l2 = getRelativeLuminance(rgb2[0], rgb2[1], rgb2[2])
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbStringToArray(rgb: string): number[] {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return [0, 0, 0]
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
}

test.describe('Hero Pricing Line Accessibility', () => {
  test('Pricing line meets WCAG AA contrast in light mode', async ({ page }) => {
    await page.goto('http://localhost:4173/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Set light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await page.waitForTimeout(500)

    const pricingLine = page.locator('.hero-pricing-line').first()
    await expect(pricingLine).toBeVisible()

    const { textColor, bgColor } = await page.evaluate(() => {
      const el = document.querySelector('.hero-pricing-line') as HTMLElement
      if (!el) return { textColor: '', bgColor: '' }
      const styles = window.getComputedStyle(el)
      
      // Get background from hero section
      let bgEl: Element | null = el
      let bg = ''
      while (bgEl && !bg) {
        const bgStyle = window.getComputedStyle(bgEl as HTMLElement)
        const bgColorVal = bgStyle.backgroundColor
        if (bgColorVal && bgColorVal !== 'rgba(0, 0, 0, 0)' && bgColorVal !== 'transparent') {
          bg = bgColorVal
          break
        }
        bgEl = bgEl.parentElement
      }
      
      return {
        textColor: styles.color,
        bgColor: bg || 'rgb(255, 255, 255)', // Default to white if not found
      }
    })

    const textRgb = rgbStringToArray(textColor)
    const bgRgb = rgbStringToArray(bgColor)
    const contrast = getContrastRatio(textRgb, bgRgb)

    console.log(`\n===== Light Mode Contrast =====`)
    console.log(`Text Color: ${textColor} (${textRgb.join(', ')})`)
    console.log(`Background Color: ${bgColor} (${bgRgb.join(', ')})`)
    console.log(`Contrast Ratio: ${contrast.toFixed(2)}:1`)
    console.log(`WCAG AA (4.5:1): ${contrast >= 4.5 ? 'PASS ✓' : 'FAIL ✗'}`)
    console.log(`================================\n`)

    expect(contrast, `Light mode contrast ratio should be at least 4.5:1 for WCAG AA compliance`).toBeGreaterThanOrEqual(4.5)
  })

  test('Pricing line meets WCAG AA contrast in dark mode', async ({ page }) => {
    await page.goto('http://localhost:4173/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Set dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await page.waitForTimeout(500)

    const pricingLine = page.locator('.hero-pricing-line').first()
    await expect(pricingLine).toBeVisible()

    const { textColor, bgColor } = await page.evaluate(() => {
      const el = document.querySelector('.hero-pricing-line') as HTMLElement
      if (!el) return { textColor: '', bgColor: '' }
      const styles = window.getComputedStyle(el)
      
      // Get background from hero section
      let bgEl: Element | null = el
      let bg = ''
      while (bgEl && !bg) {
        const bgStyle = window.getComputedStyle(bgEl as HTMLElement)
        const bgColorVal = bgStyle.backgroundColor
        if (bgColorVal && bgColorVal !== 'rgba(0, 0, 0, 0)' && bgColorVal !== 'transparent') {
          bg = bgColorVal
          break
        }
        bgEl = bgEl.parentElement
      }
      
      return {
        textColor: styles.color,
        bgColor: bg || 'rgb(17, 24, 39)', // Default to dark if not found
      }
    })

    const textRgb = rgbStringToArray(textColor)
    const bgRgb = rgbStringToArray(bgColor)
    const contrast = getContrastRatio(textRgb, bgRgb)

    console.log(`\n===== Dark Mode Contrast =====`)
    console.log(`Text Color: ${textColor} (${textRgb.join(', ')})`)
    console.log(`Background Color: ${bgColor} (${bgRgb.join(', ')})`)
    console.log(`Contrast Ratio: ${contrast.toFixed(2)}:1`)
    console.log(`WCAG AA (4.5:1): ${contrast >= 4.5 ? 'PASS ✓' : 'FAIL ✗'}`)
    console.log(`===============================\n`)

    expect(contrast, `Dark mode contrast ratio should be at least 4.5:1 for WCAG AA compliance`).toBeGreaterThanOrEqual(4.5)
  })
})
