import { chromium, FullConfig } from '@playwright/test'

/**
 * Global Setup for E2E Tests
 *
 * This runs once before all tests to:
 * - Create test users (admin, regular user) if they don't exist
 * - Set up any required test data
 *
 * Note: This assumes the backend is running and accessible.
 * The backend should be started by Playwright's webServer config.
 */

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173'
  const backendURL = process.env.BACKEND_URL || 'http://localhost:8000'

  console.log('Running global setup for E2E tests...')
  console.log(`Frontend URL: ${baseURL}`)
  console.log(`Backend URL: ${backendURL}`)

  // Wait for backend to be ready
  let backendReady = false
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${backendURL}/docs`)
      if (response.ok) {
        backendReady = true
        console.log('Backend is ready')
        break
      }
    } catch (_error) {
      // Backend not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  if (!backendReady) {
    console.warn('Warning: Backend may not be ready. Tests may fail if backend is not running.')
    return
  }

  // Test credentials - use tier-specific variables for clarity
  const TEST_USER_EMAIL =
    process.env.TEST_FREE_EMAIL || process.env.TEST_USER_EMAIL || 'free@test.com'
  const TEST_USER_PASSWORD =
    process.env.TEST_FREE_PASSWORD || process.env.TEST_USER_PASSWORD || 'Test12345678/'
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jaydeelew@gmail.com'
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sf*88323?ddpdRRl'

  // Launch browser for setup
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Try to create admin user via registration
    console.log('Setting up admin user...')
    await page.goto(`${baseURL}/`)
    await page.waitForLoadState('networkidle')

    // Check if admin exists by trying to login
    const loginButton = page.getByTestId('nav-sign-in-button')
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginButton.click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.getByTestId('login-email-input').fill(ADMIN_EMAIL)
      await page.getByTestId('login-password-input').fill(ADMIN_PASSWORD)
      await page.getByTestId('login-submit-button').click()
      await page.waitForLoadState('networkidle')

      const userMenu = page.getByTestId('user-menu-button')
      const adminExists = await userMenu.isVisible({ timeout: 5000 }).catch(() => false)

      if (!adminExists) {
        // Admin doesn't exist, try to register
        console.log('Admin user does not exist. Attempting to register...')

        // Clear cookies and start fresh
        await context.clearCookies()
        await page.goto(`${baseURL}/`)
        await page.waitForLoadState('networkidle')

        const signUpButton = page.getByTestId('nav-sign-up-button')
        if (await signUpButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          // Wait for any existing modals to close first
          await page.waitForTimeout(500)
          // Use force click to bypass overlay interception
          await signUpButton.click({ force: true, timeout: 5000 })
          await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 10000 })

          // Fill registration form using test IDs if available, fallback to selectors
          const emailInput = page
            .getByTestId('register-email-input')
            .catch(() => page.locator('input[type="email"]').first())
          const emailField = await emailInput
          await emailField.fill(ADMIN_EMAIL)

          const passwordInput = page
            .getByTestId('register-password-input')
            .catch(() => page.locator('input[type="password"]').first())
          const passwordField = await passwordInput
          await passwordField.fill(ADMIN_PASSWORD)

          const confirmPasswordInput = page
            .getByTestId('register-confirm-password-input')
            .catch(() => page.locator('input[type="password"]').nth(1))
          const confirmField = await confirmPasswordInput
          if (await confirmField.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmField.fill(ADMIN_PASSWORD)
          }

          // Wait for registration API call to complete
          const registerResponsePromise = page
            .waitForResponse(
              response => response.url().includes('/auth/register') && response.status() === 201,
              { timeout: 10000 }
            )
            .catch(() => {
              // Response might have already completed or failed
            })

          await page.getByTestId('register-submit-button').click()
          await registerResponsePromise
          await page.waitForLoadState('networkidle')

          // Check if registration succeeded by looking for user menu or error
          const registrationSucceeded = await page
            .getByTestId('user-menu-button')
            .isVisible({ timeout: 5000 })
            .catch(() => false)

          if (registrationSucceeded) {
            console.log('Admin user registered successfully.')
            console.log(
              'WARNING: Admin role must be set manually. Use backend script or database to set role="admin" and is_admin=true'
            )
            console.log(`User email: ${ADMIN_EMAIL}`)
          } else {
            // Check for error message
            const errorMessage = page.locator('.auth-error')
            if (await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
              const errorText = await errorMessage.textContent()
              console.log(`Registration failed: ${errorText}`)
            } else {
              console.log('Registration status unclear. User may need email verification.')
            }
          }
        }
      } else {
        console.log('Admin user already exists')
      }
    }

    // Try to create test user
    console.log('Setting up test user...')
    await page.goto(`${baseURL}/`)
    await page.waitForLoadState('networkidle')

    // Clear cookies to logout
    await context.clearCookies()

    const testLoginButton = page.getByTestId('nav-sign-in-button')
    if (await testLoginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await testLoginButton.click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.getByTestId('login-email-input').fill(TEST_USER_EMAIL)
      await page.getByTestId('login-password-input').fill(TEST_USER_PASSWORD)
      await page.getByTestId('login-submit-button').click()
      await page.waitForLoadState('networkidle')

      const testUserMenu = page.getByTestId('user-menu-button')
      const testUserExists = await testUserMenu.isVisible({ timeout: 5000 }).catch(() => false)

      if (!testUserExists) {
        // Test user doesn't exist, try to register
        console.log('Test user does not exist. Attempting to register...')
        const signUpButton = page.getByTestId('nav-sign-up-button')
        if (await signUpButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          // Wait for any existing modals to close first
          await page.waitForTimeout(500)
          // Use force click to bypass overlay interception
          await signUpButton.click({ force: true, timeout: 5000 })
          await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 10000 })

          const emailInput = page.locator('input[type="email"]').first()
          await emailInput.fill(TEST_USER_EMAIL)

          const passwordInput = page.locator('input[type="password"]').first()
          await passwordInput.fill(TEST_USER_PASSWORD)

          const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
          if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmPasswordInput.fill(TEST_USER_PASSWORD)
          }

          await page.getByTestId('register-submit-button').click()
          await page.waitForLoadState('networkidle')

          console.log('Test user registration attempted')
        }
      } else {
        console.log('Test user already exists')
      }
    }
  } catch (error) {
    console.error('Error during global setup:', error)
    // Don't fail the setup - tests can handle missing users
  } finally {
    await browser.close()
  }

  console.log('Global setup complete')
}

export default globalSetup
