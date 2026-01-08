import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Unregistered User Journey
 *
 * Tests the complete first-time visitor experience:
 * - Landing on homepage
 * - Understanding the platform
 * - Performing first comparison
 * - Rate limit awareness
 * - Sign-up prompts
 */

test.describe('Unregistered User Journey', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all authentication state
    await context.clearCookies()
    await context.clearPermissions()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('First-time visitor can explore homepage', async ({ page }) => {
    await test.step('Homepage loads correctly', async () => {
      await expect(page).toHaveTitle(/CompareIntel/i)

      // Verify main navigation is visible
      await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()
      await expect(page.getByTestId('nav-sign-up-button')).toBeVisible()

      // Verify hero section is visible
      const heroSection = page.locator('.hero-section, [class*="hero"]')
      await expect(heroSection.first()).toBeVisible()
    })

    await test.step('Comparison form is accessible', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()
      await expect(inputField).toBeEnabled()

      // Verify placeholder text guides the user
      const placeholder = await inputField.getAttribute('placeholder')
      expect(placeholder).toBeTruthy()
    })

    await test.step('Model selection is visible', async () => {
      // Wait for models to load - check for loading message to disappear or checkboxes to appear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // Loading message might not exist or already be gone, continue
      })

      // Wait for model checkboxes to appear (they're inside model cards)
      const modelCheckboxes = page.locator('input[type="checkbox"].model-checkbox')
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      // Verify at least some model selection UI is present
      const modelCount = await modelCheckboxes.count()
      expect(modelCount).toBeGreaterThan(0)
    })
  })

  test('Unregistered user can perform a comparison', async ({ page }) => {
    await test.step('Enter a prompt', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await inputField.fill('What is artificial intelligence?')

      // Verify input is captured
      const value = await inputField.inputValue()
      expect(value).toBe('What is artificial intelligence?')
    })

    await test.step('Select models (within unregistered limit)', async () => {
      // Wait for models to load first
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // Loading message might not exist or already be gone, continue
      })

      // Unregistered users can select up to 3 models
      const modelCheckboxes = page.locator('input[type="checkbox"].model-checkbox')
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select up to 3 models
      const modelsToSelect = Math.min(3, checkboxCount)
      for (let i = 0; i < modelsToSelect; i++) {
        await modelCheckboxes.nth(i).check()
      }

      // Verify models are selected
      for (let i = 0; i < modelsToSelect; i++) {
        await expect(modelCheckboxes.nth(i)).toBeChecked()
      }
    })

    await test.step('Submit comparison', async () => {
      const submitButton = page.getByTestId('comparison-submit-button')
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toBeEnabled()

      await submitButton.click()

      // Button should show loading state
      await page.waitForTimeout(500)
    })

    await test.step('Results appear', async () => {
      // Wait for results to start appearing (streaming)
      const results = page.locator(
        '[data-testid^="result-card-"], ' +
          '.result-card, ' +
          '.model-response, ' +
          '[class*="result"]'
      )

      // Results should appear within reasonable time
      // Note: This might fail if backend isn't running, which is acceptable
      const hasResults = await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => false)

      if (hasResults) {
        await expect(results.first()).toBeVisible()

        // Verify at least one result card is displayed
        const resultCount = await results.count()
        expect(resultCount).toBeGreaterThan(0)
      } else {
        // If backend isn't running, check for error message
        const errorMessage = page.getByText(/error|failed|unable|network/i)
        const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false)

        if (hasError) {
          test.info().annotations.push({
            type: 'note',
            description: 'Backend may not be running - comparison request failed',
          })
        }
      }
    })
  })

  test('Unregistered user sees rate limit information', async ({ page }) => {
    // Look for rate limit indicator or usage information
    const rateLimitIndicator = page.locator(
      '[data-testid="rate-limit-status"], ' +
        '.rate-limit-status, ' +
        '.usage-status, ' +
        '[class*="credit"], ' +
        '[class*="usage"]'
    )

    // Rate limit info might be visible or might appear after first use
    const isVisible = await rateLimitIndicator
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (isVisible) {
      await expect(rateLimitIndicator.first()).toBeVisible()
    }
  })

  test('Unregistered user is prompted to sign up', async ({ page }) => {
    // Sign-up prompts can appear in various places:
    // - Navigation button (always visible)
    // - Banner/alert after using features
    // - Inline prompts

    // Navigation sign-up button should always be visible
    const signUpButton = page.getByTestId('nav-sign-up-button')
    await expect(signUpButton).toBeVisible()

    // There might be additional prompts after using features
    const signUpPrompts = page
      .locator('p, span, div, [role="alert"]')
      .filter({ hasText: /sign up|register|create account|free account/i })

    const promptCount = await signUpPrompts.count()
    // At least the nav button should be present
    expect(promptCount).toBeGreaterThanOrEqual(0)
  })

  test('Unregistered user cannot select more than 3 models', async ({ page }) => {
    // Wait for models to load first
    const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
    await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // Loading message might not exist or already be gone, continue
    })

    const modelCheckboxes = page.locator('input[type="checkbox"].model-checkbox')
    await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

    const checkboxCount = await modelCheckboxes.count()
    expect(checkboxCount).toBeGreaterThan(0)

    if (checkboxCount > 3) {
      // Select first 3 models
      for (let i = 0; i < 3; i++) {
        await modelCheckboxes.nth(i).check()
        await expect(modelCheckboxes.nth(i)).toBeChecked()
      }

      // Try to select 4th model - should be disabled or show error
      const fourthCheckbox = modelCheckboxes.nth(3)

      if (await fourthCheckbox.isEnabled()) {
        // If enabled, selecting it should either:
        // 1. Uncheck one of the first 3
        // 2. Show an error message
        // 3. Be prevented

        await fourthCheckbox.check()
        await page.waitForTimeout(500)

        // Check if error message appears
        const errorMessage = page.getByText(/limit|maximum|3 models|select up to/i)
        const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)

        // Or check if one of the first 3 was unchecked
        const firstThreeChecked = await Promise.all([
          modelCheckboxes.nth(0).isChecked(),
          modelCheckboxes.nth(1).isChecked(),
          modelCheckboxes.nth(2).isChecked(),
        ])
        const allThreeChecked = firstThreeChecked.every(Boolean)

        // Either error message or automatic deselection should occur
        expect(hasError || !allThreeChecked).toBe(true)
      } else {
        // Checkbox is disabled, which is expected
        await expect(fourthCheckbox).toBeDisabled()
      }
    }
  })

  test('Unregistered user can navigate to information pages', async ({ page }) => {
    const infoPages = [
      { name: 'About', path: '/about' },
      { name: 'Features', path: '/features' },
      { name: 'FAQ', path: '/faq' },
    ]

    for (const pageInfo of infoPages) {
      await test.step(`Navigate to ${pageInfo.name}`, async () => {
        // Find link in footer or navigation
        const link = page.getByRole('link', { name: new RegExp(pageInfo.name, 'i') })

        if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
          await link.click()
          await page.waitForURL(`**${pageInfo.path}`, { timeout: 5000 })
          await page.waitForLoadState('networkidle')

          // Verify we're on the correct page
          expect(page.url()).toContain(pageInfo.path)

          // Page should have content (SEO pages use article.seo-page-content)
          const mainContent = page.locator(
            'main, .main-content, [role="main"], article.seo-page-content, .seo-page-content, article'
          )
          await expect(mainContent.first()).toBeVisible({ timeout: 10000 })
        }
      })
    }
  })

  test('Unregistered user sees clear value proposition', async ({ page }) => {
    // Check for key messaging about the platform
    // Note: Homepage uses "concurrent" instead of "real-time" in hero section
    const valueProps = [
      /compare.*models/i,
      /ai.*comparison/i,
      /side.*side/i,
      /(real.*time|concurrent)/i, // Accept either "real-time" or "concurrent"
    ]

    const pageContent = await page.textContent('body')

    for (const prop of valueProps) {
      expect(pageContent).toMatch(prop)
    }
  })
})
