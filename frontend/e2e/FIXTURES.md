# E2E Test Fixtures Guide

This guide explains how to use the comprehensive test fixtures available for CompareIntel E2E tests.

## Overview

Fixtures provide reusable setup code that prepares your test environment. Instead of writing login/navigation code in every test, you use fixtures that handle this automatically.

## Quick Start

```typescript
import { test, expect } from './fixtures'

test('My test', async ({ freeTierPage }) => {
  // freeTierPage is already logged in as a free tier user
  await freeTierPage.getByTestId('comparison-input-textarea').fill('Test input')
})
```

## Authentication Fixtures

### Subscription Tier Fixtures

Use these when you need to test tier-specific functionality:

```typescript
// Free tier user (default registered user)
test('Free tier test', async ({ freeTierPage }) => {
  // Already logged in as free tier user
})

// Starter tier user
test('Starter tier test', async ({ starterTierPage }) => {
  // Already logged in as starter tier user
  // Note: User must be upgraded to starter tier in backend/admin
})

// Starter Plus tier user
test('Starter Plus tier test', async ({ starterPlusTierPage }) => {
  // Already logged in as starter_plus tier user
})

// Pro tier user
test('Pro tier test', async ({ proTierPage }) => {
  // Already logged in as pro tier user
})

// Pro Plus tier user
test('Pro Plus tier test', async ({ proPlusTierPage }) => {
  // Already logged in as pro_plus tier user
})
```

### User Role Fixtures

```typescript
// Admin user (already on admin panel)
test('Admin test', async ({ adminPage }) => {
  // Already logged in as admin and on /admin page
  const userList = adminPage.locator('[data-testid="user-list"]')
  await expect(userList).toBeVisible()
})

// Moderator user
test('Moderator test', async ({ moderatorPage }) => {
  // Already logged in as moderator
  // Note: User must have moderator role set in backend/admin
})

// Generic authenticated user (free tier)
test('Authenticated test', async ({ authenticatedPage }) => {
  // Already logged in as free tier user
  // Use when tier doesn't matter
})
```

### Anonymous User Fixture

```typescript
// Anonymous (unauthenticated) user
test('Anonymous test', async ({ anonymousPage }) => {
  // All cookies and storage cleared
  // No user menu visible
  const signUpButton = anonymousPage.getByTestId('nav-sign-up-button')
  await expect(signUpButton).toBeVisible()
})
```

## Page Navigation Fixtures

Use these when you need to start on a specific page:

```typescript
// Comparison page (home page with form ready)
test('Comparison test', async ({ comparisonPage }) => {
  // Already on / with comparison form visible
  await comparisonPage.getByTestId('comparison-input-textarea').fill('Test')
})

// Admin panel page
test('Admin panel test', async ({ adminPanelPage }) => {
  // Already on /admin as admin user
})

// Content pages
test('About page test', async ({ aboutPage }) => {
  // Already on /about
})

test('FAQ page test', async ({ faqPage }) => {
  // Already on /faq
})

test('Features page test', async ({ featuresPage }) => {
  // Already on /features
})

test('Privacy page test', async ({ privacyPage }) => {
  // Already on /privacy-policy
})

test('Terms page test', async ({ termsPage }) => {
  // Already on /terms-of-service
})
```

## Test Data Helpers

Generate test data dynamically:

```typescript
test('Test with generated data', async ({ page, testData }) => {
  const email = testData.generateEmail('user')
  // email = "user-1234567890-1234@example.com"

  const password = testData.generatePassword()
  // password = "TestPassword123!"

  const comparisonInput = testData.generateComparisonInput()
  // Random comparison prompt from predefined list
})
```

## API Helpers

Wait for API calls or mock responses:

```typescript
test('Test with API wait', async ({ page, apiHelpers }) => {
  // Wait for a specific API call to complete
  await apiHelpers.waitForApiCall('/api/compare-stream', 30000)

  // Or wait for a pattern
  await apiHelpers.waitForApiCall(/\/api\/models/, 10000)
})

test('Test with mocked API', async ({ page, apiHelpers }) => {
  // Mock an API response
  await apiHelpers.mockApiResponse('/api/models', {
    models: [{ id: 'test-model', name: 'Test Model' }],
  })

  // Now API calls to /api/models will return mocked data
})
```

## Combining Fixtures

You can use multiple fixtures in a single test:

```typescript
test('Complex test', async ({ freeTierPage, testData, apiHelpers }) => {
  // freeTierPage is already logged in
  const input = testData.generateComparisonInput()

  await apiHelpers.waitForApiCall('/api/compare-stream')
  await freeTierPage.getByTestId('comparison-input-textarea').fill(input)
  // ... rest of test
})
```

## Environment Variables

Override default test credentials via environment variables:

```bash
# Subscription tier users
export TEST_FREE_EMAIL="custom-free@example.com"
export TEST_FREE_PASSWORD="CustomPassword123!"
export TEST_STARTER_EMAIL="custom-starter@example.com"
export TEST_STARTER_PASSWORD="CustomPassword123!"
export TEST_STARTER_PLUS_EMAIL="custom-starter-plus@example.com"
export TEST_STARTER_PLUS_PASSWORD="CustomPassword123!"
export TEST_PRO_EMAIL="custom-pro@example.com"
export TEST_PRO_PASSWORD="CustomPassword123!"
export TEST_PRO_PLUS_EMAIL="custom-pro-plus@example.com"
export TEST_PRO_PLUS_PASSWORD="CustomPassword123!"

# Role-based users
export ADMIN_EMAIL="custom-admin@example.com"
export ADMIN_PASSWORD="CustomAdminPassword123!"
export MODERATOR_EMAIL="custom-moderator@example.com"
export MODERATOR_PASSWORD="CustomModeratorPassword123!"

# Base URL
export PLAYWRIGHT_BASE_URL="http://localhost:3000"
```

## Examples

### Example 1: Testing Free Tier Limits

```typescript
import { test, expect } from './fixtures'

test('Free tier has 3 model limit', async ({ freeTierPage }) => {
  // Already logged in as free tier user
  const modelCheckboxes = freeTierPage.locator('input[type="checkbox"]')
  const count = await modelCheckboxes.count()

  // Free tier can select up to 3 models
  expect(count).toBeLessThanOrEqual(3)
})
```

### Example 2: Testing Admin Functionality

```typescript
import { test, expect } from './fixtures'

test('Admin can view user list', async ({ adminPage }) => {
  // Already on admin panel
  const userList = adminPage.locator('[data-testid="user-list"]')
  await expect(userList).toBeVisible()

  const userRows = adminPage.locator('tbody tr')
  const count = await userRows.count()
  expect(count).toBeGreaterThan(0)
})
```

### Example 3: Testing Anonymous User Flow

```typescript
import { test, expect } from './fixtures'

test('Anonymous user sees sign up prompt', async ({ anonymousPage }) => {
  // Already anonymous (no auth)
  const signUpButton = anonymousPage.getByTestId('nav-sign-up-button')
  await expect(signUpButton).toBeVisible()

  const comparisonInput = anonymousPage.getByTestId('comparison-input-textarea')
  await expect(comparisonInput).toBeVisible()
})
```

### Example 4: Testing with Generated Data

```typescript
import { test, expect } from './fixtures'

test('User can register with unique email', async ({ page, testData }) => {
  const uniqueEmail = testData.generateEmail('newuser')

  await page.goto('/')
  await page.getByTestId('nav-sign-up-button').click()
  await page.locator('input[type="email"]').first().fill(uniqueEmail)
  await page.locator('input[type="password"]').first().fill(testData.generatePassword())
  await page.getByTestId('register-submit-button').click()

  // Verify registration succeeded
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 10000 })
})
```

### Example 5: Testing Comparison Flow

```typescript
import { test, expect } from './fixtures'

test('User can perform comparison', async ({ comparisonPage, testData }) => {
  // Already on comparison page
  const input = testData.generateComparisonInput()

  await comparisonPage.getByTestId('comparison-input-textarea').fill(input)
  await comparisonPage.getByRole('button', { name: /compare|submit/i }).click()

  // Wait for results
  const results = comparisonPage.locator('[data-testid^="result-card-"]')
  await expect(results.first()).toBeVisible({ timeout: 60000 })
})
```

## Best Practices

1. **Use the most specific fixture**: If you need a pro tier user, use `proTierPage` instead of `authenticatedPage`
2. **Combine fixtures**: Use `testData` and `apiHelpers` with authentication fixtures
3. **Don't duplicate setup**: If a fixture already does what you need, use it instead of writing custom setup
4. **Use anonymous fixture**: Use `anonymousPage` when testing unauthenticated flows
5. **Override credentials**: Use environment variables for CI/CD or different test environments

## Troubleshooting

### Fixture fails to authenticate

- Check that test users exist in the database
- Verify backend is running
- Check environment variables if using custom credentials
- Look at browser console for errors

### Tier-specific fixtures don't work

- Ensure users are upgraded to the correct tier in backend/admin
- Check that tier upgrade was successful
- Verify user's `subscription_tier` field in database

### Admin fixture fails

- Ensure admin user exists with `is_admin=true` and `role='admin'`
- Verify admin user can access `/admin` route
- Check backend logs for authorization errors

## See Also

- [E2E Test Setup Guide](./SETUP.md)
- [Selector Guide](./SELECTOR_GUIDE.md)
- [Frontend Testing Documentation](../../docs/testing/FRONTEND_TESTING.md)
