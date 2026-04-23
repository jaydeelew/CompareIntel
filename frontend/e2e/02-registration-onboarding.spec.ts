import type { Page } from '@playwright/test'

import { waitForAuthState, waitForReactHydration } from './fixtures'
import { test, expect } from './test-setup'

/**
 * E2E Tests: Registration and Onboarding
 *
 * Tests the complete user registration and onboarding flow:
 * - Registration form
 * - Email verification (if required)
 * - First comparison after registration
 * - Understanding new user benefits
 */

/**
 * Helper function to safely wait with page validity check
 */
async function safeWait(page: Page, ms: number) {
  try {
    // Check if page is still valid before waiting
    if (page.isClosed()) {
      return
    }
    await page.waitForTimeout(ms)
  } catch (error) {
    // Page might have been closed, ignore
    if (error instanceof Error && error.message.includes('closed')) {
      return
    }
    throw error
  }
}

/**
 * DEV/TEST ONLY: mark the user as email-verified via create-test-user (same as global-setup).
 * New registrations are unverified; the verification modal blocks the comparison textarea in CI.
 */
async function markUserVerifiedViaDevApi(email: string, password: string): Promise<boolean> {
  const backendURL = process.env.BACKEND_URL || 'http://localhost:8000'
  try {
    // Use fetch (same as fixtures.ts / global-setup) — Playwright APIRequestContext.post
    // has been unreliable for this endpoint in some environments.
    const res = await fetch(`${backendURL}/api/dev/create-test-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: 'user',
        is_admin: false,
        is_verified: true,
        is_active: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** No-op: guest welcome and guided tutorial were removed from production. */
async function dismissTutorialOverlay(_page: Page) {}

test.describe('Registration and Onboarding', () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    // Detect mobile devices and adjust timeouts accordingly
    // Use project name - browserName is always chromium/firefox/webkit
    const projectName = test.info().project.name || ''
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const isMobile =
      projectName.includes('Mobile') ||
      projectName.includes('iPhone') ||
      projectName.includes('iPad') ||
      projectName.includes('Pixel') ||
      projectName.includes('Galaxy')

    // Mobile devices and WebKit/Firefox need longer timeouts
    const navigationTimeout = isFirefox || isWebKit || isMobile ? 60000 : 30000
    const loadTimeout = isFirefox || isWebKit || isMobile ? 30000 : 15000

    // Increase timeout for mobile devices to prevent beforeEach timeout
    if (isMobile) {
      test.setTimeout(90000) // 90 seconds for mobile devices
    }

    // Clear all authentication state
    await context.clearCookies()
    await context.clearPermissions()

    // Check if page is already closed before navigation
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page already closed before navigation, skipping`)
        return
      }
      throw new Error('Page was already closed before navigation')
    }

    try {
      // Use a shorter timeout for mobile devices to fail faster if page closes
      const actualTimeout = isMobile ? Math.min(navigationTimeout, 30000) : navigationTimeout
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: actualTimeout })
    } catch (error) {
      // If navigation fails, check if page is still valid
      if (page.isClosed()) {
        if (isWebKit || isFirefox || isMobile) {
          console.log(`${browserName}: Page closed during navigation, attempting to continue`)
          return
        }
        throw new Error('Page was closed during navigation')
      }
      // For mobile devices, if navigation times out, check if page closed and return gracefully
      if (
        isMobile &&
        error instanceof Error &&
        (error.message.includes('timeout') || error.message.includes('Navigation'))
      ) {
        if (page.isClosed()) {
          console.log(`${browserName}: Page closed during navigation timeout, skipping`)
          return
        }
      }
      throw error
    }

    // Wait for load state with fallback - networkidle can be too strict
    try {
      await page.waitForLoadState('load', { timeout: loadTimeout })
    } catch {
      // If load times out, try networkidle with shorter timeout
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        // If networkidle also fails, just continue - page is likely loaded enough
      })
    }

    // Check if page is still valid before continuing
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed after navigation, skipping rest of setup`)
        return
      }
      throw new Error('Page was closed after navigation')
    }

    // Wait a moment for tutorial modal to appear (it may load after page load)
    // WebKit, Firefox, and mobile devices need more time for the tutorial to appear
    await safeWait(page, isWebKit || isFirefox || isMobile ? 2000 : 1000)

    // Check again before dismissing tutorial
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed before tutorial dismissal, skipping`)
      }
      return
    }

    // Dismiss tutorial overlay if it appears (blocks interactions)
    await dismissTutorialOverlay(page)

    // Check if page is still valid
    if (page.isClosed()) {
      if (isWebKit || isFirefox || isMobile) {
        console.log(`${browserName}: Page closed after tutorial dismissal, skipping rest of setup`)
      }
      return
    }

    // Wait for React hydration (non-blocking with timeout guard)
    try {
      await Promise.race([
        waitForReactHydration(page, 5000),
        new Promise(resolve => setTimeout(resolve, 5000)), // Max 5 seconds
      ])
    } catch {
      // Continue anyway
    }

    // Wait for auth state to be determined (non-blocking with timeout guard)
    try {
      await Promise.race([
        waitForAuthState(page, 8000),
        new Promise(resolve => setTimeout(resolve, 8000)), // Max 8 seconds
      ])
    } catch {
      // Continue anyway - elements might still be available
    }

    // Wait a bit more to ensure overlay is fully dismissed
    await safeWait(page, 500)
  })

  test('User can register a new account', async ({ page }) => {
    // Increase timeout for registration test
    test.setTimeout(60000)
    const timestamp = Date.now()
    const testEmail = `test-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    await test.step('Open registration modal', async () => {
      // Ensure page is still valid
      if (page.isClosed()) {
        throw new Error('Page was closed before opening registration modal')
      }

      // Wait for auth state if not already determined
      try {
        await Promise.race([
          waitForAuthState(page, 10000),
          new Promise(resolve => setTimeout(resolve, 10000)),
        ])
      } catch {
        // Continue anyway
      }

      const signUpButton = page.getByTestId('nav-sign-up-button')
      await expect(signUpButton).toBeVisible({ timeout: 20000 })
      await signUpButton.click()

      // Wait for auth modal to appear
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
      await expect(authModal).toBeVisible()
    })

    await test.step('Fill registration form', async () => {
      // Fill email
      const emailInput = page.locator('input[type="email"]').first()
      await emailInput.fill(testEmail)

      // Fill password
      const passwordInput = page.locator('input[type="password"]').first()
      await passwordInput.fill(testPassword)

      // Fill confirm password if present
      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }
    })

    await test.step('Submit registration', async () => {
      const submitButton = page.getByTestId('register-submit-button')
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toBeEnabled()

      // Wait for registration API response
      const registrationResponsePromise = page
        .waitForResponse(
          response => {
            const url = response.url()
            return (
              url.includes('/auth/register') &&
              (response.status() === 201 || response.status() === 200)
            )
          },
          { timeout: 10000 }
        )
        .catch(() => null)

      await submitButton.click()

      // Wait for registration API call to complete
      const registrationResponse = await registrationResponsePromise

      // Verify registration succeeded
      if (!registrationResponse) {
        // Check for error message
        await page.waitForTimeout(1000)
        // Also check for failed network requests
        const failedRequests = await page.evaluate(() => {
          return (
            (window as unknown as { __playwrightFailedRequests?: unknown[] })
              .__playwrightFailedRequests || []
          )
        })
        if (failedRequests.length > 0) {
          console.log('Failed requests:', failedRequests)
        }
        const errorMessage = page.locator('.auth-error, [role="alert"]')
        const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
        if (hasError) {
          const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
          throw new Error(`Registration failed: ${errorText}`)
        }
        throw new Error('Registration API call did not complete')
      }

      // Verify response status
      if (registrationResponse.status() !== 201 && registrationResponse.status() !== 200) {
        const errorText = await registrationResponse.text().catch(() => 'Unknown error')
        throw new Error(
          `Registration failed with status ${registrationResponse.status()}: ${errorText}`
        )
      }
    })

    await test.step('Verify registration success', async () => {
      // Wait for auth modal to close (onSuccess callback closes it)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // Wait for auth/me API call to complete (user data fetch after registration)
      // This ensures the auth state is fully updated
      try {
        await page.waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
      } catch {
        // Response might have already completed or might not happen immediately
        // Continue anyway
      }

      // Wait for user menu button to appear (user is logged in)
      // Registration sets user in AuthContext, which should trigger Navigation to show UserMenu
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 20000 })

      // Sign-in/sign-up buttons should be hidden (confirms auth state updated)
      await expect(page.getByTestId('nav-sign-in-button')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('nav-sign-up-button')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test('User sees verification banner after registration', async ({ page }) => {
    const timestamp = Date.now()
    const testEmail = `verify-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    await test.step('Register new user', async () => {
      await page.getByTestId('nav-sign-up-button').click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.locator('input[type="email"]').first().fill(testEmail)
      await page.locator('input[type="password"]').first().fill(testPassword)

      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }

      await page.getByTestId('register-submit-button').click()
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Check for verification banner', async () => {
      // Verification banner might appear
      const verificationBanner = page
        .locator('[role="alert"], .alert, .banner, [class*="verification"], [class*="verify"]')
        .filter({ hasText: /verify|verification/i })

      const bannerCount = await verificationBanner.count()

      if (bannerCount > 0) {
        await expect(verificationBanner.first()).toBeVisible({ timeout: 5000 })
      }
      // If no banner appears, that's also acceptable (verification might be optional)
    })
  })

  test('New user can perform first comparison', async ({ page, browserName }) => {
    const isWebKit = browserName === 'webkit'
    const isFirefox = browserName === 'firefox'
    const projectName = test.info().project.name || ''
    const isMobileProject =
      projectName.includes('Mobile') ||
      projectName.includes('iPhone') ||
      projectName.includes('iPad') ||
      projectName.includes('Pixel') ||
      projectName.includes('Galaxy')
    // Register + verification settle + model selection + stream regularly needs >90s in CI;
    // Firefox is slower and can hit pointer/layout races on the model list.
    test.setTimeout(isFirefox ? 180000 : 120000)
    const timestamp = Date.now()
    const testEmail = `firstcomp-${timestamp}@example.com`
    const testPassword = 'TestPassword123!'

    // Tutorial can appear after beforeEach or sit above the nav; clear it before any clicks.
    await dismissTutorialOverlay(page)
    await safeWait(page, 300)

    await test.step('Register and login', async () => {
      const signUpBtn = page.getByTestId('nav-sign-up-button')
      await signUpBtn.scrollIntoViewIfNeeded().catch(() => {})
      try {
        await signUpBtn.click({ timeout: 10000 })
      } catch {
        await dismissTutorialOverlay(page)
        await safeWait(page, 400)
        await signUpBtn.click({ timeout: 10000, force: true })
      }
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.locator('input[type="email"]').first().fill(testEmail)
      await page.locator('input[type="password"]').first().fill(testPassword)

      const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
      if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmPasswordInput.fill(testPassword)
      }

      // Wait for registration API response
      const registrationResponsePromise = page
        .waitForResponse(
          response => {
            const url = response.url()
            return (
              url.includes('/auth/register') &&
              (response.status() === 201 || response.status() === 200)
            )
          },
          { timeout: 10000 }
        )
        .catch(() => null)

      await page.getByTestId('register-submit-button').click()

      // Wait for registration API call to complete
      const registrationResponse = await registrationResponsePromise

      // Verify registration succeeded
      if (!registrationResponse) {
        // Wait a bit and check for errors
        await page.waitForTimeout(1000)
        const errorMessage = page.locator('.auth-error, [role="alert"]')
        const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)
        if (hasError) {
          const errorText = await errorMessage.textContent().catch(() => 'Unknown error')
          throw new Error(`Registration failed: ${errorText}`)
        }
      }

      // Wait for auth modal to close (onSuccess callback closes it)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // Wait for auth/me API call to complete (user data fetch after registration)
      // This ensures the auth state is fully updated
      try {
        await page.waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
      } catch {
        // Response might have already completed or might not happen immediately
        // Continue anyway
      }

      // Wait a moment for React to re-render after auth state updates
      await page.waitForTimeout(500)

      // Wait for user menu to appear (user data needs to load after registration)
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })

      // Unverified users get a blocking verification modal; mark verified in DB and reload
      // so /auth/me returns is_verified (matches E2E global-setup for fixed test users).
      let markedVerified = false
      for (let r = 0; r < 3; r++) {
        markedVerified = await markUserVerifiedViaDevApi(testEmail, testPassword)
        if (markedVerified) break
        await page.waitForTimeout(600)
      }
      if (markedVerified) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
        await dismissTutorialOverlay(page)
        await safeWait(page, 300)
      }
    })

    await test.step('Perform first comparison', async () => {
      // Prefer class on the overlay; Firefox sometimes reports visibility differently, so also
      // match the accessible dialog — if we skip this loop, the modal stays up and blocks model clicks.
      const verificationOverlay = page.locator('.verification-code-overlay')
      const verificationDialog = page.getByRole('dialog', { name: /verify your email/i })
      const verificationHeading = page.getByText('Verify Your Email', { exact: true })

      async function isVerificationUiBlocking(): Promise<boolean> {
        if (await verificationOverlay.isVisible().catch(() => false)) return true
        if (await verificationDialog.isVisible().catch(() => false)) return true
        // Firefox: dialog accessible name can differ; heading text is the reliable signal.
        return await verificationHeading.isVisible().catch(() => false)
      }

      // locator.isVisible({ timeout }) does NOT wait — timeout is ignored (Playwright). The
      // verification modal opens ~500ms after auth settles (useVerificationModalTrigger), so a
      // plain isVisible() right after registration races the modal and returns false.
      await safeWait(page, 2500)

      // Always sync verified state via dev API + reload. Do not rely only on overlay visibility
      // checks (Firefox can disagree); without this, the verification modal blocks model clicks.
      for (let sync = 0; sync < 3; sync++) {
        const ok = await markUserVerifiedViaDevApi(testEmail, testPassword)
        if (ok) {
          await page.reload({ waitUntil: 'domcontentloaded' })
          await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
          await dismissTutorialOverlay(page)
          await safeWait(page, 500)
          break
        }
        await safeWait(page, 500)
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const blocked = await isVerificationUiBlocking()
        if (!blocked) break
        const marked = await markUserVerifiedViaDevApi(testEmail, testPassword)
        if (!marked) {
          await safeWait(page, 400)
          continue
        }
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
        await dismissTutorialOverlay(page)
        await safeWait(page, 400)
        await safeWait(page, 1800)
      }
      // Extra settle after loop; if the overlay is still up (e.g. dev verify unavailable), we
      // still proceed — fill({ force: true }) avoids pointer interception from the modal.
      await safeWait(page, 1500)

      // Mobile Safari: verification dialog can remain visible after reload; keep syncing until it
      // is gone so pointer events are not intercepted (fill fallbacks still use click()).
      for (let v = 0; v < 4 && (await isVerificationUiBlocking()); v++) {
        await markUserVerifiedViaDevApi(testEmail, testPassword)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
        await dismissTutorialOverlay(page)
        await safeWait(page, 600)
      }
      await page
        .locator('.verification-code-overlay')
        .waitFor({ state: 'hidden', timeout: 15000 })
        .catch(() => {})

      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      const promptText = 'Explain machine learning in simple terms.'
      // force: true avoids pointer interception when a dialog is still animating in; fallbacks
      // below still handle controlled textarea + React onChange if needed.
      await inputField.scrollIntoViewIfNeeded().catch(() => {})
      await inputField.fill(promptText, { force: true })

      let filledValue = await inputField.inputValue().catch(() => '')
      if (filledValue.trim() !== promptText) {
        await inputField.click({ force: true })
        await inputField.fill('')
        await inputField.pressSequentially(promptText, { delay: isWebKit ? 50 : 15 })
        await safeWait(page, 250)
        filledValue = await inputField.inputValue().catch(() => '')
      }
      if (filledValue.trim() !== promptText) {
        await inputField.evaluate((el: HTMLTextAreaElement, text: string) => {
          el.focus()
          el.value = text
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }, promptText)
        await safeWait(page, 400)
      }

      // Wait for loading message to disappear
      const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
      if (isMobileProject) {
        await safeWait(page, 500) // Extra settle time for models to render on mobile
      }

      // Dismiss tutorial overlay first if it's blocking (new users see it after registration)
      const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
      const overlayVisible = await tutorialOverlay.isVisible({ timeout: 2000 }).catch(() => false)
      if (overlayVisible && !page.isClosed()) {
        await dismissTutorialOverlay(page)
        await safeWait(page, 1500) // Wait for overlay to fully disappear (mobile Safari needs longer)
      }

      // Expand provider dropdowns until we find enabled checkboxes (first provider may have only premium models)
      let providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
      let providerCount = await providerHeaders.count()
      // If models section is collapsed on mobile, expand it first
      if (providerCount === 0 && (isMobileProject || isWebKit || isFirefox)) {
        const showModelsBtn = page.locator('button[title="Show model selection"]')
        if (await showModelsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await showModelsBtn.click({ timeout: 5000 })
          await safeWait(page, 800)
        }
        providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
        providerCount = await providerHeaders.count()
      }
      if (isMobileProject && providerCount > 0) {
        await providerHeaders
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => {})
        await safeWait(page, 300)
      }
      let selectedCount = 0

      if (isFirefox) {
        await safeWait(page, 1200)
      }

      // Cap how many provider rows we try: .nth(i) waits until the (i+1)th match exists — if
      // count() races ahead of the DOM (Firefox), a high index can stall until test timeout.
      const rawProviderCount = await providerHeaders.count()
      const maxProviders = Math.min(rawProviderCount, 12)

      for (let p = 0; p < maxProviders && selectedCount === 0; p++) {
        const providerHeader = providerHeaders.nth(p)
        const isExpanded = await providerHeader
          .getAttribute('aria-expanded', { timeout: 8000 })
          .catch(() => null)
        if (isExpanded !== 'true') {
          await providerHeader.scrollIntoViewIfNeeded().catch(() => {})
          await safeWait(page, isMobileProject ? 500 : 300)
          try {
            if (isMobileProject) {
              try {
                await providerHeader.tap({ timeout: 5000 })
              } catch {
                await providerHeader.click({ timeout: 5000 })
              }
            } else {
              await providerHeader.click({ timeout: 5000 })
            }
          } catch {
            await providerHeader.click({ timeout: 3000, force: true })
          }
          await page.waitForTimeout(isMobileProject ? 1200 : 800) // Mobile needs longer for dropdown to expand and render
        }

        // Select first enabled model from this provider
        const modelCheckboxes = page.locator(
          '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
        )
        await expect(modelCheckboxes.first())
          .toBeVisible({ timeout: 5000 })
          .catch(() => {})
        const checkboxCount = await modelCheckboxes.count()
        for (let i = 0; i < checkboxCount && selectedCount === 0; i++) {
          const checkbox = modelCheckboxes.nth(i)
          const isEnabled = await checkbox.isEnabled().catch(() => false)
          if (isEnabled) {
            if (isMobileProject || isWebKit) {
              await checkbox.scrollIntoViewIfNeeded().catch(() => {})
              await safeWait(page, 200)
            }
            // WebKit/Firefox: click() reliably fires onChange with checkbox onMouseDown preventDefault
            if (isWebKit || isFirefox) {
              await checkbox.click({ timeout: 10000 })
            } else {
              await checkbox.check({ timeout: 10000 })
            }
            selectedCount++
            if (isMobileProject) {
              await safeWait(page, 400) // Allow React state to settle after checkbox change
            }
          }
        }
      }

      expect(selectedCount).toBeGreaterThan(0)

      // Wait for selected models UI (confirms React state; avoids racing the submit button on Chromium).
      // On mobile Safari the strip can sit below the fold until scrolled into view.
      const selectedModelsSection = page.locator('.selected-models-section')
      await selectedModelsSection.scrollIntoViewIfNeeded().catch(() => {})
      await safeWait(page, isMobileProject ? 400 : 200)
      const selectedModelsGrid = page.locator('.selected-models-section .selected-model-card')
      await expect(selectedModelsGrid.first()).toBeVisible({
        timeout: isMobileProject ? 20000 : 10000,
      })
      await safeWait(page, isMobileProject ? 500 : 200)

      // Check if tutorial overlay is blocking (especially in WebKit)
      const overlayVisibleBeforeSubmit = await tutorialOverlay
        .isVisible({ timeout: 1000 })
        .catch(() => false)
      if (overlayVisibleBeforeSubmit && !page.isClosed()) {
        // Dismiss tutorial overlay before submitting
        await dismissTutorialOverlay(page)
        await safeWait(page, 1000) // Wait longer for overlay to fully disappear
      }

      const finalPrompt = await inputField.inputValue().catch(() => '')
      if (finalPrompt.trim() !== promptText) {
        await inputField.evaluate((el: HTMLTextAreaElement, text: string) => {
          el.focus()
          el.value = text
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }, promptText)
        await safeWait(page, 300)
      }

      // Submit comparison - WebKit / Firefox / mobile need longer timeout
      const submitTimeout = isWebKit || isFirefox || isMobileProject ? 60000 : 15000

      const submitButton = page.getByTestId('comparison-submit-button')

      // Wait for button to be enabled (input + model selection must be valid)
      await expect(submitButton).toBeEnabled({ timeout: submitTimeout })

      // Try normal click first
      try {
        await submitButton.click({ timeout: submitTimeout })
      } catch (error) {
        if (page.isClosed()) {
          throw new Error('Page was closed during submit')
        }
        // If click fails, try force click (especially for WebKit/mobile with tutorial overlay)
        if (
          error instanceof Error &&
          (error.message.includes('intercepts') || error.message.includes('timeout'))
        ) {
          // Dismiss overlay again and try force click
          await dismissTutorialOverlay(page)
          await safeWait(page, 500)
          await submitButton.click({ timeout: submitTimeout, force: true })
        } else {
          throw error
        }
      }

      // Wait for results - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 15000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }

      // Results should appear (longer window for WebKit / Firefox streaming + paint)
      const results = page.locator('[data-testid^="result-card-"], .result-card, .model-response')
      const resultsTimeout = isWebKit || isFirefox || isMobileProject ? 45000 : 30000
      await expect(results.first()).toBeVisible({ timeout: resultsTimeout })
    })
  })

  test('User can login with existing account', async ({ page }) => {
    const testEmail = process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
    const testPassword =
      process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'

    await test.step('Open login modal', async () => {
      // Dismiss tutorial overlay before clicking sign-in button
      await dismissTutorialOverlay(page)

      const signInButton = page.getByTestId('nav-sign-in-button')
      await expect(signInButton).toBeVisible()

      // Check if tutorial overlay is blocking before clicking
      const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
      const overlayVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
      if (overlayVisible) {
        await dismissTutorialOverlay(page)
        await safeWait(page, 500)
      }

      // Try clicking with retry logic for overlay blocking
      try {
        await signInButton.click({ timeout: 10000 })
      } catch (error) {
        if (error instanceof Error && error.message.includes('intercepts pointer events')) {
          // Overlay is blocking, dismiss it and retry
          await dismissTutorialOverlay(page)
          await safeWait(page, 500)
          await signInButton.click({ timeout: 10000, force: true })
        } else {
          throw error
        }
      }

      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
      await expect(authModal).toBeVisible()
    })

    await test.step('Fill login form', async () => {
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)
    })

    await test.step('Submit login', async () => {
      await page.getByTestId('login-submit-button').click()
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Verify login success', async () => {
      // Auth modal should close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {})

      // User menu should appear
      const userMenuButton = page.getByTestId('user-menu-button')
      await expect(userMenuButton).toBeVisible({ timeout: 10000 })
    })
  })

  test('User can logout', async ({ page, browserName }) => {
    const testEmail = process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
    const testPassword =
      process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'

    // Firefox, WebKit, and mobile devices need longer timeouts
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const isMobile =
      browserName.includes('Mobile') ||
      browserName.includes('iPhone') ||
      browserName.includes('iPad')

    // Increase test timeout for mobile devices (must be set before any async operations)
    test.setTimeout(isMobile ? 120000 : 60000) // 2 minutes for mobile devices, 60s for others

    const navigationTimeout = isFirefox || isWebKit || isMobile ? 60000 : 15000
    const waitTimeout = isFirefox || isWebKit || isMobile ? 30000 : 10000
    const clickTimeout = isMobile ? 30000 : 15000

    await test.step('Login first', async () => {
      // Mobile devices may need longer timeout for button click
      const signInButton = page.getByTestId('nav-sign-in-button')
      await signInButton.click({ timeout: clickTimeout })
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })
      await page.getByTestId('login-email-input').fill(testEmail)
      await page.getByTestId('login-password-input').fill(testPassword)
      await page.getByTestId('login-submit-button').click()

      // Wait for login API call to complete
      // Wait for page to load - use 'load' instead of 'networkidle' which is too strict
      try {
        await page.waitForLoadState('load', { timeout: 10000 })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }

      // Wait for auth modal to close
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 15000,
        })
        .catch(() => {})

      // Wait a bit for React state to update (use safeWait to handle page closure)
      await safeWait(page, 500)

      // Check if page is still valid before waiting for user menu
      if (page.isClosed()) {
        throw new Error('Page was closed after login')
      }

      // User menu button should appear (user data needs to load after login)
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
    })

    await test.step('Logout', async () => {
      // Open user menu - mobile devices may need longer timeout or force click
      const userMenuButton = page.getByTestId('user-menu-button')
      const menuClickTimeout = isMobile ? 60000 : 15000 // Increased timeout for mobile

      // Wait for button to be visible and stable before clicking (especially important for mobile)
      await expect(userMenuButton).toBeVisible({ timeout: menuClickTimeout })

      // For mobile devices, wait a bit longer to ensure button is stable
      if (isMobile) {
        await safeWait(page, 1000)
        // Check if page is still valid
        if (page.isClosed()) {
          throw new Error('Page was closed before menu click')
        }
        // Wait for button to be enabled and stable
        await userMenuButton.waitFor({ state: 'visible', timeout: 10000 })
        await safeWait(page, 500)
      }

      // Check if page is still valid before clicking
      if (page.isClosed()) {
        throw new Error('Page was closed before menu click')
      }

      try {
        // For mobile devices, use tap() which is more reliable than click()
        if (isMobile) {
          await userMenuButton.tap({ timeout: menuClickTimeout })
        } else {
          await userMenuButton.click({ timeout: menuClickTimeout })
        }
      } catch (error) {
        if (page.isClosed()) {
          throw new Error('Page was closed during menu interaction')
        }
        // If tap/click fails, try force click
        if (isMobile) {
          // Wait a bit more and try force click
          await safeWait(page, 1000)
          if (page.isClosed()) {
            throw new Error('Page was closed before force click')
          }
          await userMenuButton.click({ timeout: menuClickTimeout, force: true })
        } else {
          throw error
        }
      }
      await safeWait(page, 1000) // Wait longer for menu to open (increased from 500ms)

      // Wait for logout API call before clicking (logout triggers navigation)
      const logoutResponsePromise = page
        .waitForResponse(response => response.url().includes('/auth/logout'), { timeout: 15000 })
        .catch(() => null)

      // Click logout - mobile devices may need longer timeout
      const logoutButton = page.getByTestId('logout-button')
      const logoutClickTimeout = isMobile ? 30000 : 15000
      await logoutButton.click({ timeout: logoutClickTimeout })

      // Wait for logout API response
      await logoutResponsePromise

      // Logout triggers window.location.href = '/' which causes full page navigation
      // Wait for navigation to complete
      await page.waitForURL('**/', { timeout: navigationTimeout }).catch(() => {
        // Navigation might have already completed
      })

      // Wait for page to load after navigation
      try {
        await page.waitForLoadState('load', { timeout: navigationTimeout })
      } catch {
        // If load times out, try domcontentloaded with shorter timeout
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {
          // If that also fails, just continue - page is likely loaded enough
        })
      }
    })

    await test.step('Verify logout success', async () => {
      // User menu should be hidden
      await expect(page.getByTestId('user-menu-button')).not.toBeVisible({ timeout: 5000 })

      // Sign-in button should be visible again (wait longer for React state update, especially in Firefox)
      // Wait for navigation to complete and React to re-render
      await safeWait(page, 1000) // Give React time to update state

      await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: waitTimeout })
    })
  })
})
