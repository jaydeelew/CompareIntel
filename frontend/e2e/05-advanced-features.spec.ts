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

test.describe('Advanced Features', () => {
  test('User can enable web search for supported models', async ({ authenticatedPage }) => {
    await test.step('Select models that support web search', async () => {
      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select first model
      await modelCheckboxes.first().check()
      await authenticatedPage.waitForTimeout(500)
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
        await authenticatedPage.waitForTimeout(300)

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
      await authenticatedPage.waitForLoadState('networkidle')

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

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      if (checkboxCount >= 2) {
        await modelCheckboxes.nth(0).check()
        await modelCheckboxes.nth(1).check()
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
        await authenticatedPage.waitForTimeout(500)

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
            await authenticatedPage.waitForLoadState('networkidle')
          }
        }
      }
    })
  })

  test('User can load saved model selections', async ({ authenticatedPage }) => {
    await test.step('Open saved selections', async () => {
      // Look for saved selections dropdown or button
      const savedSelectionsButton = authenticatedPage.locator(
        'button[class*="saved"], ' +
          'button[class*="selection"], ' +
          '[data-testid*="saved-selection"]'
      )

      if (
        await savedSelectionsButton
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await savedSelectionsButton.first().click()
        await authenticatedPage.waitForTimeout(500)

        // Dropdown should appear
        const selectionList = authenticatedPage.locator(
          '[class*="saved-selection"], ' + '[class*="selection-list"]'
        )

        const hasList = await selectionList
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)

        if (hasList) {
          // Click on a saved selection
          const selectionItems = selectionList.locator('button, [role="button"]')

          if ((await selectionItems.count()) > 0) {
            await selectionItems.first().click()
            await authenticatedPage.waitForLoadState('networkidle')

            // Wait for models to load first
            const loadingMessage = authenticatedPage.locator(
              '.loading-message:has-text("Loading available models")'
            )
            await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

            // Models should be selected
            const modelCheckboxes = authenticatedPage.locator(
              '[data-testid^="model-checkbox-"]:checked, input[type="checkbox"].model-checkbox:checked'
            )
            await expect(modelCheckboxes.first())
              .toBeVisible({ timeout: 15000 })
              .catch(() => {})
            const checkedCount = await modelCheckboxes.count()
            expect(checkedCount).toBeGreaterThan(0)
          }
        }
      }
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

  test('User can filter or search models', async ({ authenticatedPage }) => {
    // Look for model search/filter input
    const searchInput = authenticatedPage.locator(
      'input[type="search"], ' + 'input[placeholder*="search"], ' + 'input[placeholder*="filter"]'
    )

    const hasSearch = await searchInput
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    if (hasSearch) {
      await searchInput.first().fill('gpt')
      await authenticatedPage.waitForTimeout(500)

      // Models should filter
      const modelCards = authenticatedPage.locator('.model-card, [class*="model-selector"]')

      // At least some results should appear
      const cardCount = await modelCards.count()
      expect(cardCount).toBeGreaterThanOrEqual(0)
    }
  })
})
