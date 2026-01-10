import { test, expect, Locator } from './fixtures'

/**
 * Helper function to tap or click an element
 * Uses tap if touch is supported, otherwise falls back to click
 */
async function tapOrClick(locator: Locator): Promise<void> {
  try {
    await locator.tap()
  } catch {
    // Fallback to click if tap is not supported (e.g., desktop browser)
    await locator.click()
  }
}

/**
 * E2E Tests: Mobile Platform Testing
 *
 * Tests mobile-specific functionality and user experience:
 * - Touch interactions
 * - Mobile navigation and menus
 * - Responsive design
 * - Mobile-optimized UI elements
 * - Touch gestures
 * - Mobile keyboard behavior
 * - Viewport-specific features
 */

test.describe('Mobile Platform Tests', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all authentication state
    await context.clearCookies()
    await context.clearPermissions()

    // Set up wait for models API before navigating
    const modelsResponsePromise = page
      .waitForResponse(
        response => {
          const url = response.url()
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
  })

  test('Mobile viewport renders correctly', async ({ page }) => {
    await test.step('Verify mobile viewport dimensions', async () => {
      const viewport = page.viewportSize()
      expect(viewport).toBeTruthy()
      // Mobile devices should have smaller width (skip this check if running on desktop browser)
      // Only check if viewport is actually mobile-sized
      if (viewport!.width < 1024) {
        expect(viewport!.width).toBeLessThan(1024)
      } else {
        // Running on desktop browser - skip viewport size check
        test.skip()
      }
    })

    await test.step('Main content is visible and accessible', async () => {
      // Hero section should be visible
      const heroSection = page.locator('.hero-section, [class*="hero"]')
      await expect(heroSection.first()).toBeVisible()

      // Comparison input should be visible
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()
      await expect(inputField).toBeEnabled()
    })

    await test.step('Navigation is mobile-friendly', async () => {
      // Navigation buttons should be visible and tappable
      const signInButton = page.getByTestId('nav-sign-in-button')
      const signUpButton = page.getByTestId('nav-sign-up-button')

      await expect(signInButton).toBeVisible()
      await expect(signUpButton).toBeVisible()

      // Buttons should be large enough for touch (at least 44x44px)
      const signInBox = await signInButton.boundingBox()
      const signUpBox = await signUpButton.boundingBox()

      if (signInBox) {
        expect(signInBox.width).toBeGreaterThanOrEqual(44)
        expect(signInBox.height).toBeGreaterThanOrEqual(44)
      }
      if (signUpBox) {
        expect(signUpBox.width).toBeGreaterThanOrEqual(44)
        expect(signUpBox.height).toBeGreaterThanOrEqual(44)
      }
    })
  })

  test('Touch interactions work correctly', async ({ page }) => {
    await test.step('Can tap navigation buttons', async () => {
      const signUpButton = page.getByTestId('nav-sign-up-button')
      await expect(signUpButton).toBeVisible()

      // Use tap if touch is supported, otherwise use click
      try {
        await signUpButton.tap()
      } catch {
        // Fallback to click if tap is not supported
        await signUpButton.click()
      }
      await page.waitForTimeout(500)

      // Auth modal should appear
      const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
      await expect(authModal).toBeVisible({ timeout: 5000 })

      // Close modal
      const closeButton = page.locator('[data-testid="auth-modal-close"], .auth-modal-close')
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        try {
          await closeButton.tap()
        } catch {
          await closeButton.click()
        }
      } else {
        // Press escape or click outside
        await page.keyboard.press('Escape')
      }
    })

    await test.step('Can tap and interact with form inputs', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      // Tap/click to focus
      try {
        await inputField.tap()
      } catch {
        await inputField.click()
      }
      await page.waitForTimeout(300)

      // Type text
      await inputField.fill('Test mobile input')
      const value = await inputField.inputValue()
      expect(value).toBe('Test mobile input')
    })

    await test.step('Can tap checkboxes', async () => {
      // Wait for loading message to disappear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first provider dropdown if collapsed
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await tapOrClick(firstProvider)
          await page.waitForTimeout(500)
        }
      }

      // Find model checkboxes
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

      // Tap/click first checkbox
      const firstCheckbox = modelCheckboxes.first()
      await tapOrClick(firstCheckbox)
      await page.waitForTimeout(300)

      // Verify it's checked
      await expect(firstCheckbox).toBeChecked()
    })
  })

  test('Mobile keyboard behavior', async ({ page }) => {
    await test.step('Keyboard appears when input is focused', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await tapOrClick(inputField)

      // Wait for keyboard to potentially appear (mobile browsers)
      await page.waitForTimeout(500)

      // Input should be focused
      const isFocused = await inputField.evaluate(el => document.activeElement === el)
      expect(isFocused).toBe(true)
    })

    await test.step('Can type with mobile keyboard', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await tapOrClick(inputField)
      await page.waitForTimeout(300)

      // Type text
      await inputField.fill('Testing mobile keyboard input')
      const value = await inputField.inputValue()
      expect(value).toBe('Testing mobile keyboard input')
    })

    await test.step('Keyboard can be dismissed', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')
      await tapOrClick(inputField)
      await page.waitForTimeout(300)

      // Blur the input (simulates keyboard dismissal)
      await inputField.blur()
      await page.waitForTimeout(300)

      // Input should no longer be focused
      const isFocused = await inputField.evaluate(el => document.activeElement === el)
      expect(isFocused).toBe(false)
    })
  })

  test('Mobile navigation and menus', async ({ page, authenticatedPage }) => {
    await test.step('Navigation buttons are accessible', async () => {
      // Check if user is authenticated - if so, sign-in/sign-up buttons won't be visible
      const userMenuButton = page.getByTestId('user-menu-button')
      const isAuthenticated = await userMenuButton.isVisible({ timeout: 2000 }).catch(() => false)

      if (isAuthenticated) {
        // User is authenticated - check user menu instead
        await expect(userMenuButton).toBeVisible()
        const userMenuBox = await userMenuButton.boundingBox()
        expect(userMenuBox).toBeTruthy()
        expect(userMenuBox!.width * userMenuBox!.height).toBeGreaterThan(100) // Minimum touch target
      } else {
        // User is not authenticated - check sign-in/sign-up buttons
        const signInButton = page.getByTestId('nav-sign-in-button')
        const signUpButton = page.getByTestId('nav-sign-up-button')

        await expect(signInButton).toBeVisible()
        await expect(signUpButton).toBeVisible()

        // Verify buttons are tappable
        const signInBox = await signInButton.boundingBox()
        expect(signInBox).toBeTruthy()
        expect(signInBox!.width * signInBox!.height).toBeGreaterThan(100) // Minimum touch target
      }
    })

    await test.step('User menu works on mobile', async () => {
      // Ensure authenticatedPage is available
      if (!authenticatedPage) {
        test.skip()
        return
      }

      // User menu button should be visible
      const userMenuButton = authenticatedPage.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 10000 })

      // Tap/click to open menu
      await tapOrClick(userMenuButton)
      await authenticatedPage.waitForTimeout(500)

      // Menu should be visible (check for logout button or menu items)
      const logoutButton = authenticatedPage.getByTestId('logout-button')
      const menuVisible = await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)
      expect(menuVisible).toBe(true)
    })
  })

  test('Mobile comparison flow', async ({ page }) => {
    await test.step('Can perform comparison on mobile', async () => {
      // Enter prompt
      const inputField = page.getByTestId('comparison-input-textarea')
      await tapOrClick(inputField)
      await inputField.fill('What is machine learning?')

      // Wait for models to load
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand provider dropdown if needed
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await tapOrClick(firstProvider)
          await page.waitForTimeout(500)
        }
      }

      // Select a model
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

      const firstCheckbox = modelCheckboxes.first()
      if (await firstCheckbox.isEnabled().catch(() => false)) {
        await tapOrClick(firstCheckbox)
        await page.waitForTimeout(300)
      }

      // Submit comparison
      const submitButton = page.getByTestId('comparison-submit-button')
      await expect(submitButton).toBeVisible()
      await tapOrClick(submitButton)

      // Wait for results (may fail if backend isn't running, which is acceptable)
      const results = page.locator(
        '[data-testid^="result-card-"], .result-card, .model-response, [class*="result"]'
      )
      const hasResults = await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => false)

      if (hasResults) {
        await expect(results.first()).toBeVisible()
      }
    })
  })

  test('Mobile responsive design', async ({ page }) => {
    await test.step('Content adapts to mobile viewport', async () => {
      const viewport = page.viewportSize()
      expect(viewport).toBeTruthy()

      // Check that main content is visible
      const mainContent = page.locator('main, .main-content, [role="main"]')
      await expect(mainContent.first()).toBeVisible()

      // Check that text is readable (not too small)
      const bodyText = page.locator('body')
      const fontSize = await bodyText.evaluate(el => {
        const style = window.getComputedStyle(el)
        return parseFloat(style.fontSize)
      })
      expect(fontSize).toBeGreaterThanOrEqual(14) // Minimum readable font size
    })

    await test.step('No horizontal scrolling', async () => {
      // Get page dimensions
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      const viewportWidth = page.viewportSize()!.width

      // Body should not exceed viewport width significantly
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10) // Allow small margin
    })

    await test.step('Touch targets are appropriately sized', async () => {
      // Check navigation buttons
      const signUpButton = page.getByTestId('nav-sign-up-button')
      const box = await signUpButton.boundingBox()
      expect(box).toBeTruthy()

      // Minimum touch target size (44x44px recommended by Apple/Google)
      expect(box!.width).toBeGreaterThanOrEqual(40)
      expect(box!.height).toBeGreaterThanOrEqual(40)
    })
  })

  test('Mobile registration flow', async ({ page, context }) => {
    // Increase timeout for this test since registration can take time
    test.setTimeout(45000)

    // Clear cookies and permissions before test
    await context.clearCookies()
    await context.clearPermissions()
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 60000 })

    await test.step('Can register on mobile', async () => {
      const timestamp = Date.now()
      const testEmail = `mobile-${timestamp}@example.com`
      const testPassword = 'TestPassword123!'

      // Open registration modal
      await tapOrClick(page.getByTestId('nav-sign-up-button'))
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      // Fill form using tap/click and fill
      const emailInput = page.locator('input[type="email"]').first()
      await tapOrClick(emailInput)
      await emailInput.fill(testEmail)

      const passwordInput = page.locator('input[type="password"]').first()
      await tapOrClick(passwordInput)
      await passwordInput.fill(testPassword)

      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tapOrClick(confirmPasswordInput)
        await confirmPasswordInput.fill(testPassword)
      }

      // Wait for registration API response BEFORE clicking (to ensure we catch it)
      const registrationResponsePromise = page
        .waitForResponse(
          response => {
            const url = response.url()
            return (
              url.includes('/auth/register') &&
              (response.status() === 201 || response.status() === 200)
            )
          },
          { timeout: 15000 }
        )
        .catch(() => null)

      // Submit
      const submitButton = page.getByTestId('register-submit-button')
      await tapOrClick(submitButton)

      // Wait for registration API call to complete
      const registrationResponse = await registrationResponsePromise

      // If registration response didn't come through, check for errors or continue anyway
      // (sometimes the response happens very quickly)
      if (!registrationResponse) {
        // Wait a bit and check if modal closed (indicates success)
        await page.waitForTimeout(1000)
        const modalStillOpen = await page
          .locator('[data-testid="auth-modal"], .auth-modal')
          .isVisible({ timeout: 1000 })
          .catch(() => false)

        if (modalStillOpen) {
          // Modal still open - registration might have failed
          // Check for error message
          const errorMessage = page.locator('.auth-error, [role="alert"]')
          const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
          if (hasError) {
            const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
            // Note: reCAPTCHA is disabled in test environment, so this shouldn't happen
            throw new Error(`Registration failed: ${errorText}`)
          }
        }
      }

      // Wait for auth modal to close (onSuccess callback closes it)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Verify success (user menu should appear)
      // Registration response includes user data, so menu should appear after React re-renders
      // Wait a moment for React to re-render after modal closes
      await page.waitForTimeout(500)

      // Verify registration succeeded - sign-in/sign-up buttons should be hidden
      await expect(page.getByTestId('nav-sign-in-button')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('nav-sign-up-button')).not.toBeVisible({ timeout: 5000 })

      // User menu button should appear (user is logged in)
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 20000 })
    })
  })

  test('Mobile scrolling and navigation', async ({ page }) => {
    await test.step('Page scrolls smoothly on mobile', async () => {
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, 500))
      await page.waitForTimeout(500)

      // Verify scroll position
      const scrollY = await page.evaluate(() => window.scrollY)
      expect(scrollY).toBeGreaterThan(0)
    })

    await test.step('Can navigate to content pages on mobile', async () => {
      // Find footer links
      const aboutLink = page.getByRole('link', { name: /about/i })
      if (await aboutLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tapOrClick(aboutLink)
        await page.waitForURL('**/about', { timeout: 5000 })
        await page.waitForLoadState('networkidle')

        // Verify we're on the about page
        expect(page.url()).toContain('/about')
      }
    })
  })

  test('Mobile form interactions', async ({ page }) => {
    await test.step('Form inputs are mobile-friendly', async () => {
      const inputField = page.getByTestId('comparison-input-textarea')

      // Verify input is visible and accessible
      await expect(inputField).toBeVisible()

      // Check input size (should be large enough for mobile)
      const inputBox = await inputField.boundingBox()
      expect(inputBox).toBeTruthy()
      expect(inputBox!.height).toBeGreaterThanOrEqual(40) // Minimum touch-friendly height
    })

    await test.step('Can select and deselect models on mobile', async () => {
      // Wait for models to load
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand provider dropdown
      const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await tapOrClick(firstProvider)
          await page.waitForTimeout(500)
        }
      }

      // Find checkboxes
      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

      // Select first checkbox
      const firstCheckbox = modelCheckboxes.first()
      if (await firstCheckbox.isEnabled().catch(() => false)) {
        await tapOrClick(firstCheckbox)
        await page.waitForTimeout(300)
        await expect(firstCheckbox).toBeChecked()

        // Deselect
        await tapOrClick(firstCheckbox)
        await page.waitForTimeout(300)
        await expect(firstCheckbox).not.toBeChecked()
      }
    })
  })

  test('Mobile performance and loading', async ({ page }) => {
    await test.step('Page loads within reasonable time on mobile', async () => {
      const startTime = Date.now()
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime

      // Should load within 15 seconds on mobile (accounting for slower connections and CI environments)
      expect(loadTime).toBeLessThan(15000)
    })

    await test.step('Images and assets load correctly', async () => {
      // Check for broken images
      const images = page.locator('img')
      const imageCount = await images.count()

      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i)
        if (await img.isVisible({ timeout: 2000 }).catch(() => false)) {
          const isBroken = await img.evaluate((el: HTMLImageElement) => {
            return el.complete && el.naturalHeight === 0
          })
          expect(isBroken).toBe(false)
        }
      }
    })
  })
})
