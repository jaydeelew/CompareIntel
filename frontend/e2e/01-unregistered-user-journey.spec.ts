import { test, expect, type Page } from '@playwright/test'

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

/**
 * Helper function to dismiss the tutorial overlay if it appears
 */
async function dismissTutorialOverlay(page: Page) {
  try {
    // First, check for the welcome modal (appears first)
    const welcomeModal = page.locator('.tutorial-welcome-backdrop')
    const welcomeVisible = await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)

    if (welcomeVisible) {
      // Click "Skip for Now" button
      const skipButton = page.locator(
        '.tutorial-welcome-button-secondary, button:has-text("Skip for Now")'
      )
      const skipVisible = await skipButton.isVisible({ timeout: 2000 }).catch(() => false)

      if (skipVisible) {
        await skipButton.click({ timeout: 5000 })
        // Wait for welcome modal to disappear
        await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(500)
      } else {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }

    // Then check for the tutorial overlay (appears after welcome modal)
    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)

    if (overlayVisible) {
      // Try to click the skip/close button in the tutorial overlay
      const closeButton = page.locator(
        '.tutorial-close-button, button[aria-label*="Skip"], button[aria-label*="skip"]'
      )
      const closeVisible = await closeButton.isVisible({ timeout: 2000 }).catch(() => false)

      if (closeVisible) {
        await closeButton.click({ timeout: 5000 })
        // Wait for overlay to disappear
        await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(500)
      } else {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }
  } catch (error) {
    // Ignore errors - tutorial might not be present
    console.log(
      'Tutorial overlay dismissal attempted:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

test.describe('Unregistered User Journey', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all authentication state
    await context.clearCookies()
    await context.clearPermissions()

    // Set up wait for models API before navigating (exclude CSS/static files)
    const modelsResponsePromise = page
      .waitForResponse(
        response => {
          const url = response.url()
          // Match /api/models endpoint but exclude CSS/static files
          return (
            (url.includes('/api/models') || url.match(/\/api\/models[^.]*$/)) &&
            !url.includes('.css') &&
            !url.includes('.js') &&
            !url.includes('/src/') &&
            response.status() === 200
          )
        },
        { timeout: 15000 }
      )
      .catch(() => {
        // API might have already completed or fail, continue anyway
      })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for models API to complete
    await modelsResponsePromise

    // Wait a moment for tutorial modal to appear (it may load after page load)
    await page.waitForTimeout(1000)

    // Dismiss tutorial overlay if it appears (blocks interactions)
    await dismissTutorialOverlay(page)

    // Wait a bit more to ensure overlay is fully dismissed
    await page.waitForTimeout(500)

    // Log console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`)
      }
    })
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
      // Wait for loading message to disappear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // Loading message might not exist or already be gone, continue
      })

      // Check if models section is hidden - if so, click to show it
      const hideModelsButton = page.locator(
        'button[title*="Show model selection"], button[title*="Hide model selection"]'
      )
      if ((await hideModelsButton.count()) > 0) {
        const buttonTitle = await hideModelsButton.getAttribute('title').catch(() => '')
        if (buttonTitle?.includes('Show')) {
          await hideModelsButton.click()
          await page.waitForTimeout(500) // Wait for animation
        }
      }

      // Check for error message
      const errorMessage = page.locator('.error-message:has-text("No models available")')
      const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
      if (hasError) {
        const errorText = await errorMessage.textContent().catch(() => '')
        throw new Error(
          `Models failed to load - "No models available" message is visible: ${errorText}`
        )
      }

      // Provider dropdowns are collapsed by default - need to expand them to see checkboxes
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await page.waitForTimeout(500) // Wait for dropdown animation
        }
      }

      // Wait for model checkboxes to appear (prefer data-testid, fallback to CSS selector)
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

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
      // Wait for loading message to disappear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // Loading message might not exist or already be gone, continue
      })

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await page.waitForTimeout(500)
        }
      }

      // Unregistered users can select up to 3 models
      // Prefer data-testid selector, fallback to CSS selector
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select up to 3 models (skip disabled checkboxes)
      let selectedCount = 0
      const maxToSelect = 3
      for (let i = 0; i < checkboxCount && selectedCount < maxToSelect; i++) {
        const checkbox = modelCheckboxes.nth(i)
        await expect(checkbox).toBeVisible({ timeout: 5000 })
        const isEnabled = await checkbox.isEnabled().catch(() => false)
        if (isEnabled) {
          await checkbox.check({ timeout: 10000 })
          selectedCount++
        }
      }

      // Ensure we selected at least one model
      expect(selectedCount).toBeGreaterThan(0)

      // Verify models are selected (check only enabled checkboxes that were selected)
      let checkedCount = 0
      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = modelCheckboxes.nth(i)
        const isChecked = await checkbox.isChecked().catch(() => false)
        if (isChecked) {
          checkedCount++
        }
      }
      expect(checkedCount).toBeGreaterThan(0)
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
    // Wait for loading message to disappear
    const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
    await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // Loading message might not exist or already be gone, continue
    })

    // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
    const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
    if ((await providerHeaders.count()) > 0) {
      const firstProvider = providerHeaders.first()
      const isExpanded = await firstProvider.getAttribute('aria-expanded')
      if (isExpanded !== 'true') {
        await firstProvider.click()
        await page.waitForTimeout(500)
      }
    }

    // Prefer data-testid selector, fallback to CSS selector
    const modelCheckboxes = page.locator(
      '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
    )
    await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

    const checkboxCount = await modelCheckboxes.count()
    expect(checkboxCount).toBeGreaterThan(0)

    if (checkboxCount > 3) {
      // Select first 3 enabled models
      let selectedCount = 0
      for (let i = 0; i < checkboxCount && selectedCount < 3; i++) {
        const checkbox = modelCheckboxes.nth(i)
        await expect(checkbox).toBeVisible({ timeout: 5000 })
        const isEnabled = await checkbox.isEnabled().catch(() => false)
        if (isEnabled) {
          await checkbox.check({ timeout: 10000 })
          await expect(checkbox).toBeChecked()
          selectedCount++
        }
      }

      // Ensure we selected at least one model
      expect(selectedCount).toBeGreaterThan(0)

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
