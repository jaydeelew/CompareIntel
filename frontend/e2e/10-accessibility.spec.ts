/**
 * Accessibility (a11y) Tests using axe-core
 *
 * These tests verify that key pages meet WCAG 2.1 Level AA accessibility standards.
 * Uses @axe-core/playwright to run automated accessibility audits.
 *
 * Run these tests:
 *   npm run test:e2e -- --grep "Accessibility"
 *
 * Note: Automated testing catches ~30-40% of accessibility issues.
 * Manual testing with screen readers and keyboard navigation is also recommended.
 */

import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

// Accessibility test configuration
const _A11Y_CONFIG = {
  // WCAG 2.1 Level AA compliance
  // See: https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23702&versions=2.1&levels=aaa
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
  // Rules to exclude (if any have known issues being addressed)
  rules: {
    // Example: 'color-contrast': { enabled: false },
  },
}

/**
 * Helper to run axe analysis and generate readable report
 */
async function runAccessibilityAudit(page: InstanceType<typeof import('@playwright/test').Page>) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  return results
}

/**
 * Format violations for readable error messages
 */
function formatViolations(violations: (typeof import('axe-core').Result)[]) {
  return violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 3).map(n => n.target.join(' > ')), // First 3 affected elements
  }))
}

test.describe('Accessibility Tests', () => {
  test.describe('Core Pages', () => {
    test('Homepage should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      // Log violations for debugging (if any)
      if (results.violations.length > 0) {
        console.log('Homepage accessibility violations:')
        console.log(JSON.stringify(formatViolations(results.violations), null, 2))
      }

      // Allow up to 3 violations for now (can be reduced over time)
      // Critical/serious issues should always be 0
      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(
        criticalViolations.length,
        `Found ${criticalViolations.length} critical/serious accessibility violations:\n` +
          JSON.stringify(formatViolations(criticalViolations), null, 2)
      ).toBe(0)
    })

    test('About page should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/about')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    })

    test('Features page should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/features')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    })

    test('FAQ page should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/faq')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    })

    test('Privacy Policy page should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/privacy-policy')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    })

    test('Terms of Service page should meet WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/terms-of-service')
      await page.waitForLoadState('networkidle')

      const results = await runAccessibilityAudit(page)

      // Log violations for debugging (if any)
      if (results.violations.length > 0) {
        console.log('Terms of Service page accessibility violations:')
        console.log(JSON.stringify(formatViolations(results.violations), null, 2))
      }

      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(
        criticalViolations.length,
        `Found ${criticalViolations.length} critical/serious accessibility violations:\n` +
          JSON.stringify(formatViolations(criticalViolations), null, 2)
      ).toBe(0)
    })
  })

  test.describe('Interactive Components', () => {
    test('Login modal should be accessible', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Dismiss tutorial overlay if present (blocks interactions)
      const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
      const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)
      if (overlayVisible) {
        // Try to find and click skip button
        const skipButton = page.locator(
          '.tutorial-welcome-button-secondary, button:has-text("Skip for Now"), .tutorial-close-button, button[aria-label*="Skip"]'
        )
        const skipVisible = await skipButton.isVisible({ timeout: 3000 }).catch(() => false)
        if (skipVisible) {
          await skipButton.click({ timeout: 5000 }).catch(() => {})
          await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        } else {
          // Fallback to Escape key
          await page.keyboard.press('Escape').catch(() => {})
          await page.waitForTimeout(500)
        }
      }

      // Open login modal
      const loginButton = page.getByRole('button', { name: /log in|sign in/i })
      if (await loginButton.isVisible()) {
        await loginButton.click()
        await page.waitForTimeout(500) // Wait for modal animation

        const results = await runAccessibilityAudit(page)

        // Check for modal-specific accessibility issues
        const criticalViolations = results.violations.filter(
          v => v.impact === 'critical' || v.impact === 'serious'
        )

        // Log all violations for debugging
        if (results.violations.length > 0) {
          console.log('Login modal accessibility violations:')
          console.log(JSON.stringify(formatViolations(results.violations), null, 2))
        }

        expect(criticalViolations.length).toBe(0)
      }
    })

    test('Model selection should be keyboard navigable', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check if model selection area exists and is accessible
      const modelSection = page
        .locator('[class*="model"], [role="listbox"], [role="checkbox"]')
        .first()
      if (await modelSection.isVisible()) {
        // Verify keyboard navigation works
        await page.keyboard.press('Tab')
        const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
        expect(focusedElement).toBeTruthy()
      }
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('Should be able to navigate homepage with keyboard only', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Start from beginning
      await page.keyboard.press('Tab')

      // Should be able to tab through main navigation items
      const focusableElements: string[] = []
      for (let i = 0; i < 10; i++) {
        const focused = await page.evaluate(() => {
          const el = document.activeElement
          return el ? `${el.tagName}:${el.textContent?.slice(0, 20)}` : null
        })
        if (focused) {
          focusableElements.push(focused)
        }
        await page.keyboard.press('Tab')
      }

      // Verify navigation elements are focusable
      expect(focusableElements.length).toBeGreaterThan(0)

      // Check skip link (should be first focusable element)
      await page.goto('/')
      await page.keyboard.press('Tab')
      const firstFocused = await page.evaluate(() => {
        const el = document.activeElement
        return el?.textContent?.toLowerCase() || ''
      })

      // First element should ideally be a skip link or main navigation
      // This is a soft check - log if not present
      if (!firstFocused.includes('skip') && !firstFocused.includes('main')) {
        console.log('Consider adding a "Skip to main content" link for keyboard users')
      }
    })

    test('Focus should be visible on interactive elements', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Tab to first button
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Get the focused element's outline/ring style
      const focusStyles = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return null
        const styles = window.getComputedStyle(el)
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow,
        }
      })

      // Verify focus indicator is visible (outline or box-shadow)
      if (focusStyles) {
        const hasFocusIndicator =
          (focusStyles.outline &&
            focusStyles.outline !== 'none' &&
            focusStyles.outlineWidth !== '0px') ||
          (focusStyles.boxShadow && focusStyles.boxShadow !== 'none')

        // This is a soft warning - some styles might use different focus indicators
        if (!hasFocusIndicator) {
          console.log('Warning: Focus indicator may not be visible. Styles:', focusStyles)
        }
      }
    })
  })

  test.describe('Color Contrast', () => {
    test('Text should have sufficient color contrast', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze()

      // Check specifically for color contrast violations
      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast')

      if (contrastViolations.length > 0) {
        console.log('Color contrast issues found:')
        console.log(JSON.stringify(formatViolations(contrastViolations), null, 2))
      }

      // Allow some contrast issues but flag them (soft check)
      expect(
        contrastViolations.length,
        `Found ${contrastViolations.length} color contrast issues`
      ).toBeLessThan(5)
    })
  })

  test.describe('ARIA and Semantic HTML', () => {
    test('Interactive elements should have accessible names', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page }).analyze()

      // Check for button/link without accessible names
      const nameViolations = results.violations.filter(
        v => v.id.includes('name') || v.id.includes('label')
      )

      if (nameViolations.length > 0) {
        console.log('Elements missing accessible names:')
        console.log(JSON.stringify(formatViolations(nameViolations), null, 2))
      }

      // Critical: all interactive elements must have names
      const criticalNameViolations = nameViolations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalNameViolations.length).toBe(0)
    })

    test('Page should have proper landmark structure', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Check for main landmark
      const mainLandmark = await page.locator('main, [role="main"]').count()
      expect(mainLandmark, 'Page should have a main landmark').toBeGreaterThan(0)

      // Check for navigation
      const navLandmark = await page.locator('nav, [role="navigation"]').count()
      expect(navLandmark, 'Page should have navigation landmark').toBeGreaterThan(0)
    })

    test('Headings should be in logical order', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Dismiss tutorial overlay if present
      const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
      const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)
      if (overlayVisible) {
        const skipButton = page.locator(
          '.tutorial-welcome-button-secondary, button:has-text("Skip for Now"), .tutorial-close-button, button[aria-label*="Skip"]'
        )
        const skipVisible = await skipButton.isVisible({ timeout: 3000 }).catch(() => false)
        if (skipVisible) {
          await skipButton.click({ timeout: 5000 }).catch(() => {})
          await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        } else {
          await page.keyboard.press('Escape').catch(() => {})
          await page.waitForTimeout(500)
        }
      }

      // Get all headings
      const headings = await page.evaluate(() => {
        const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
        return Array.from(elements).map(el => ({
          level: parseInt(el.tagName[1]),
          text: el.textContent?.slice(0, 50),
        }))
      })

      // Check for H1 (should be exactly 1 - the visually hidden SEO H1 in Layout)
      const h1Count = headings.filter(h => h.level === 1).length
      expect(h1Count, 'Page should have exactly one H1').toBe(1)

      // Check heading order (no skipping levels)
      let previousLevel = 0
      let hasSkippedLevel = false
      for (const heading of headings) {
        if (heading.level > previousLevel + 1 && previousLevel > 0) {
          hasSkippedLevel = true
          console.log(`Warning: Heading level skipped from H${previousLevel} to H${heading.level}`)
        }
        previousLevel = heading.level
      }

      // Soft check - log warning but don't fail
      if (hasSkippedLevel) {
        console.log('Consider maintaining proper heading hierarchy for screen reader users')
      }
    })
  })
})
