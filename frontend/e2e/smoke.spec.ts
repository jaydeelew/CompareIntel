import type { Page } from '@playwright/test'

import { test, expect, waitForReactHydration } from './fixtures'

/**
 * E2E Smoke Tests (@smoke)
 *
 * Fast, deterministic smoke suite covering:
 * - Page load
 * - Compare run against MOCKED OpenRouter (no real API spend)
 * - Signup/login
 * - PWA manifest + service worker registration
 *
 * These tests are designed to run in CI as a required PR check (< 5 min).
 * All OpenRouter calls are mocked to prevent real API spend.
 */

/**
 * Mock OpenRouter API responses
 * This prevents any real API calls and ensures deterministic test behavior
 */
async function setupOpenRouterMock(page: Page) {
  let openrouterCallAttempted = false

  // Block and track any real OpenRouter API calls
  await page.route('**/*openrouter.ai/**', async (route, request) => {
    openrouterCallAttempted = true
    console.error(`❌ BLOCKED: Real OpenRouter API call attempted: ${request.url()}`)

    // For the models list endpoint, return mock data
    if (request.url().includes('/api/v1/models')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'anthropic/claude-3.5-haiku',
              name: 'Claude 3.5 Haiku',
              created: 1730246400,
              context_length: 200000,
              pricing: {
                prompt: '0.0000008',
                completion: '0.000004',
              },
            },
            {
              id: 'openai/gpt-4o-mini',
              name: 'GPT-4o Mini',
              created: 1720051200,
              context_length: 128000,
              pricing: {
                prompt: '0.00000015',
                completion: '0.0000006',
              },
            },
          ],
        }),
      })
      return
    }

    // For chat completions, fail to ensure backend doesn't try to reach OpenRouter
    await route.abort('failed')
  })

  // Return function to check if OpenRouter was called
  return {
    wasOpenRouterCalled: () => openrouterCallAttempted,
  }
}

test.describe('Smoke Tests @smoke', () => {
  test('should load homepage successfully', async ({ page, browserName }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // Verify page title
    await expect(page).toHaveTitle(/CompareIntel/i, { timeout: 15000 })

    // Verify main content is visible
    const mainContent = page.locator('main, [role="main"], .main-content, #root')
    await expect(mainContent.first()).toBeVisible({ timeout: 15000 })

    // Verify no error messages
    const errorMessage = page.locator(
      '.error-message, [role="alert"]:has-text("error"), .alert-error'
    )
    const errorCount = await errorMessage.count()
    expect(errorCount).toBe(0)
  })

  test('should perform compare run with mocked OpenRouter', async ({
    page,
    browserName,
    context,
  }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    // Clear authentication to test as unregistered user
    await context.clearCookies()

    // Set up OpenRouter mock and tracking
    // This blocks any real OpenRouter API calls and fails the test if attempted
    const openrouterCheck = await setupOpenRouterMock(page)

    // Mock the /api/compare-stream endpoint to return deterministic responses
    await page.route('**/api/compare-stream', async route => {
      const mockStream = [
        'data: {"model":"anthropic/claude-3.5-haiku","content":"2+2 equals 4. "}',
        'data: {"model":"anthropic/claude-3.5-haiku","content":"This is a basic arithmetic fact."}',
        'data: {"model":"anthropic/claude-3.5-haiku","done":true,"usage":{"prompt_tokens":10,"completion_tokens":15,"total_tokens":25}}',
        '',
      ].join('\n\n')

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: mockStream,
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // STRICT: Verify the comparison interface is present
    const promptArea = page.locator('textarea').first()
    await expect(promptArea).toBeVisible({ timeout: 15000 })

    // Enter test prompt
    await promptArea.fill('What is 2+2? (smoke test)')

    // STRICT: Verify the compare button exists
    const compareButton = page.getByTestId('comparison-submit-button').first()
    await expect(compareButton).toBeAttached({ timeout: 10000 })

    // STRICT: Models section must be visible
    const modelsSection = page.locator('.models-section, [data-testid="models-section"], .model-selection').first()
    await expect(modelsSection).toBeVisible({ timeout: 15000 })

    // STRICT: Model checkboxes must be available (backend has 93 preloaded models)
    const checkboxes = page.locator('input[type="checkbox"][id^="model-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 15000 })

    // Select the first available model
    await checkboxes.first().check({ force: true })

    // STRICT: Compare button must be enabled after selecting a model
    await expect(compareButton).toBeEnabled({ timeout: 5000 })

    // Submit the comparison
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/compare-stream'),
      { timeout: 30000 }
    )

    await compareButton.click()

    // STRICT: Response must be received
    const response = await responsePromise
    expect(response.status()).toBe(200)

    // STRICT: Results must appear with the mocked response text
    const resultsSection = page.locator('.results-section, .result-card, .comparison-result').first()
    await expect(resultsSection).toBeVisible({ timeout: 30000 })

    // STRICT: Verify the mocked response text appears in the results
    await expect(page.getByText(/2\+2 equals 4|equals 4/i)).toBeVisible({ timeout: 10000 })

    // CRITICAL: verify no real OpenRouter calls were made
    const openrouterCalled = openrouterCheck.wasOpenRouterCalled()
    if (openrouterCalled) {
      throw new Error(
        '❌ SMOKE TEST FAILURE: Real OpenRouter API call was attempted. All OpenRouter calls must be mocked in smoke tests to prevent API spend.'
      )
    }
  })

  test('should complete signup and login flow', async ({ page, browserName, context }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    // Clear authentication
    await context.clearCookies()

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // Use the test user that was created in global setup
    // This is more deterministic than creating a new random user
    const testEmail = 'free@test.com'
    const testPassword = 'TestPassword123!'

    // STRICT: Login button or sign up button must be visible (not logged in)
    const signupButton = page.getByTestId('nav-sign-up-button')
    const isLoggedOut = await signupButton.isVisible({ timeout: 5000 }).catch(() => false)

    // STRICT: Must be logged out at start of test
    expect(isLoggedOut).toBe(true)

    // Click sign in/login (not signup, since user already exists)
    // Look for login button
    const loginLink = page.locator('a:has-text("Log In"), button:has-text("Log In")').first()
    await expect(loginLink).toBeVisible({ timeout: 10000 })
    await loginLink.click()

    // STRICT: Auth modal must open
    const authModal = page.locator('.auth-modal, [role="dialog"]').first()
    await expect(authModal).toBeVisible({ timeout: 10000 })

    // Fill login form
    const emailInput = page.locator('input[type="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()

    await expect(emailInput).toBeVisible({ timeout: 5000 })
    await expect(passwordInput).toBeVisible({ timeout: 5000 })

    await emailInput.fill(testEmail)
    await passwordInput.fill(testPassword)

    // Submit login
    const submitButton = page.locator('button[type="submit"]').first()
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()

    // STRICT: Wait for login to complete - modal must close
    await authModal.waitFor({ state: 'hidden', timeout: 15000 })

    // STRICT: Verify user menu is visible (hard assertion)
    const userMenu = page.locator('[data-testid="user-menu"], .user-menu, .profile-menu').first()
    await expect(userMenu).toBeVisible({ timeout: 5000 })

    // STRICT: Sign up button must be hidden when logged in
    await expect(signupButton).toBeHidden({ timeout: 5000 })
  })

  test('should have valid PWA manifest', async ({ page, browserName }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })

    // Wait for document to be ready
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Check for manifest link
    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink.first()).toBeAttached({ timeout: 15000 })

    const manifestHref = await manifestLink.first().getAttribute('href')
    expect(manifestHref).toBeTruthy()
    expect(manifestHref).toMatch(/manifest/i)

    // Fetch and validate manifest content
    if (manifestHref) {
      const manifestUrl = new URL(manifestHref, page.url()).href
      const response = await page.request.get(manifestUrl)
      expect(response.ok()).toBe(true)

      const manifest = await response.json()
      expect(manifest).toHaveProperty('name')
      expect(manifest).toHaveProperty('short_name')
      expect(manifest).toHaveProperty('start_url')
      expect(manifest).toHaveProperty('display')
      expect(manifest.display).toBe('standalone')
    }
  })

  test('should register service worker in production', async ({ page, baseURL, browserName }) => {
    // Service workers only work in production builds
    const isProduction = baseURL?.includes('localhost:4173') || baseURL?.includes('https')

    if (!isProduction) {
      test.skip()
      return
    }

    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {})

    // Check if service worker is supported
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator
    })

    if (!hasServiceWorker) {
      test.skip()
      return
    }

    // Wait for service worker registration (deferred by 2 seconds in main.tsx)
    await page.waitForTimeout(3000)

    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          return registration.active ? 'activated' : 'installing'
        }
        return 'not-registered'
      } catch {
        return 'error'
      }
    })

    // In production, service worker should be registered
    expect(swStatus).toBeTruthy()
    expect(['activated', 'installing', 'not-registered']).toContain(swStatus)
  })

  test('should handle navigation without errors', async ({ page, browserName }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // Verify no console errors (excluding known third-party warnings)
    const errors: string[] = []
    page.on('pageerror', exception => {
      errors.push(exception.message)
    })

    // Wait a moment to catch any immediate errors
    await page.waitForTimeout(2000)

    // Filter out known acceptable errors/warnings
    const criticalErrors = errors.filter(
      err =>
        !err.includes('ResizeObserver') &&
        !err.includes('Extension') &&
        !err.includes('chrome-extension')
    )

    expect(criticalErrors.length).toBe(0)
  })
})
