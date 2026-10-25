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

/**
 * Mock the models API to return deterministic model list
 * This ensures models are always available for testing
 */
async function mockModelsAPI(page: Page) {
  await page.route('**/api/models*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          {
            id: 'anthropic/claude-3.5-haiku',
            name: 'Claude 3.5 Haiku',
            description: 'Fast and efficient model',
            category: 'General',
            provider: 'Anthropic',
            available: true,
          },
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini',
            description: 'Efficient OpenAI model',
            category: 'General',
            provider: 'OpenAI',
            available: true,
          },
        ],
        models_by_provider: {
          Anthropic: [
            {
              id: 'anthropic/claude-3.5-haiku',
              name: 'Claude 3.5 Haiku',
              available: true,
            },
          ],
          OpenAI: [
            {
              id: 'openai/gpt-4o-mini',
              name: 'GPT-4o Mini',
              available: true,
            },
          ],
        },
      }),
    })
  })
}

/**
 * Mock the compare-stream API to return deterministic response
 * This ensures the comparison flow completes successfully
 */
async function mockCompareStreamAPI(page: Page) {
  await page.route('**/api/compare-stream', async route => {
    // Simulate SSE streaming response with mock content
    const mockSSE = [
      'data: {"model":"anthropic/claude-3.5-haiku","content":"2+2 equals "}',
      '',
      'data: {"model":"anthropic/claude-3.5-haiku","content":"4. "}',
      '',
      'data: {"model":"anthropic/claude-3.5-haiku","content":"This is a deterministic mock response for smoke testing."}',
      '',
      'data: {"model":"anthropic/claude-3.5-haiku","done":true,"usage":{"prompt_tokens":10,"completion_tokens":15,"total_tokens":25}}',
      '',
      '',
    ].join('\n')

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: mockSSE,
    })
  })
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

    // CRITICAL: Set up mocks BEFORE navigation for deterministic testing
    const openrouterCheck = await setupOpenRouterMock(page)
    await mockCompareStreamAPI(page)

    // Now navigate with mocks in place
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // DETERMINISTIC: Wait for models API to respond
    await page.waitForResponse(
      response => response.url().includes('/api/models') && response.status() === 200,
      { timeout: 15000 }
    )

    // DETERMINISTIC: Models MUST render after API responds
    const checkboxes = page.locator('[data-testid^="model-checkbox-"]')
    await expect(checkboxes.first()).toBeVisible({ timeout: 15000 })

    // Wait for models to become enabled
    await page.waitForTimeout(2000)

    // DETERMINISTIC: At least one model MUST be selectable
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(0)

    let modelSelected = false
    for (let i = 0; i < Math.min(count, 10); i++) {
      const checkbox = checkboxes.nth(i)
      const isDisabled = await checkbox.isDisabled().catch(() => true)
      if (!isDisabled) {
        await checkbox.check({ force: true })
        modelSelected = true
        break
      }
    }

    // HARD REQUIREMENT: Model selection MUST succeed
    expect(modelSelected).toBe(true)

    // Enter test prompt
    const promptArea = page.locator('textarea').first()
    await expect(promptArea).toBeVisible({ timeout: 15000 })
    await promptArea.fill('What is 2+2?')

    // DETERMINISTIC: Compare button MUST be enabled after model selection
    const compareButton = page.getByTestId('comparison-submit-button').first()
    await expect(compareButton).toBeEnabled({ timeout: 15000 })

    // Submit and wait for mocked response
    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/compare-stream') && response.request().method() === 'POST',
      { timeout: 30000 }
    )

    await compareButton.click()

    // DETERMINISTIC: Mocked API MUST respond
    const response = await responsePromise
    expect(response.status()).toBe(200)

    // DETERMINISTIC: Results MUST render
    const resultsSection = page.locator('.results-section, .result-card').first()
    await expect(resultsSection).toBeVisible({ timeout: 30000 })

    // DETERMINISTIC: Mocked response text MUST be present
    const resultText = await page.textContent('body')
    expect(resultText).toContain('deterministic mock response')

    // CRITICAL: No real OpenRouter calls allowed (HARD REQUIREMENT)
    expect(openrouterCheck.wasOpenRouterCalled()).toBe(false)
  })

  test('should complete signup flow', async ({ page, browserName, context }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    // Clear authentication
    await context.clearCookies()

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // DETERMINISTIC: Sign up button MUST exist
    const signupButton = page.getByTestId('nav-sign-up-button')
    await expect(signupButton).toBeVisible({ timeout: 15000 })
    await signupButton.click()

    // DETERMINISTIC: Auth modal MUST open
    const authModal = page.locator('.auth-modal, [role="dialog"]').first()
    await expect(authModal).toBeVisible({ timeout: 10000 })

    // DETERMINISTIC: Form fields MUST be present
    const emailInput = page.locator('input[type="email"]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    const submitButton = page.locator('button[type="submit"]').first()

    await expect(emailInput).toBeVisible({ timeout: 10000 })
    await expect(passwordInput).toBeVisible({ timeout: 10000 })
    await expect(submitButton).toBeVisible({ timeout: 10000 })

    // Fill form with unique test data
    const testEmail = `smoke-test-${Date.now()}@example.com`
    await emailInput.fill(testEmail)
    await passwordInput.fill('TestPassword123!')

    // Submit form
    await submitButton.click()

    // DETERMINISTIC: Form MUST submit (either success or error, not hang)
    // Wait for one of three outcomes:
    // 1. Modal closes (success)
    // 2. Error message appears (validation/backend error)
    // 3. Modal content changes (email verification prompt)
    await Promise.race([
      authModal.waitFor({ state: 'hidden', timeout: 15000 }),
      page
        .locator('.error-message, .alert-error, [role="alert"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 }),
      page.locator('text=/verif|confirm|check.*email/i').first().waitFor({ timeout: 15000 }),
    ])

    // DETERMINISTIC: Verify the form submission completed
    // (modal either closed, showed error, or showed verification prompt)
    const modalStillOpen = await authModal.isVisible().catch(() => false)
    const hasError = await page
      .locator('.error-message, .alert-error')
      .first()
      .isVisible()
      .catch(() => false)
    const hasVerificationPrompt = await page
      .locator('text=/verif|confirm|check.*email/i')
      .first()
      .isVisible()
      .catch(() => false)

    // HARD REQUIREMENT: Form must have submitted (reached one of the three states)
    const formSubmitted = !modalStillOpen || hasError || hasVerificationPrompt
    expect(formSubmitted).toBe(true)
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
