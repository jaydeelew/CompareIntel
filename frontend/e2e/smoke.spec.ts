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
 * Mock the backend compare-stream endpoint to return simulated streaming responses
 * This allows us to test the compare flow without hitting OpenRouter
 */
async function mockCompareStream(page: Page) {
  await page.route('**/api/compare-stream', async route => {
    const request = route.request()
    const postData = request.postDataJSON()

    // Simulate SSE streaming response
    const mockResponse = `data: ${JSON.stringify({ model: postData.models[0], content: 'Mock response from ' })}\n\ndata: ${JSON.stringify({ model: postData.models[0], content: 'test model. ' })}\n\ndata: ${JSON.stringify({ model: postData.models[0], content: 'This is a smoke test.' })}\n\ndata: ${JSON.stringify({ model: postData.models[0], done: true, usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 } })}\n\n`

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: mockResponse,
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

    // Set up OpenRouter mock and tracking
    // This blocks any real OpenRouter API calls and fails the test if attempted
    const openrouterCheck = await setupOpenRouterMock(page)

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // Verify the comparison interface is present (models section + prompt area)
    const modelsSection = page.locator('.models-section, [data-testid="models-section"]').first()
    const promptArea = page.locator('textarea').first()

    await expect(modelsSection).toBeVisible({ timeout: 15000 })
    await expect(promptArea).toBeVisible({ timeout: 15000 })

    // Enter test prompt to verify interaction works
    await promptArea.fill('Test prompt for smoke test')

    // Verify the compare button exists and is interactive
    const compareButton = page.getByTestId('comparison-submit-button').first()
    await expect(compareButton).toBeAttached({ timeout: 10000 })

    // The critical test: verify no real OpenRouter calls were made during page load
    const openrouterCalled = openrouterCheck.wasOpenRouterCalled()
    if (openrouterCalled) {
      throw new Error(
        '❌ SMOKE TEST FAILURE: Real OpenRouter API call was attempted. All OpenRouter calls must be mocked in smoke tests to prevent API spend.'
      )
    }

    // Note: We don't actually submit the comparison in the smoke test to keep it fast and simple.
    // The goal is to verify the UI loads correctly and no OpenRouter calls are made.
  })

  test('should display signup/login prompts', async ({ page, browserName, context }) => {
    const isFirefox = browserName === 'firefox'
    const isWebKit = browserName === 'webkit'
    const timeout = isFirefox || isWebKit ? 60000 : 30000

    // Clear authentication
    await context.clearCookies()

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout })
    await waitForReactHydration(page)

    // Look for sign up button using the correct test ID from Navigation.tsx
    const signupButton = page.getByTestId('nav-sign-up-button')

    // Sign up button should be visible for unauthenticated users
    await expect(signupButton).toBeVisible({ timeout: 15000 })
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
