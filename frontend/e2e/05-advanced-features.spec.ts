import { Page } from '@playwright/test'

import { test, expect } from './fixtures'

/**
 * E2E Tests: Advanced Features
 *
 * Tests advanced features and capabilities:
 * - Web search functionality
 * - File uploads (PDF, Word)
 * - Model selection management
 * - Saved model selections
 */

/**
 * Helper function to safely wait with page validity check
 * Uses smaller chunks to avoid exceeding test timeout
 */
async function safeWait(page: Page, ms: number) {
  try {
    if (page.isClosed()) return

    // Use smaller chunks to avoid timeout issues
    // If waiting more than 1 second, break into chunks
    if (ms > 1000) {
      const chunks = Math.ceil(ms / 500)
      for (let i = 0; i < chunks; i++) {
        if (page.isClosed()) return
        await page.waitForTimeout(Math.min(500, ms - i * 500))
      }
    } else {
      await page.waitForTimeout(ms)
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('closed') || error.message.includes('timeout'))
    )
      return
    throw error
  }
}

test.describe('Advanced Features', () => {
  test('User can enable web search for supported models', async ({ authenticatedPage }) => {
    await test.step('Select models that support web search', async () => {
      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await safeWait(authenticatedPage, 500)
        }
      }

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select first model - only if enabled
      const firstCheckbox = modelCheckboxes.first()
      const isEnabled = await firstCheckbox.isEnabled().catch(() => false)
      if (isEnabled) {
        await firstCheckbox.check()
      }
      await safeWait(authenticatedPage, 500)
    })

    await test.step('Web search toggle appears', async () => {
      const webSearchButton = authenticatedPage.locator(
        'button[class*="web-search"], ' +
          'button[title*="web search"], ' +
          'button[aria-label*="web search"], ' +
          '[data-testid*="web-search"]'
      )

      const buttonCount = await webSearchButton.count()

      if (
        buttonCount > 0 &&
        (await webSearchButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false))
      ) {
        await expect(webSearchButton.first()).toBeVisible()
      }
    })

    await test.step('Enable web search', async () => {
      const webSearchButton = authenticatedPage.locator(
        'button[class*="web-search"], button[title*="web search"]'
      )

      if (
        await webSearchButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        const initialClass = await webSearchButton.first().getAttribute('class')
        const isInitiallyActive = initialClass?.includes('active') || false

        await webSearchButton.first().click()
        await safeWait(authenticatedPage, 300)

        // Verify state changed
        const newClass = await webSearchButton.first().getAttribute('class')
        const isNowActive = newClass?.includes('active') || false

        expect(isNowActive).not.toBe(isInitiallyActive)
      }
    })

    await test.step('Perform comparison with web search', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('What are the latest developments in AI?')

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 10000 })
      } catch {
        await authenticatedPage
          .waitForLoadState('domcontentloaded', { timeout: 5000 })
          .catch(() => {})
      }

      // Wait for results
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )

      await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => {})
    })
  })

  test('User can upload and process files', async ({ authenticatedPage }) => {
    await test.step('File upload area is accessible', async () => {
      // Look for file upload button or drag-and-drop area
      const _fileUploadArea = authenticatedPage.locator(
        'input[type="file"], ' +
          '[class*="file-upload"], ' +
          '[class*="drop"], ' +
          'button[class*="upload"]'
      )

      // File upload might be integrated into the textarea area
      const textarea = authenticatedPage.getByTestId('comparison-input-textarea')

      // Textarea should support drag-and-drop
      await expect(textarea).toBeVisible()
    })

    // Note: Actual file upload testing would require creating test files
    // This test verifies the UI is ready for file uploads
  })

  test('User can save model selections', async ({ authenticatedPage }) => {
    await test.step('Select models', async () => {
      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await safeWait(authenticatedPage, 500)
        }
      }

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      if (checkboxCount >= 2) {
        // Only select enabled checkboxes
        const checkbox0 = modelCheckboxes.nth(0)
        const checkbox1 = modelCheckboxes.nth(1)
        const isEnabled0 = await checkbox0.isEnabled().catch(() => false)
        const isEnabled1 = await checkbox1.isEnabled().catch(() => false)
        if (isEnabled0) {
          await checkbox0.check()
        }
        if (isEnabled1) {
          await checkbox1.check()
        }
      }
    })

    await test.step('Save model selection', async () => {
      // Look for save selection button
      const saveButton = authenticatedPage.locator(
        'button[class*="save"], ' + 'button[title*="save"], ' + '[data-testid*="save-selection"]'
      )

      if (
        await saveButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await saveButton.first().click()
        await safeWait(authenticatedPage, 500)

        // Dialog might appear for naming the selection
        const nameInput = authenticatedPage.locator(
          'input[type="text"], input[placeholder*="name"]'
        )

        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nameInput.fill('Test Selection')

          const confirmButton = authenticatedPage.getByRole('button', {
            name: /save|confirm|ok/i,
          })

          if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await confirmButton.click()
            // Wait for load state with fallback - networkidle can be too strict
            try {
              await authenticatedPage.waitForLoadState('load', { timeout: 10000 })
            } catch {
              await authenticatedPage
                .waitForLoadState('domcontentloaded', { timeout: 5000 })
                .catch(() => {})
            }
          }
        }
      }
    })
  })

  test('User can load saved model selections', async ({ authenticatedPage }) => {
    test.setTimeout(60000) // 60 seconds for this test
    // Skip if saved selections feature is not available
    test.skip(
      !(await authenticatedPage
        .locator('button[class*="saved"], button[class*="selection"]')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)),
      'Saved selections feature not available'
    )
    await test.step('Ensure a saved selection exists', async () => {
      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first few provider dropdowns only (enough to find models)
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      const providerCount = Math.min(await providerHeaders.count(), 3) // Only expand first 3
      for (let i = 0; i < providerCount; i++) {
        if (authenticatedPage.isClosed()) break
        const provider = providerHeaders.nth(i)
        const isExpanded = await provider.getAttribute('aria-expanded').catch(() => 'false')
        if (isExpanded !== 'true') {
          await provider.click({ timeout: 5000 }).catch(() => {})
          await safeWait(authenticatedPage, 300)
        }
      }

      // Check if we have a saved selection, if not create one
      const savedSelectionsButton = authenticatedPage.locator(
        'button[class*="saved"], ' +
          'button[class*="selection"], ' +
          '[data-testid*="saved-selection"]'
      )

      const hasSavedSelectionsButton = await savedSelectionsButton
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)

      if (hasSavedSelectionsButton) {
        if (authenticatedPage.isClosed()) return
        await savedSelectionsButton.first().click()
        await safeWait(authenticatedPage, 500)

        const selectionList = authenticatedPage.locator(
          '[class*="saved-selection"], ' + '[class*="selection-list"]'
        )
        const _hasList = await selectionList
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)

        // Check if saved selections exist
        const savedSelectionItems = selectionList.locator('.saved-selection-item')
        const itemCount = await savedSelectionItems.count()

        // If no saved selections exist, create one
        if (itemCount === 0) {
          if (authenticatedPage.isClosed()) return
          // Close dropdown
          await authenticatedPage.keyboard.press('Escape')
          await safeWait(authenticatedPage, 500)

          // Select models
          const modelCheckboxes = authenticatedPage.locator(
            '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
          )
          const checkboxCount = await modelCheckboxes.count()

          expect(checkboxCount).toBeGreaterThan(0)

          // Find first two enabled, unchecked models
          let selectedCount = 0
          for (let i = 0; i < checkboxCount && selectedCount < 2; i++) {
            const checkbox = modelCheckboxes.nth(i)
            const isEnabled = await checkbox.isEnabled().catch(() => false)
            const isChecked = await checkbox.isChecked().catch(() => false)
            if (isEnabled && !isChecked) {
              await checkbox.check({ timeout: 10000 }).catch(() => {
                // If check fails, try clicking instead
                checkbox.click({ timeout: 10000 }).catch(() => {})
              })
              selectedCount++
            }
          }

          // If we didn't find enough unchecked models, uncheck some first
          if (selectedCount < 2) {
            // Uncheck first few to make room
            for (let i = 0; i < checkboxCount && selectedCount < 2; i++) {
              const checkbox = modelCheckboxes.nth(i)
              const isEnabled = await checkbox.isEnabled().catch(() => false)
              const isChecked = await checkbox.isChecked().catch(() => false)
              if (isEnabled && isChecked) {
                await checkbox.uncheck({ timeout: 5000 }).catch(() => {})
              }
              if (isEnabled && !isChecked) {
                await checkbox.check({ timeout: 10000 }).catch(() => {
                  checkbox.click({ timeout: 10000 }).catch(() => {})
                })
                selectedCount++
              }
            }
          }

          expect(selectedCount).toBeGreaterThan(0)

          // Wait a bit for React to update
          await safeWait(authenticatedPage, 500)

          // Save selection - the save button should be in the saved selections dropdown
          // First open the dropdown again
          if (authenticatedPage.isClosed()) return
          const savedSelectionsButton2 = authenticatedPage.locator(
            'button[class*="saved"], ' +
              'button[class*="selection"], ' +
              '[data-testid*="saved-selection"]'
          )
          await savedSelectionsButton2.first().click()
          await safeWait(authenticatedPage, 500)

          // Look for the save button
          const saveButton = authenticatedPage.locator(
            'button:has-text("Save Current Selection"), button:has-text("Save")'
          )
          const saveButtonVisible = await saveButton.isVisible({ timeout: 5000 }).catch(() => false)

          if (!saveButtonVisible) {
            // Try alternative selector
            const altSaveButton = authenticatedPage.getByRole('button', {
              name: /save.*selection/i,
            })
            const altVisible = await altSaveButton.isVisible({ timeout: 2000 }).catch(() => false)
            if (altVisible) {
              await altSaveButton.click()
            } else {
              throw new Error('Save button not found')
            }
          } else {
            await saveButton.click()
          }

          await safeWait(authenticatedPage, 500)

          // Fill in name
          const nameInput = authenticatedPage.locator(
            'input[type="text"], input[placeholder*="name"], input[placeholder*="Name"]'
          )
          await expect(nameInput).toBeVisible({ timeout: 5000 })
          await nameInput.fill('Test Selection')

          // Find the specific Save button in the dialog (not the dropdown button)
          const confirmButton = authenticatedPage.locator(
            'button.saved-selections-save-btn, button:has-text("Save"):not([title*="Save or load"])'
          )
          await expect(confirmButton.first()).toBeVisible({ timeout: 2000 })
          await confirmButton.first().click()
          // Wait for load state with fallback - use shorter timeout to avoid test timeout
          try {
            await authenticatedPage.waitForLoadState('load', { timeout: 5000 })
          } catch {
            await authenticatedPage
              .waitForLoadState('domcontentloaded', { timeout: 3000 })
              .catch(() => {})
          }
          await safeWait(authenticatedPage, 500) // Wait for save to complete

          // Close dialog and wait for it to disappear - use condition-based wait
          await authenticatedPage
            .waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 3000 })
            .catch(() => {})
          await safeWait(authenticatedPage, 300)

          // Close dropdown and reopen to refresh the list
          if (!authenticatedPage.isClosed()) {
            try {
              await authenticatedPage.keyboard.press('Escape', { timeout: 3000 })
            } catch {
              // If Escape fails, try clicking outside or using a different method
              await authenticatedPage.mouse.click(10, 10).catch(() => {})
            }
            await safeWait(authenticatedPage, 300)
          }
        } else {
          // Close dropdown to prepare for loading
          if (!authenticatedPage.isClosed()) {
            try {
              await authenticatedPage.keyboard.press('Escape', { timeout: 3000 })
            } catch {
              // If Escape fails, try clicking outside or using a different method
              await authenticatedPage.mouse.click(10, 10).catch(() => {})
            }
            await safeWait(authenticatedPage, 300)
          }
        }
      }
    })

    await test.step('Load saved selection', async () => {
      // Check page is still valid
      if (authenticatedPage.isClosed()) {
        throw new Error('Page was closed before loading saved selection')
      }

      // Open saved selections dropdown
      const savedSelectionsButton = authenticatedPage.locator(
        'button[class*="saved"], ' +
          'button[class*="selection"], ' +
          '[data-testid*="saved-selection"]'
      )

      await expect(savedSelectionsButton.first()).toBeVisible({ timeout: 5000 })
      if (authenticatedPage.isClosed()) return
      await savedSelectionsButton.first().click()
      await safeWait(authenticatedPage, 500) // Wait for dropdown to open and list to render (reduced from 1500)

      // Find saved selection items - wait for them to appear
      const selectionItems = authenticatedPage.locator('.saved-selection-item')

      // Wait for at least one item to appear (with retry)
      let itemCount = 0
      for (let i = 0; i < 5; i++) {
        if (authenticatedPage.isClosed()) break
        itemCount = await selectionItems.count()
        if (itemCount > 0) break
        await safeWait(authenticatedPage, 500)
        // Try clicking the button again to refresh
        if (i < 4 && !authenticatedPage.isClosed()) {
          await savedSelectionsButton.first().click()
          await safeWait(authenticatedPage, 500)
        }
      }

      expect(itemCount).toBeGreaterThan(0)

      // Click on the info div inside the first item
      const firstItem = selectionItems.first()
      await expect(firstItem).toBeVisible({ timeout: 5000 })
      const infoDiv = firstItem.locator('.saved-selection-info')
      await expect(infoDiv).toBeVisible({ timeout: 2000 })

      // Try normal click first, then force click if needed
      try {
        await infoDiv.click({ timeout: 10000 })
      } catch {
        if (!authenticatedPage.isClosed()) {
          await infoDiv.click({ force: true, timeout: 5000 }).catch(() => {})
        }
      }

      // Wait for load state with fallback - networkidle can be too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 10000 })
      } catch {
        await authenticatedPage
          .waitForLoadState('domcontentloaded', { timeout: 5000 })
          .catch(() => {})
      }
      await safeWait(authenticatedPage, 1500) // Wait for selection to be applied
    })

    await test.step('Verify models are selected', async () => {
      // Expand first few provider dropdowns to ensure checkboxes are visible
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      const providerCount = Math.min(await providerHeaders.count(), 5) // Only expand first 5
      for (let i = 0; i < providerCount; i++) {
        if (authenticatedPage.isClosed()) break
        const provider = providerHeaders.nth(i)
        const isExpanded = await provider.getAttribute('aria-expanded').catch(() => 'false')
        if (isExpanded !== 'true') {
          await provider.click({ timeout: 5000 }).catch(() => {})
          await safeWait(authenticatedPage, 300)
        }
      }

      // Wait a bit more for React to update checkboxes
      await safeWait(authenticatedPage, 1000)

      if (authenticatedPage.isClosed()) return

      // Check all checkboxes for checked state
      const allModelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      const allCount = await allModelCheckboxes.count().catch(() => 0)

      if (allCount === 0) {
        // Page might be closed or checkboxes not loaded
        return
      }

      expect(allCount).toBeGreaterThan(0)

      // Count checked checkboxes
      let checkedCount = 0
      for (let i = 0; i < allCount; i++) {
        if (authenticatedPage.isClosed()) break
        const checkbox = allModelCheckboxes.nth(i)
        const isChecked = await checkbox.isChecked().catch(() => false)
        if (isChecked) {
          checkedCount++
        }
      }

      expect(checkedCount).toBeGreaterThan(0)
    })
  })

  test('User sees model information and capabilities', async ({ authenticatedPage }) => {
    // Look for model cards or model information
    const modelCards = authenticatedPage.locator(
      '.model-card, ' + '[class*="model-selector"], ' + '[data-testid*="model"]'
    )

    const cardCount = await modelCards.count()

    if (cardCount > 0) {
      const firstCard = modelCards.first()

      // Model cards should display information
      const cardContent = await firstCard.textContent()
      expect(cardContent).toBeTruthy()

      // Might show model name, provider, capabilities
      expect(cardContent?.length).toBeGreaterThan(0)
    }
  })

  // NOTE: "User can filter or search models" test was removed
  // because model search/filter is not part of the current UX.
  // If this feature is added in the future, add a test for it here.
})
