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

  // Clear rate limiting before starting E2E tests
  // This prevents rate limiting from accumulating across test runs
  try {
    console.log('Clearing rate limiting for E2E tests...')
    const resetResponse = await fetch(`${backendURL}/api/dev/reset-rate-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: null }),
    })
    if (resetResponse.ok) {
      console.log('Rate limiting cleared successfully')
    } else {
      console.warn(
        'Warning: Could not clear rate limiting (this is OK if endpoint is not available)'
      )
    }
  } catch (error) {
    console.warn('Warning: Could not clear rate limiting:', error)
    // Don't fail setup if rate limiting clear fails
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

    // Clear rate limiting before admin login attempt
    try {
      await fetch(`${backendURL}/api/dev/reset-rate-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: null }),
      }).catch(() => {
        // Ignore errors - endpoint might not be available
      })
    } catch {
      // Ignore errors - rate limiting clear is best-effort
    }

    await page.goto(`${baseURL}/`)
    await page.waitForLoadState('networkidle')

    // Check if admin exists by trying to login
    const loginButton = page.getByTestId('nav-sign-in-button')
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loginButton.click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      // Fill login form
      await page.getByTestId('login-email-input').fill(ADMIN_EMAIL)
      await page.getByTestId('login-password-input').fill(ADMIN_PASSWORD)

      // Wait for login API response - wait for ANY response (200 or 401)
      // We need to catch both success and failure cases
      const loginResponsePromise = page
        .waitForResponse(response => response.url().includes('/auth/login'), { timeout: 10000 })
        .catch(() => null)

      await page.getByTestId('login-submit-button').click()
      const loginResponse = await loginResponsePromise

      // Wait for user data fetch request (auth/me) to complete
      // This is critical - it's what actually loads the user object needed for UserMenu to render
      await page
        .waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => {
          // Response might have already completed
        })

      // Wait for login to complete
      await page.waitForLoadState('networkidle')

      // Check for login error message
      const errorMessage = page.locator('.auth-error')
      const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)

      // Wait for auth modal to close (login successful)
      await page
        .waitForSelector('[data-testid="auth-modal"], .auth-modal', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {
          // Modal might already be closed
        })

      // Wait for sign-in button to disappear (confirms we're authenticated)
      await page
        .waitForSelector('[data-testid="nav-sign-in-button"]', {
          state: 'hidden',
          timeout: 10000,
        })
        .catch(() => {
          // Button might already be hidden
        })

      // Check if user menu appears (login successful)
      // Use longer timeout like admin test - user data needs to load
      const userMenu = page.getByTestId('user-menu-button')
      const adminExists = await userMenu.isVisible({ timeout: 20000 }).catch(() => false)

      if (adminExists) {
        console.log('Admin user already exists and login successful')
      } else {
        // Login failed - determine if we should register
        let errorText = ''
        if (hasError) {
          errorText = (await errorMessage.textContent()) || ''
        }

        // Log detailed debugging information
        const loginStatus = loginResponse ? loginResponse.status() : 'No response received'
        const loginSucceeded = loginResponse && loginResponse.status() === 200

        console.log('Login attempt details:')
        console.log(`  - Login response status: ${loginStatus}`)
        console.log(`  - Login succeeded (200): ${loginSucceeded}`)
        console.log(`  - Error message visible: ${hasError}`)
        console.log(`  - Error text: ${errorText || 'None'}`)
        console.log(`  - User menu visible: ${adminExists}`)

        if (loginSucceeded && !adminExists) {
          console.log('WARNING: Login API returned 200 (success) but user menu did not appear.')
          console.log('This might indicate:')
          console.log('  - User data is still loading (auth/me request may have failed)')
          console.log('  - User exists but may not have admin role set')
          console.log('  - Frontend may need more time to render user menu')
          console.log('Continuing with tests - they will handle authentication.')
          // Don't try to register if login succeeded
        }

        // Only register if login failed (401 or no response)
        // If login succeeded (200), don't try to register even if user menu didn't appear
        const shouldRegister = !loginSucceeded && (!loginResponse || loginResponse.status() === 401)

        if (shouldRegister) {
          // Admin doesn't exist (or credentials are wrong), try to register
          console.log('Admin user does not exist or login failed. Attempting to register...')

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
            await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', {
              timeout: 10000,
            })

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
              const regErrorMessage = page.locator('.auth-error')
              if (await regErrorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
                const regErrorText = await regErrorMessage.textContent()
                console.log(`Registration failed: ${regErrorText}`)
                if (regErrorText?.includes('already registered')) {
                  console.log('User already exists in database. Login may have failed due to:')
                  console.log('  - Wrong password')
                  console.log('  - Email not verified (is_verified=false)')
                  console.log('  - Missing admin role')
                }
              } else {
                console.log('Registration status unclear. User may need email verification.')
              }
            }
          }
        } else {
          // User might exist but login failed for other reasons
          console.log(`Admin user login failed: ${errorText || 'Unknown error'}`)
          console.log('Skipping registration. Possible reasons:')
          console.log(`  1. User exists but password is incorrect`)
          console.log(`  2. User exists but email is not verified (is_verified=false)`)
          console.log(`  3. User exists but doesn't have admin role set`)
          console.log(`\nTo fix:`)
          console.log(`  - Verify user exists: ${ADMIN_EMAIL}`)
          console.log(`  - Check password is correct`)
          console.log(`  - Run: python backend/create_admin_user.py`)
          console.log(`  - Or set in database: role="admin", is_admin=true, is_verified=true`)
          console.log('Tests may fail if admin user is not properly configured.')
        }
      }
    }

    // Try to create test user
    console.log('Setting up test user...')

    // Clear rate limiting before test user login attempt
    try {
      await fetch(`${backendURL}/api/dev/reset-rate-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: null }),
      }).catch(() => {
        // Ignore errors - endpoint might not be available
      })
    } catch {
      // Ignore errors - rate limiting clear is best-effort
    }

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
