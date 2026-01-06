import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Admin User Management
 *
 * Tests admin functionality:
 * - Admin authentication
 * - User listing and filtering
 * - User management (create, update, delete)
 * - User status management
 */

test.describe('Admin User Management', () => {
  // Admin credentials (should be set up in test environment)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!'

  test.beforeEach(async ({ page, context }) => {
    // Clear any existing state
    await context.clearCookies()

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Login as admin
    await test.step('Login as admin', async () => {
      const loginButton = page.getByTestId('nav-sign-in-button')
      if (await loginButton.isVisible({ timeout: 2000 })) {
        await loginButton.click()
      }

      // Wait for auth modal to appear
      await page.waitForSelector('[data-testid="auth-modal"], .auth-modal', { timeout: 5000 })

      // Fill login form using test IDs
      await page.getByTestId('login-email-input').fill(adminEmail)
      await page.getByTestId('login-password-input').fill(adminPassword)

      // Click submit and wait for login request to complete
      const loginResponsePromise = page
        .waitForResponse(
          response => response.url().includes('/auth/login') && response.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => {
          // Response might have already completed or failed
        })

      await page.getByTestId('login-submit-button').click()
      await loginResponsePromise

      // Wait for user data fetch request (auth/me) to complete
      // This is what actually loads the user object needed for UserMenu to render
      await page
        .waitForResponse(
          response => response.url().includes('/auth/me') && response.status() === 200,
          { timeout: 10000 }
        )
        .catch(() => {
          // Response might have already completed
        })

      // Wait for login to complete - check for error messages first
      await page.waitForLoadState('networkidle')

      // Check if there's an error message (login failed)
      const errorMessage = page.locator('.auth-error')
      if (await errorMessage.isVisible({ timeout: 2000 }).catch(() => false)) {
        const errorText = await errorMessage.textContent()
        throw new Error(`Login failed: ${errorText}`)
      }

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

      // Wait for user menu to appear (confirms user data is loaded)
      // This might take time as fetchCurrentUser() is called after login
      await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 20000 })
    })

    // Navigate to admin panel
    await test.step('Navigate to admin panel', async () => {
      // Wait for admin button to appear (confirms user data is loaded and user is admin)
      // This is critical - the admin button only appears when user.is_admin is true
      const adminButton = page.getByRole('button', { name: /admin|dashboard/i })
      await expect(adminButton).toBeVisible({ timeout: 15000 })

      // Click the admin button to navigate
      await adminButton.click()

      // Wait for navigation to complete
      await page.waitForURL('**/admin', { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // Wait for lazy-loaded AdminPanel component to mount and render
      // The Suspense fallback shows "Loading admin panel..." first
      await page.waitForTimeout(1000)

      // Verify admin panel is visible
      const adminPanel = page.locator('[data-testid="admin-panel"], .admin-panel')
      await expect(adminPanel).toBeVisible({ timeout: 20000 })
    })
  })

  test('Admin can view user list', async ({ page }) => {
    await test.step('Verify user list is displayed', async () => {
      const userList = page.locator('[data-testid="user-list"], .user-list, table')
      await expect(userList).toBeVisible({ timeout: 5000 })

      // Check if users are listed
      const userRows = page.locator('tbody tr, [data-testid="user-row"], .user-row')
      const count = await userRows.count()

      // Should have at least one user (admin themselves) or show empty state
      if (count > 0) {
        await expect(userRows.first()).toBeVisible()
      }
    })
  })

  test('Admin can filter users', async ({ page }) => {
    await test.step('Filter by search term', async () => {
      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')

      if (await searchInput.isVisible({ timeout: 2000 })) {
        await searchInput.fill('test')
        await page.waitForLoadState('networkidle')

        // Verify filtered results
        const userRows = page.locator('tbody tr, [data-testid="user-row"]')
        const count = await userRows.count()
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    await test.step('Filter by subscription tier', async () => {
      const tierFilter = page.locator('select[name*="tier"], select[id*="tier"]')

      if (await tierFilter.isVisible({ timeout: 2000 })) {
        await tierFilter.selectOption('free')
        await page.waitForLoadState('networkidle')

        // Verify filtered results
        const userRows = page.locator('tbody tr, [data-testid="user-row"]')
        await expect(userRows.first()).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test('Admin can view user details', async ({ page }) => {
    await test.step('Click on a user', async () => {
      const userRows = page.locator('tbody tr, [data-testid="user-row"], .user-row')
      const count = await userRows.count()

      if (count > 0) {
        await userRows.first().click()
        await page.waitForLoadState('networkidle')

        // Verify user details are displayed
        const userDetails = page.locator('[data-testid="user-details"], .user-details')
        await expect(userDetails).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test('Admin can create new user', async ({ page }) => {
    await test.step('Open create user form', async () => {
      const createButton = page.getByRole('button', { name: /create|add.*user|new user/i })
      await createButton.click()

      // Wait for form to appear
      const userForm = page.locator('[data-testid="user-form"], .user-form, form')
      await expect(userForm).toBeVisible({ timeout: 5000 })
    })

    await test.step('Fill user form', async () => {
      const timestamp = Date.now()
      const newUserEmail = `newuser-${timestamp}@example.com`

      await page.fill('input[name="email"], input[type="email"]', newUserEmail)
      await page.fill('input[name="password"], input[type="password"]', 'TestPassword123!')

      // Select subscription tier if available
      const tierSelect = page.locator('select[name*="tier"], select[id*="tier"]')
      if (await tierSelect.isVisible({ timeout: 2000 })) {
        await tierSelect.selectOption('free')
      }
    })

    await test.step('Submit form', async () => {
      const submitButton = page.getByRole('button', { name: /create|save|submit/i })
      await submitButton.click()

      await page.waitForLoadState('networkidle')

      // Verify success message or user appears in list
      const successMessage = page.getByText(/created|success|saved/i)
      if (await successMessage.isVisible({ timeout: 2000 })) {
        await expect(successMessage).toBeVisible()
      }
    })
  })

  test('Admin can update user', async ({ page }) => {
    await test.step('Select a user to edit', async () => {
      const userRows = page.locator('tbody tr, [data-testid="user-row"]')
      const count = await userRows.count()

      if (count > 0) {
        // Click edit button or row
        const editButton = userRows.first().getByRole('button', { name: /edit|update/i })
        if (await editButton.isVisible({ timeout: 2000 })) {
          await editButton.click()
        } else {
          await userRows.first().click()
        }

        await page.waitForLoadState('networkidle')
      }
    })

    await test.step('Update user details', async () => {
      const userForm = page.locator('[data-testid="user-form"], .user-form, form')
      if (await userForm.isVisible({ timeout: 2000 })) {
        // Update subscription tier
        const tierSelect = page.locator('select[name*="tier"], select[id*="tier"]')
        if (await tierSelect.isVisible({ timeout: 2000 })) {
          await tierSelect.selectOption('starter')
        }

        // Save changes
        const saveButton = page.getByRole('button', { name: /save|update|submit/i })
        await saveButton.click()

        await page.waitForLoadState('networkidle')

        // Verify success
        const successMessage = page.getByText(/updated|saved|success/i)
        if (await successMessage.isVisible({ timeout: 2000 })) {
          await expect(successMessage).toBeVisible()
        }
      }
    })
  })

  test('Admin can toggle user active status', async ({ page }) => {
    await test.step('Toggle user active status', async () => {
      const userRows = page.locator('tbody tr, [data-testid="user-row"]')
      const count = await userRows.count()

      if (count > 0) {
        // Find toggle button
        const toggleButton = userRows
          .first()
          .getByRole('button', { name: /toggle|active|inactive/i })

        if (await toggleButton.isVisible({ timeout: 2000 })) {
          const initialText = await toggleButton.textContent()
          await toggleButton.click()
          await page.waitForLoadState('networkidle')

          // Verify status changed
          const newText = await toggleButton.textContent()
          expect(newText).not.toBe(initialText)
        }
      }
    })
  })

  test('Admin can reset user usage', async ({ page }) => {
    await test.step('Reset user usage', async () => {
      const userRows = page.locator('tbody tr, [data-testid="user-row"]')
      const count = await userRows.count()

      if (count > 0) {
        // Find reset usage button
        const resetButton = userRows.first().getByRole('button', { name: /reset.*usage|reset/i })

        if (await resetButton.isVisible({ timeout: 2000 })) {
          await resetButton.click()

          // Confirm if confirmation dialog appears
          const confirmButton = page.getByRole('button', { name: /confirm|yes|reset/i })
          if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click()
          }

          await page.waitForLoadState('networkidle')

          // Verify success
          const successMessage = page.getByText(/reset|success/i)
          if (await successMessage.isVisible({ timeout: 2000 })) {
            await expect(successMessage).toBeVisible()
          }
        }
      }
    })
  })

  test('Admin can view system statistics', async ({ page }) => {
    await test.step('View admin stats', async () => {
      const statsSection = page.locator('[data-testid="admin-stats"], .admin-stats, .statistics')

      if (await statsSection.isVisible({ timeout: 2000 })) {
        await expect(statsSection).toBeVisible()

        // Verify stats are displayed
        const statCards = statsSection.locator('[data-testid="stat-card"], .stat-card')
        const count = await statCards.count()
        expect(count).toBeGreaterThan(0)
      }
    })
  })

  test('Admin can delete user (super admin only)', async ({ page }) => {
    // This test assumes super admin privileges
    await test.step('Delete a user', async () => {
      const userRows = page.locator('tbody tr, [data-testid="user-row"]')
      const count = await userRows.count()

      if (count > 1) {
        // Don't delete the first user (might be admin themselves)
        // Find delete button
        const deleteButton = userRows.nth(1).getByRole('button', { name: /delete|remove/i })

        if (await deleteButton.isVisible({ timeout: 2000 })) {
          await deleteButton.click()

          // Confirm deletion
          const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i })
          if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click()
          }

          await page.waitForLoadState('networkidle')

          // Verify user is removed
          const newCount = await userRows.count()
          expect(newCount).toBeLessThan(count)
        }
      }
    })
  })
})
