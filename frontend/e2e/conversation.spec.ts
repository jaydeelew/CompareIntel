import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Conversation Management
 *
 * Tests conversation-related functionality:
 * - Creating conversations
 * - Viewing conversation history
 * - Loading previous conversations
 * - Deleting conversations
 */

test.describe('Conversation Management', () => {
  // Test credentials (you might want to use a test fixture for this)
  const testEmail = 'test-conversation@example.com'
  const testPassword = 'TestPassword123!'

  test.beforeEach(async ({ page }) => {
    // For conversation tests, we need to be authenticated
    // In a real scenario, you'd use a test fixture to set up authenticated state

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check if already logged in
    const userMenu = page.getByRole('button', { name: /user|profile|account/i })
    const isLoggedIn = await userMenu.isVisible({ timeout: 2000 })

    if (!isLoggedIn) {
      // Login (simplified - in real tests, use fixtures)
      const loginButton = page.getByTestId('nav-sign-in-button')
      if (await loginButton.isVisible({ timeout: 2000 })) {
        await loginButton.click()
        await page.fill('input[type="email"]', testEmail)
        await page.fill('input[type="password"]', testPassword)
        await page.getByTestId('login-submit-button').click()
        await page.waitForLoadState('networkidle')
      }
    }
  })

  test('Create and save conversation', async ({ page }) => {
    await test.step('Perform comparison', async () => {
      // Enter input
      const inputField = page.locator('textarea, input[type="text"]').first()
      await expect(inputField).toBeVisible()

      const testInput = 'What are the benefits of renewable energy?'
      await inputField.fill(testInput)

      // Select models
      const modelCheckboxes = page.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      // Submit comparison
      const compareButton = page.getByRole('button', { name: /compare|submit|run/i })
      await compareButton.click()

      // Wait for results
      await page.waitForLoadState('networkidle')
      const results = page.locator('[data-testid="result"], .result-card, .model-response').first()
      await expect(results).toBeVisible({ timeout: 30000 })
    })

    await test.step('Verify conversation is saved', async () => {
      // Look for conversation history sidebar or panel
      const conversationHistory = page.locator(
        '[data-testid="conversation-history"], .conversation-history, .conversations-list'
      )

      if (await conversationHistory.isVisible({ timeout: 5000 })) {
        // Check if the new conversation appears in the list
        const conversationItems = conversationHistory.locator(
          '[data-testid="conversation-item"], .conversation-item'
        )
        await expect(conversationItems.first()).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test('View conversation history', async ({ page }) => {
    await test.step('Open conversation history', async () => {
      // Look for conversation history button/sidebar
      const historyButton = page.getByRole('button', { name: /history|conversations|saved/i })

      if (await historyButton.isVisible({ timeout: 2000 })) {
        await historyButton.click()
      }

      // Or look for sidebar that might be always visible
      const conversationHistory = page.locator(
        '[data-testid="conversation-history"], .conversation-history'
      )
      await expect(conversationHistory).toBeVisible({ timeout: 5000 })
    })

    await test.step('Verify conversations are listed', async () => {
      const conversationItems = page.locator(
        '[data-testid="conversation-item"], .conversation-item'
      )
      const count = await conversationItems.count()

      // Should have at least one conversation (or empty state)
      if (count > 0) {
        await expect(conversationItems.first()).toBeVisible()
      } else {
        // Check for empty state message
        const emptyState = page.getByText(/no conversations|empty|get started/i)
        await expect(emptyState).toBeVisible({ timeout: 2000 })
      }
    })
  })

  test('Load previous conversation', async ({ page }) => {
    await test.step('Open conversation history', async () => {
      const historyButton = page.getByRole('button', { name: /history|conversations/i })
      if (await historyButton.isVisible({ timeout: 2000 })) {
        await historyButton.click()
      }
    })

    await test.step('Click on a conversation', async () => {
      const conversationItems = page.locator(
        '[data-testid="conversation-item"], .conversation-item'
      )
      const count = await conversationItems.count()

      if (count > 0) {
        // Click first conversation
        await conversationItems.first().click()

        // Wait for conversation to load
        await page.waitForLoadState('networkidle')

        // Verify conversation content is displayed
        const conversationContent = page.locator(
          '[data-testid="conversation-content"], .conversation-messages'
        )
        await expect(conversationContent).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test('Delete conversation', async ({ page }) => {
    await test.step('Open conversation history', async () => {
      const historyButton = page.getByRole('button', { name: /history|conversations/i })
      if (await historyButton.isVisible({ timeout: 2000 })) {
        await historyButton.click()
      }
    })

    await test.step('Delete a conversation', async () => {
      const conversationItems = page.locator(
        '[data-testid="conversation-item"], .conversation-item'
      )
      const initialCount = await conversationItems.count()

      if (initialCount > 0) {
        // Hover over conversation item to show delete button
        const firstItem = conversationItems.first()
        await firstItem.hover()

        // Find delete button
        const deleteButton = firstItem.getByRole('button', { name: /delete|remove|trash/i })

        if (await deleteButton.isVisible({ timeout: 2000 })) {
          await deleteButton.click()

          // Confirm deletion if confirmation dialog appears
          const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i })
          if (await confirmButton.isVisible({ timeout: 2000 })) {
            await confirmButton.click()
          }

          // Wait for deletion to complete
          await page.waitForLoadState('networkidle')

          // Verify conversation is removed
          const newCount = await conversationItems.count()
          expect(newCount).toBeLessThan(initialCount)
        }
      }
    })
  })

  test('Continue conversation with follow-up', async ({ page }) => {
    await test.step('Load existing conversation', async () => {
      const historyButton = page.getByRole('button', { name: /history|conversations/i })
      if (await historyButton.isVisible({ timeout: 2000 })) {
        await historyButton.click()
      }

      const conversationItems = page.locator(
        '[data-testid="conversation-item"], .conversation-item'
      )
      if ((await conversationItems.count()) > 0) {
        await conversationItems.first().click()
        await page.waitForLoadState('networkidle')
      }
    })

    await test.step('Add follow-up message', async () => {
      const inputField = page.locator('textarea, input[type="text"]').first()
      await expect(inputField).toBeVisible()

      const followUpInput = 'Can you provide more details?'
      await inputField.fill(followUpInput)

      // Select models
      const modelCheckboxes = page.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      // Submit follow-up
      const compareButton = page.getByRole('button', { name: /compare|submit|run/i })
      await compareButton.click()

      // Wait for response
      await page.waitForLoadState('networkidle')

      // Verify new response is added to conversation
      const messages = page.locator('[data-testid="message"], .message, .conversation-message')
      const messageCount = await messages.count()
      expect(messageCount).toBeGreaterThan(1) // Should have original + follow-up
    })
  })
})
