import { chromium, FullConfig, Page } from '@playwright/test'

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

/**
 * Helper function to dismiss the tutorial overlay if it appears
 */
async function dismissTutorialOverlay(page: Page) {
  try {
    // Check if page is still valid
    if (page.isClosed()) {
      return
    }

    // Wait a bit for any animations to complete
    await page.waitForTimeout(500)

    // First check if tutorial overlay is actually visible, regardless of viewport
    // Sometimes it appears on mobile even though it shouldn't
    const tutorialOverlay = page.locator('.tutorial-backdrop, .tutorial-welcome-backdrop')
    const overlayVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)

    // Check if we're on a mobile viewport (tutorial is disabled on mobile - width <= 768px)
    const viewport = page.viewportSize()
    const isMobileViewport = viewport && viewport.width <= 768

    // If on mobile and overlay is not visible, skip dismissal (tutorial shouldn't appear)
    if (isMobileViewport && !overlayVisible) {
      // Tutorial is not available on mobile and not visible, so skip dismissal
      return
    }

    // If overlay is visible (even on mobile), we need to dismiss it

    // First, check for the welcome modal (appears first)
    const welcomeModal = page.locator('.tutorial-welcome-backdrop')
    const welcomeVisible = await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)

    if (welcomeVisible && !page.isClosed()) {
      // Click "Skip for Now" button
      const skipButton = page.locator(
        '.tutorial-welcome-button-secondary, button:has-text("Skip for Now")'
      )
      const skipVisible = await skipButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (skipVisible && !page.isClosed()) {
        try {
          // Wait for button to be stable before clicking
          await skipButton.waitFor({ state: 'visible', timeout: 5000 })
          await page.waitForTimeout(300) // Wait for any animations

          if (!page.isClosed()) {
            // Try normal click first
            await skipButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                // If normal click fails, try force click
                await skipButton.click({ timeout: 5000, force: true })
              }
            })

            // Wait for welcome modal to disappear
            await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(500)
          }
        } catch (_clickError) {
          // Fallback: try pressing Escape
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await page.waitForTimeout(500)
          }
        }
      } else if (!page.isClosed()) {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(500)
      }
    }

    // Then check for the tutorial overlay (appears after welcome modal)
    if (page.isClosed()) {
      return
    }

    // Re-check overlay visibility (it may have changed)
    const overlayStillVisible = await tutorialOverlay
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (overlayStillVisible && !page.isClosed()) {
      // Try to click the skip/close button in the tutorial overlay
      const closeButton = page.locator(
        '.tutorial-close-button, button[aria-label*="Skip"], button[aria-label*="skip"]'
      )
      const closeVisible = await closeButton.isVisible({ timeout: 3000 }).catch(() => false)

      if (closeVisible && !page.isClosed()) {
        try {
          // Wait for button to be stable before clicking
          await closeButton.waitFor({ state: 'visible', timeout: 5000 })
          await page.waitForTimeout(300) // Wait for any animations

          if (!page.isClosed()) {
            // Try normal click first
            await closeButton.click({ timeout: 10000, force: false }).catch(async () => {
              if (!page.isClosed()) {
                // If normal click fails, try force click
                await closeButton.click({ timeout: 5000, force: true })
              }
            })

            // Wait for overlay to disappear
            await tutorialOverlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(500)
          }
        } catch (_clickError) {
          // Fallback: try pressing Escape
          if (!page.isClosed()) {
            await page.keyboard.press('Escape').catch(() => {})
            await page.waitForTimeout(500)
          }
        }
      } else if (!page.isClosed()) {
        // Fallback: try pressing Escape
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(500)
      }
    }

    // Final check: ensure overlay is gone by waiting a bit more and checking again
    if (!page.isClosed()) {
      await page.waitForTimeout(500)
      const stillVisible = await tutorialOverlay.isVisible({ timeout: 1000 }).catch(() => false)
      if (stillVisible && !page.isClosed()) {
        // Last resort: try Escape again
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(500)
      }
    }
  } catch (error) {
    // Ignore errors - tutorial might not be present or page might be closed
    if (error instanceof Error && error.message.includes('closed')) {
      return
    }
    console.log(
      'Tutorial overlay dismissal attempted:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173'
  const backendURL = process.env.BACKEND_URL || 'http://localhost:8000'

  // Set test environment flag for reCAPTCHA detection
  process.env.NODE_ENV = 'test'

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

  // ============================================================================
  // PRIORITY: Create test users via API first (critical for CI reliability)
  // This ensures users exist before any UI-based operations are attempted
  // ============================================================================
  console.log('Creating test users via API (fast path for CI)...')

  // Create admin user via API
  try {
    const adminResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
        is_admin: true,
        is_verified: true,
        is_active: true,
      }),
    })
    if (adminResponse.ok) {
      console.log(`✓ Admin user (${ADMIN_EMAIL}) created/updated via API`)
    } else {
      const errorText = await adminResponse.text().catch(() => 'Unknown error')
      console.log(`! Admin user API creation returned: ${adminResponse.status} - ${errorText}`)
    }
  } catch (error) {
    console.log(
      `! Could not create admin user via API:`,
      error instanceof Error ? error.message : String(error)
    )
  }

  // Create test (free tier) user via API
  try {
    const testUserResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        role: 'user',
        is_admin: false,
        is_verified: true,
        is_active: true,
      }),
    })
    if (testUserResponse.ok) {
      console.log(`✓ Test user (${TEST_USER_EMAIL}) created/updated via API`)
    } else {
      const errorText = await testUserResponse.text().catch(() => 'Unknown error')
      console.log(`! Test user API creation returned: ${testUserResponse.status} - ${errorText}`)
    }
  } catch (error) {
    console.log(
      `! Could not create test user via API:`,
      error instanceof Error ? error.message : String(error)
    )
  }

  // Verify users can login via API (quick sanity check)
  console.log('Verifying user logins via API...')
  for (const { email, password, role } of [
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' },
    { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD, role: 'test' },
  ]) {
    try {
      const loginResponse = await fetch(`${backendURL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (loginResponse.ok) {
        console.log(`✓ ${role} user (${email}) can login via API`)
      } else {
        console.log(`! ${role} user (${email}) login failed: ${loginResponse.status}`)
      }
    } catch (error) {
      console.log(
        `! ${role} user login check failed:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  console.log('API-based user setup complete. Proceeding with browser verification...')

  // Launch browser for setup verification (optional - API setup is the primary method)
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Verify admin user via browser (optional fallback)
    console.log('Verifying admin user via browser...')

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

    // Dismiss tutorial overlay if it appears (blocks interactions)
    await dismissTutorialOverlay(page)

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

          // Dismiss tutorial overlay if it appears (blocks interactions)
          await dismissTutorialOverlay(page)

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
              // Try to set admin role via dev endpoint
              try {
                const adminUpdateResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: ADMIN_EMAIL,
                    password: ADMIN_PASSWORD,
                    role: 'admin',
                    is_admin: true,
                    is_verified: true,
                    is_active: true,
                  }),
                })
                if (adminUpdateResponse.ok) {
                  console.log('Admin role set successfully via dev endpoint')
                }
              } catch (_e) {
                console.log('Could not set admin role via dev endpoint (non-critical)')
              }
              console.log(`User email: ${ADMIN_EMAIL}`)
            } else {
              // Check for error message
              const regErrorMessage = page.locator('.auth-error')
              if (await regErrorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
                const regErrorText = await regErrorMessage.textContent()
                console.log(`Registration failed: ${regErrorText}`)
                if (regErrorText?.includes('already registered')) {
                  console.log('User already exists. Attempting to update via dev endpoint...')
                  // Try to update user via dev endpoint
                  try {
                    const updateResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: ADMIN_EMAIL,
                        password: ADMIN_PASSWORD,
                        role: 'admin',
                        is_admin: true,
                        is_verified: true,
                        is_active: true,
                      }),
                    })
                    if (updateResponse.ok) {
                      console.log('Admin user updated successfully via dev endpoint')
                    } else {
                      const errorText = await updateResponse.text()
                      console.log(`Failed to update admin user: ${errorText}`)
                    }
                  } catch (e) {
                    console.log(`Could not update admin user via dev endpoint: ${e}`)
                  }
                }
              } else {
                console.log(
                  'Registration status unclear. Attempting to create user via dev endpoint...'
                )
                // Try to create user directly via dev endpoint
                try {
                  const createResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: ADMIN_EMAIL,
                      password: ADMIN_PASSWORD,
                      role: 'admin',
                      is_admin: true,
                      is_verified: true,
                      is_active: true,
                    }),
                  })
                  if (createResponse.ok) {
                    console.log('Admin user created successfully via dev endpoint')
                  } else {
                    const errorText = await createResponse.text()
                    console.log(`Failed to create admin user: ${errorText}`)
                  }
                } catch (e) {
                  console.log(`Could not create admin user via dev endpoint: ${e}`)
                }
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

    // Dismiss tutorial overlay if it appears (blocks interactions)
    await dismissTutorialOverlay(page)

    // Clear cookies to logout
    await context.clearCookies()

    // Navigate again after clearing cookies
    await page.goto(`${baseURL}/`)
    await page.waitForLoadState('networkidle')

    // Dismiss tutorial overlay again after navigation
    await dismissTutorialOverlay(page)

    const testLoginButton = page.getByTestId('nav-sign-in-button')
    if (await testLoginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await testLoginButton.click()
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      await page.getByTestId('login-email-input').fill(TEST_USER_EMAIL)
      await page.getByTestId('login-password-input').fill(TEST_USER_PASSWORD)

      // Wait for login API response
      const loginResponsePromise = page
        .waitForResponse(response => response.url().includes('/auth/login'), { timeout: 10000 })
        .catch(() => null)

      await page.getByTestId('login-submit-button').click()
      const _loginResponse = await loginResponsePromise

      // Wait a bit for UI to update (error message or modal close)
      await page.waitForTimeout(1000)
      await page.waitForLoadState('networkidle')

      const testUserMenu = page.getByTestId('user-menu-button')
      const testUserExists = await testUserMenu.isVisible({ timeout: 5000 }).catch(() => false)

      if (!testUserExists) {
        // Test user doesn't exist, try to register
        console.log('Test user does not exist. Attempting to register...')
        try {
          // Check if auth modal is still open (login failed, modal should still be visible)
          const authModal = page.locator('[data-testid="auth-modal"], .auth-modal')
          const modalVisible = await authModal.isVisible({ timeout: 3000 }).catch(() => false)

          if (!modalVisible) {
            // Modal closed after failed login, reopen in registration mode
            console.log('Auth modal closed, reopening in registration mode...')
            const signUpButton = page.getByTestId('nav-sign-up-button')
            if (await signUpButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await signUpButton.click({ timeout: 5000 })
              await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', {
                timeout: 10000,
              })
              // Wait for registration form to be ready
              await page.waitForSelector(
                '[data-testid="register-email-input"], input[type="email"]',
                {
                  timeout: 10000,
                }
              )
              await page.waitForTimeout(1000)
            } else {
              throw new Error('Could not find sign-up button to reopen auth modal')
            }
          } else {
            // Modal is still open, switch from login to registration mode
            console.log('Auth modal still open, switching to registration mode...')
            // Wait for login form to be visible (in case error message is showing)
            await page
              .waitForSelector('[data-testid="login-email-input"], input[type="email"]', {
                timeout: 5000,
              })
              .catch(() => {})

            // Click the "Sign up" link inside the login form to switch to registration mode
            const signUpLink = page.locator(
              '.auth-link-btn:has-text("Sign up"), button:has-text("Sign up")'
            )
            if (await signUpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
              await signUpLink.click({ timeout: 5000 })

              // Wait for the registration form to appear (switch from login to register mode)
              await page.waitForSelector(
                '[data-testid="register-email-input"], input[type="email"]',
                {
                  timeout: 10000,
                }
              )

              // Wait for the modal to be fully ready
              await page.waitForTimeout(1000)
            } else {
              throw new Error('Could not find "Sign up" link in login form')
            }
          }

          // Try to find and fill registration form fields
          // Use test IDs if available, fallback to generic selectors
          try {
            await page.getByTestId('register-email-input').fill(TEST_USER_EMAIL, { timeout: 5000 })
          } catch {
            // Fallback to generic email input
            const emailInput = page.locator('input[type="email"]').first()
            await emailInput.waitFor({ state: 'visible', timeout: 5000 })
            await emailInput.fill(TEST_USER_EMAIL)
          }

          try {
            await page
              .getByTestId('register-password-input')
              .fill(TEST_USER_PASSWORD, { timeout: 5000 })
          } catch {
            const passwordInput = page.locator('input[type="password"]').first()
            await passwordInput.fill(TEST_USER_PASSWORD)
          }

          try {
            const confirmPasswordInput = page.getByTestId('register-confirm-password-input')
            if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await confirmPasswordInput.fill(TEST_USER_PASSWORD)
            }
          } catch {
            const confirmPasswordInput = page.locator('input[type="password"]').nth(1)
            if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
              await confirmPasswordInput.fill(TEST_USER_PASSWORD)
            }
          }

          // Wait for registration API call to complete
          const registerResponsePromise = page
            .waitForResponse(
              response => response.url().includes('/auth/register') && response.status() === 201,
              { timeout: 15000 }
            )
            .catch(() => null)

          await page.getByTestId('register-submit-button').click()
          const registerResponse = await registerResponsePromise

          // Wait for user menu to appear (registration successful)
          await page.waitForLoadState('networkidle')

          const registrationSucceeded = await page
            .getByTestId('user-menu-button')
            .isVisible({ timeout: 10000 })
            .catch(() => false)

          if (registrationSucceeded) {
            console.log('Test user registered successfully')
            // Ensure user is verified via dev endpoint
            try {
              const verifyResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: TEST_USER_EMAIL,
                  password: TEST_USER_PASSWORD,
                  role: 'user',
                  is_admin: false,
                  is_verified: true,
                  is_active: true,
                }),
              })
              if (verifyResponse.ok) {
                console.log('Test user verified successfully via dev endpoint')
              }
            } catch (_e) {
              console.log('Could not verify test user via dev endpoint (non-critical)')
            }
          } else {
            // Check for error message
            const regErrorMessage = page.locator('.auth-error')
            if (await regErrorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
              const regErrorText = await regErrorMessage.textContent()
              console.log(`Test user registration failed: ${regErrorText}`)
              if (regErrorText?.includes('already registered')) {
                console.log('Test user already exists. Attempting to update via dev endpoint...')
                // Try to update user via dev endpoint
                try {
                  const updateResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: TEST_USER_EMAIL,
                      password: TEST_USER_PASSWORD,
                      role: 'user',
                      is_admin: false,
                      is_verified: true,
                      is_active: true,
                    }),
                  })
                  if (updateResponse.ok) {
                    console.log('Test user updated successfully via dev endpoint')
                  } else {
                    const errorText = await updateResponse.text()
                    console.log(`Failed to update test user: ${errorText}`)
                  }
                } catch (e) {
                  console.log(`Could not update test user via dev endpoint: ${e}`)
                }
              }
            } else {
              const responseStatus = registerResponse ? registerResponse.status() : 'No response'
              console.log(`Test user registration status unclear. Response: ${responseStatus}`)
              console.log('Attempting to create user via dev endpoint...')
              // Try to create user directly via dev endpoint
              try {
                const createResponse = await fetch(`${backendURL}/api/dev/create-test-user`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: TEST_USER_EMAIL,
                    password: TEST_USER_PASSWORD,
                    role: 'user',
                    is_admin: false,
                    is_verified: true,
                    is_active: true,
                  }),
                })
                if (createResponse.ok) {
                  console.log('Test user created successfully via dev endpoint')
                } else {
                  const errorText = await createResponse.text()
                  console.log(`Failed to create test user: ${errorText}`)
                }
              } catch (e) {
                console.log(`Could not create test user via dev endpoint: ${e}`)
              }
            }
          }
        } catch (error) {
          console.log(
            'Test user registration failed (non-critical):',
            error instanceof Error ? error.message : String(error)
          )
          console.log('Tests will continue - test user may need to be created manually')
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
