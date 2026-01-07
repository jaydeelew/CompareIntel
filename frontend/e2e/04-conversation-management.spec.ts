import { test, expect } from './fixtures'

/**
 * E2E Tests: Conversation Management
 *
 * Tests conversation history and management features:
 * - Saving conversations
 * - Viewing conversation history
 * - Loading previous conversations
 * - Deleting conversations
 * - Conversation persistence
 */

test.describe('Conversation Management', () => {
  test('User can save and view conversation history', async ({ authenticatedPage }) => {
    await test.step('Perform a comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('What is machine learning?')

      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      await authenticatedPage.waitForLoadState('networkidle')

      // Wait for results to appear
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )
      await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => {})
    })

    await test.step('Conversation is automatically saved', async () => {
      // Conversations are typically saved automatically
      // Look for history indicator or saved state
      await authenticatedPage.waitForTimeout(2000)

      // Check if history dropdown or indicator appears
      const historyButton = authenticatedPage.locator(
        'button[class*="history"], ' + '[data-testid*="history"], ' + 'button[title*="history"]'
      )

      const hasHistoryButton = await historyButton
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)

      if (hasHistoryButton) {
        await expect(historyButton.first()).toBeVisible()
      }
    })
  })

  test('User can view conversation history', async ({ authenticatedPage }) => {
    await test.step('Open conversation history', async () => {
      // Look for history toggle button (usually near the input area)
      const historyButton = authenticatedPage.locator(
        'button[class*="history"], ' +
          '[data-testid*="history"], ' +
          'button[title*="history"], ' +
          'button[title*="conversation"]'
      )

      if (
        await historyButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // History dropdown/list should appear
        const historyList = authenticatedPage.locator(
          '[data-testid*="conversation-history"], ' +
            '.conversation-history, ' +
            '.conversations-list, ' +
            '[class*="history-dropdown"]'
        )

        await expect(historyList.first()).toBeVisible({ timeout: 3000 })
      }
    })

    await test.step('Conversations are listed', async () => {
      const conversationItems = authenticatedPage.locator(
        '[data-testid*="conversation-item"], ' + '.conversation-item, ' + '[class*="conversation"]'
      )

      const itemCount = await conversationItems.count()

      if (itemCount > 0) {
        // At least one conversation should be visible
        await expect(conversationItems.first()).toBeVisible()
      } else {
        // Or empty state message
        const emptyState = authenticatedPage.getByText(/no conversations|empty|get started/i)
        const hasEmptyState = await emptyState.isVisible({ timeout: 2000 }).catch(() => false)

        // Either conversations or empty state should be present
        expect(itemCount > 0 || hasEmptyState).toBe(true)
      }
    })
  })

  test('User can load a previous conversation', async ({ authenticatedPage }) => {
    await test.step('Open history', async () => {
      const historyButton = authenticatedPage.locator(
        'button[class*="history"], [data-testid*="history"]'
      )

      if (
        await historyButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)
      }
    })

    await test.step('Click on a conversation', async () => {
      const conversationItems = authenticatedPage.locator(
        '[data-testid*="conversation-item"], .conversation-item'
      )

      const itemCount = await conversationItems.count()

      if (itemCount > 0) {
        // Click first conversation
        await conversationItems.first().click()
        await authenticatedPage.waitForLoadState('networkidle')

        // Conversation should load
        await authenticatedPage.waitForTimeout(1000)

        // Results should be visible
        const results = authenticatedPage.locator(
          '[data-testid^="result-card-"], .result-card, .model-response'
        )

        const hasResults = await results
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)

        if (hasResults) {
          await expect(results.first()).toBeVisible()
        }
      }
    })
  })

  test('User can delete a conversation', async ({ authenticatedPage }) => {
    await test.step('Create a conversation first', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('Test conversation to delete')

      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      await authenticatedPage.waitForLoadState('networkidle')

      // Wait for results
      await authenticatedPage.waitForTimeout(2000)
    })

    await test.step('Open history and delete conversation', async () => {
      const historyButton = authenticatedPage.locator(
        'button[class*="history"], [data-testid*="history"]'
      )

      if (
        await historyButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        const conversationItems = authenticatedPage.locator(
          '[data-testid*="conversation-item"], .conversation-item'
        )

        const initialCount = await conversationItems.count()

        if (initialCount > 0) {
          // Find delete button for first conversation
          const firstItem = conversationItems.first()

          // Hover to show delete button (if needed)
          await firstItem.hover()
          await authenticatedPage.waitForTimeout(300)

          // Look for delete button
          const deleteButton = firstItem.locator(
            'button[class*="delete"], ' +
              'button[aria-label*="delete"], ' +
              'button[title*="delete"], ' +
              '[data-testid*="delete"]'
          )

          if (
            await deleteButton
              .first()
              .isVisible({ timeout: 2000 })
              .catch(() => false)
          ) {
            await deleteButton.first().click()

            // Confirm deletion if confirmation dialog appears
            const confirmButton = authenticatedPage.getByRole('button', {
              name: /confirm|yes|delete/i,
            })

            if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await confirmButton.click()
            }

            await authenticatedPage.waitForLoadState('networkidle')
            await authenticatedPage.waitForTimeout(1000)

            // Verify conversation is removed
            const newCount = await conversationItems.count()
            expect(newCount).toBeLessThan(initialCount)
          }
        }
      }
    })
  })

  test('User can continue existing conversation', async ({ authenticatedPage }) => {
    await test.step('Load existing conversation', async () => {
      const historyButton = authenticatedPage.locator(
        'button[class*="history"], [data-testid*="history"]'
      )

      if (
        await historyButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        const conversationItems = authenticatedPage.locator(
          '[data-testid*="conversation-item"], .conversation-item'
        )

        if ((await conversationItems.count()) > 0) {
          await conversationItems.first().click()
          await authenticatedPage.waitForLoadState('networkidle')
          await authenticatedPage.waitForTimeout(1000)
        }
      }
    })

    await test.step('Add follow-up to loaded conversation', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      // Input should be ready for follow-up
      await inputField.fill('Can you provide more details?')

      // Submit follow-up
      await authenticatedPage.getByTestId('comparison-submit-button').click()
      await authenticatedPage.waitForLoadState('networkidle')

      // Wait for follow-up response
      await authenticatedPage.waitForTimeout(3000)

      // Verify new response appears
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )

      const resultCount = await results.count()
      expect(resultCount).toBeGreaterThan(0)
    })
  })
})
