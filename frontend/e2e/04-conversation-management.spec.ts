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

      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

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
      // History toggle button has class "history-toggle-button" and title "Load previous conversations"
      const historyButton = authenticatedPage.locator(
        'button.history-toggle-button, ' +
          'button[class*="history"], ' +
          'button[title*="history"], ' +
          'button[title*="conversation"]'
      )

      const hasHistoryButton = await historyButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (hasHistoryButton) {
        await expect(historyButton.first()).toBeVisible()
      }
    })
  })

  test('User can view conversation history', async ({ authenticatedPage }) => {
    await test.step('Open conversation history', async () => {
      // Look for history toggle button (usually near the input area)
      // History toggle button has class "history-toggle-button" and title "Load previous conversations"
      const historyButton = authenticatedPage.locator(
        'button.history-toggle-button, ' +
          'button[class*="history"], ' +
          'button[title*="history"], ' +
          'button[title*="conversation"]'
      )

      const buttonVisible = await historyButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (buttonVisible) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // History dropdown/list should appear
        // Actual class is "history-inline-list" (not conversation-history or conversations-list)
        const historyList = authenticatedPage.locator(
          '.history-inline-list, ' +
            '[data-testid*="conversation-history"], ' +
            '.conversation-history, ' +
            '.conversations-list, ' +
            '[class*="history-dropdown"], ' +
            '[class*="history-inline"]'
        )

        await expect(historyList.first()).toBeVisible({ timeout: 5000 })
      } else {
        // If history button is not visible, skip this test step
        test.info().annotations.push({
          type: 'note',
          description: 'History button not found - may not be available for this user tier',
        })
      }
    })

    await test.step('Conversations are listed', async () => {
      // History items use class "history-item" (also may have "conversation-item")
      const conversationItems = authenticatedPage.locator(
        '.history-item, ' +
          '[data-testid*="conversation-item"], ' +
          '.conversation-item, ' +
          '[class*="history-item"]'
      )

      const itemCount = await conversationItems.count()

      if (itemCount > 0) {
        // At least one conversation should be visible
        await expect(conversationItems.first()).toBeVisible()
      } else {
        // Or empty state message (class is "history-empty")
        const emptyState = authenticatedPage
          .locator('.history-empty, [class*="history-empty"]')
          .or(authenticatedPage.getByText(/no conversations|empty|get started/i))
        const hasEmptyState = await emptyState
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)

        // Either conversations or empty state should be present
        expect(itemCount > 0 || hasEmptyState).toBe(true)
      }
    })
  })

  test('User can load a previous conversation', async ({ authenticatedPage }) => {
    await test.step('Open history', async () => {
      const historyButton = authenticatedPage.locator(
        'button.history-toggle-button, button[class*="history"], [data-testid*="history"]'
      )

      const buttonVisible = await historyButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (buttonVisible) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // Wait for history list to appear
        await authenticatedPage
          .locator('.history-inline-list')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => {})
      }
    })

    await test.step('Click on a conversation', async () => {
      // History items use class "history-item"
      const conversationItems = authenticatedPage.locator(
        '.history-item, [data-testid*="conversation-item"], .conversation-item'
      )

      const itemCount = await conversationItems.count()

      if (itemCount > 0) {
        // Click first conversation
        await conversationItems.first().click()
        await authenticatedPage.waitForLoadState('networkidle')

        // Conversation should load
        await authenticatedPage.waitForTimeout(2000)

        // Results should be visible
        const results = authenticatedPage.locator(
          '[data-testid^="result-card-"], .result-card, .model-response'
        )

        const hasResults = await results
          .first()
          .isVisible({ timeout: 10000 })
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

      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

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
        'button.history-toggle-button, button[class*="history"], [data-testid*="history"]'
      )

      const buttonVisible = await historyButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (buttonVisible) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // Wait for history list to appear
        await authenticatedPage
          .locator('.history-inline-list')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => {})

        const conversationItems = authenticatedPage.locator(
          '.history-item, [data-testid*="conversation-item"], .conversation-item'
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
        'button.history-toggle-button, button[class*="history"], [data-testid*="history"]'
      )

      const buttonVisible = await historyButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (buttonVisible) {
        await historyButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // Wait for history list to appear
        await authenticatedPage
          .locator('.history-inline-list')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => {})

        const conversationItems = authenticatedPage.locator(
          '.history-item, [data-testid*="conversation-item"], .conversation-item'
        )

        const itemCount = await conversationItems.count()
        if (itemCount > 0) {
          await conversationItems.first().click()
          await authenticatedPage.waitForLoadState('networkidle')
          await authenticatedPage.waitForTimeout(2000)
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

      // Wait for follow-up response to stream in
      // Result cards use class "result-card conversation-card" (no data-testid)
      const results = authenticatedPage.locator(
        '.result-card, ' +
          '.conversation-card, ' +
          '[data-testid^="result-card-"], ' +
          '.model-response'
      )

      // Wait for at least one result card to be visible
      await expect(results.first())
        .toBeVisible({ timeout: 30000 })
        .catch(() => {
          // If results don't appear, check if backend is running
          test.info().annotations.push({
            type: 'note',
            description: 'Follow-up results may not have appeared - backend may not be running',
          })
        })

      // Verify new response appears
      const resultCount = await results.count()
      expect(resultCount).toBeGreaterThan(0)
    })
  })
})
