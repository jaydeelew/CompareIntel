/**
 * Example E2E Tests Using Fixtures
 *
 * This file demonstrates how to use the comprehensive fixtures
 * available in ./fixtures.ts. These examples show best practices
 * for writing E2E tests with fixtures.
 *
 * To run these examples:
 *   npx playwright test e2e/example-with-fixtures.spec.ts
 */

import { test, expect } from './fixtures'

// ============================================================================
// Example 1: Using Tier-Specific Fixtures
// ============================================================================

test.describe('Subscription Tier Examples', () => {
  test('Free tier user can access free-tier models', async ({ freeTierPage }) => {
    // freeTierPage is already logged in as a free tier user
    const modelCheckboxes = freeTierPage.locator('input[type="checkbox"]')
    const count = await modelCheckboxes.count()

    // Free tier can select up to 3 models
    expect(count).toBeLessThanOrEqual(3)
  })

  test('Pro tier user can access premium models', async ({ proTierPage }) => {
    // proTierPage is already logged in as a pro tier user
    // Pro tier has access to all models
    const modelCheckboxes = proTierPage.locator('input[type="checkbox"]')
    const count = await modelCheckboxes.count()

    // Pro tier can select up to 9 models
    expect(count).toBeLessThanOrEqual(9)
  })
})

// ============================================================================
// Example 2: Using Admin Fixture
// ============================================================================

test.describe('Admin Examples', () => {
  test('Admin can view user list', async ({ adminPage }) => {
    // adminPage is already on /admin as admin user
    const userList = adminPage.locator('[data-testid="user-list"], .user-list, table')
    await expect(userList).toBeVisible({ timeout: 5000 })

    const userRows = adminPage.locator('tbody tr, [data-testid="user-row"]')
    const count = await userRows.count()

    // Should have at least one user (admin themselves)
    expect(count).toBeGreaterThan(0)
  })

  test('Admin can navigate admin panel', async ({ adminPanelPage }) => {
    // adminPanelPage is the same as adminPage (already on /admin)
    await expect(adminPanelPage).toHaveURL(/\/admin/)
  })
})

// ============================================================================
// Example 3: Using Anonymous User Fixture
// ============================================================================

test.describe('Anonymous User Examples', () => {
  test('Anonymous user sees sign up prompt', async ({ anonymousPage }) => {
    // anonymousPage has all auth state cleared
    const signUpButton = anonymousPage.getByTestId('nav-sign-up-button')
    await expect(signUpButton).toBeVisible()

    const loginButton = anonymousPage.getByTestId('nav-sign-in-button')
    await expect(loginButton).toBeVisible()

    // User menu should not be visible
    const userMenu = anonymousPage.getByTestId('user-menu-button')
    await expect(userMenu).not.toBeVisible()
  })

  test('Anonymous user can perform comparison', async ({ anonymousPage }) => {
    const comparisonInput = anonymousPage.getByTestId('comparison-input-textarea')
    await expect(comparisonInput).toBeVisible()

    await comparisonInput.fill('Test comparison input')
    // ... rest of comparison test
  })
})

// ============================================================================
// Example 4: Using Page Navigation Fixtures
// ============================================================================

test.describe('Page Navigation Examples', () => {
  test('Comparison page has form ready', async ({ comparisonPage }) => {
    // comparisonPage is already on / with form visible
    const input = comparisonPage.getByTestId('comparison-input-textarea')
    await expect(input).toBeVisible()

    const submitButton = comparisonPage.getByRole('button', { name: /compare|submit/i })
    await expect(submitButton).toBeVisible()
  })

  test('About page loads correctly', async ({ aboutPage }) => {
    // aboutPage is already on /about
    await expect(aboutPage).toHaveURL(/\/about/)
    await expect(aboutPage.locator('h1, h2')).toContainText(/about/i)
  })

  test('FAQ page has content', async ({ faqPage }) => {
    // faqPage is already on /faq
    await expect(faqPage).toHaveURL(/\/faq/)
    const faqContent = faqPage.locator('article, main, [role="main"]')
    await expect(faqContent).toBeVisible()
  })
})

// ============================================================================
// Example 5: Using Test Data Helpers
// ============================================================================

test.describe('Test Data Helper Examples', () => {
  test('Can generate unique test data', async ({ testData }) => {
    const uniqueEmail = testData.generateEmail('testuser')
    expect(uniqueEmail).toMatch(/^testuser-\d+-\d+@example\.com$/)

    const password = testData.generatePassword()
    expect(password).toBe('TestPassword123!')

    const comparisonInput = testData.generateComparisonInput()
    expect(comparisonInput).toBeTruthy()
    expect(comparisonInput.length).toBeGreaterThan(0)
  })

  test('Can register user with generated email', async ({ page, testData }) => {
    const uniqueEmail = testData.generateEmail('newuser')

    await page.goto('/')
    await page.getByTestId('nav-sign-up-button').click()
    await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

    await page.locator('input[type="email"]').first().fill(uniqueEmail)
    await page.locator('input[type="password"]').first().fill(testData.generatePassword())

    const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
    if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmPasswordInput.fill(testData.generatePassword())
    }

    await page.getByTestId('register-submit-button').click()
    await page.waitForLoadState('networkidle')

    // Verify registration succeeded
    await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 })
  })
})

// ============================================================================
// Example 6: Using API Helpers
// ============================================================================

test.describe('API Helper Examples', () => {
  test('Can wait for API call', async ({ comparisonPage, apiHelpers, testData }) => {
    // Start comparison
    const input = testData.generateComparisonInput()
    await comparisonPage.getByTestId('comparison-input-textarea').fill(input)

    // Wait for API call before submitting (if needed)
    // This is useful when you need to ensure API is ready
    const submitButton = comparisonPage.getByRole('button', { name: /compare|submit/i })
    await submitButton.click()

    // Wait for comparison API call to complete
    await apiHelpers.waitForApiCall('/api/compare-stream', 60000)

    // Verify results
    const results = comparisonPage.locator('[data-testid^="result-card-"]')
    await expect(results.first()).toBeVisible({ timeout: 10000 })
  })

  test('Can mock API response', async ({ page, apiHelpers }) => {
    // Mock models API response
    await apiHelpers.mockApiResponse('/api/models', {
      models: [
        { id: 'test-model-1', name: 'Test Model 1', provider: 'test' },
        { id: 'test-model-2', name: 'Test Model 2', provider: 'test' },
      ],
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Now API calls to /api/models will return mocked data
    // Useful for testing UI without backend dependencies
  })
})

// ============================================================================
// Example 7: Combining Multiple Fixtures
// ============================================================================

test.describe('Combining Fixtures Examples', () => {
  test('Complex test with multiple fixtures', async ({ freeTierPage, testData, apiHelpers }) => {
    // freeTierPage is already logged in
    // testData provides data generation
    // apiHelpers provides API utilities

    const comparisonInput = testData.generateComparisonInput()

    // Perform comparison
    await freeTierPage.getByTestId('comparison-input-textarea').fill(comparisonInput)
    await freeTierPage.getByRole('button', { name: /compare|submit/i }).click()

    // Wait for API call
    await apiHelpers.waitForApiCall('/api/compare-stream', 60000)

    // Verify results
    const results = freeTierPage.locator('[data-testid^="result-card-"]')
    await expect(results.first()).toBeVisible({ timeout: 10000 })
  })

  test('Test with page navigation and authentication', async ({ authenticatedPage }) => {
    // authenticatedPage is logged in as free tier user
    // Navigate to about page
    await authenticatedPage.goto('/about')
    await expect(authenticatedPage).toHaveURL(/\/about/)

    // User should still be authenticated
    const userMenu = authenticatedPage.getByTestId('user-menu-button')
    await expect(userMenu).toBeVisible()
  })
})

// ============================================================================
// Example 8: Testing Different User Scenarios
// ============================================================================

test.describe('User Scenario Examples', () => {
  test('Free tier user workflow', async ({ freeTierPage, testData }) => {
    // Free tier user can perform comparison
    const input = testData.generateComparisonInput()
    await freeTierPage.getByTestId('comparison-input-textarea').fill(input)
    await freeTierPage.getByRole('button', { name: /compare|submit/i }).click()

    // Wait for results
    const results = freeTierPage.locator('[data-testid^="result-card-"]')
    await expect(results.first()).toBeVisible({ timeout: 60000 })
  })

  test('Pro tier user has more model options', async ({ proTierPage }) => {
    // Pro tier can select more models
    const modelCheckboxes = proTierPage.locator('input[type="checkbox"]')
    const freeTierLimit = 3
    const proTierLimit = 9

    const count = await modelCheckboxes.count()
    expect(count).toBeGreaterThan(freeTierLimit)
    expect(count).toBeLessThanOrEqual(proTierLimit)
  })

  test('Anonymous user sees upgrade prompts', async ({ anonymousPage }) => {
    // Anonymous users should see prompts to sign up
    const signUpButton = anonymousPage.getByTestId('nav-sign-up-button')
    await expect(signUpButton).toBeVisible()

    // May see upgrade prompts when trying to use premium features
    // (implementation depends on your UI)
  })
})
