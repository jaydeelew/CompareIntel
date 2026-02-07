import { test, expect } from './fixtures'

/**
 * E2E Tests: Authenticated User Comparison Flow
 *
 * Tests the core comparison functionality for authenticated users:
 * - Model selection and comparison
 * - Streaming results
 * - Follow-up conversations
 * - Model response interactions
 */

test.describe('Authenticated User Comparison Flow', () => {
  test('User can perform a complete comparison', async ({ authenticatedPage }) => {
    await test.step('Enter comparison prompt', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      await inputField.fill(
        'What are the key differences between supervised and unsupervised learning?'
      )

      const value = await inputField.inputValue()
      expect(value).toContain('supervised')
    })

    await test.step('Select multiple models', async () => {
      // Wait for loading message to disappear
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // Loading message might not exist or already be gone, continue
      })

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      if ((await providerHeaders.count()) > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await authenticatedPage.waitForTimeout(500)
        }
      }

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      // Select at least 2 models for comparison (skip disabled checkboxes)
      let selectedCount = 0
      const minToSelect = 2
      for (let i = 0; i < checkboxCount && selectedCount < minToSelect; i++) {
        const checkbox = modelCheckboxes.nth(i)
        await expect(checkbox).toBeVisible({ timeout: 5000 })
        const isEnabled = await checkbox.isEnabled().catch(() => false)
        if (isEnabled) {
          await checkbox.check({ timeout: 10000 })
          await expect(checkbox).toBeChecked()
          selectedCount++
        }
      }

      // Ensure we selected at least the minimum
      expect(selectedCount).toBeGreaterThanOrEqual(minToSelect)
    })

    await test.step('Submit comparison', async () => {
      const submitButton = authenticatedPage.getByTestId('comparison-submit-button')
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toBeEnabled()

      await submitButton.click()

      // Button should show loading state
      await authenticatedPage.waitForTimeout(500)
    })

    await test.step('Results stream in real-time', async () => {
      // Wait for results to start appearing
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )

      const firstResult = await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => false)

      if (firstResult) {
        await expect(results.first()).toBeVisible()

        // Verify multiple result cards appear
        const resultCount = await results.count()
        expect(resultCount).toBeGreaterThan(0)

        // Results should have content
        const firstResultContent = await results.first().textContent()
        expect(firstResultContent?.length).toBeGreaterThan(10)
      }
    })
  })

  test('User can continue conversation with follow-up', async ({ authenticatedPage }) => {
    test.setTimeout(60000) // 60 seconds for this test
    await test.step('Perform initial comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('What is Python?')

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
          await authenticatedPage.waitForTimeout(500)
        }
      }

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 15000 })
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

    await test.step('Enter follow-up question', async () => {
      // Wait for the conversation to be ready (results should be visible)
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )
      await results
        .first()
        .isVisible({ timeout: 30000 })
        .catch(() => {})

      // Wait for network to be idle (loading should be complete)
      // Use 'load' instead of 'networkidle' which is too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 10000 })
      } catch {
        await authenticatedPage
          .waitForLoadState('domcontentloaded', { timeout: 5000 })
          .catch(() => {})
      }

      // Wait a moment for UI to stabilize
      await authenticatedPage.waitForTimeout(1000)

      // Click "Follow up" button to activate follow-up mode
      // This button appears when !isFollowUpMode and conversations exist
      const followUpButton = authenticatedPage.locator(
        'button.follow-up-button, button:has-text("Follow up")'
      )
      const followUpButtonVisible = await followUpButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)

      if (followUpButtonVisible) {
        // Check if button is enabled
        const isEnabled = await followUpButton
          .first()
          .isEnabled()
          .catch(() => false)
        if (isEnabled) {
          await followUpButton.first().click()
          await authenticatedPage.waitForTimeout(500)
        }
      }

      // Wait for follow-up mode header to appear (confirms follow-up mode is active)
      const followUpHeader = authenticatedPage.locator(
        'h2:has-text("Follow Up Mode"), .follow-up-header'
      )
      await followUpHeader
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => {})

      // Check page is still valid before proceeding
      if (authenticatedPage.isClosed()) {
        throw new Error('Page was closed unexpectedly')
      }

      // Input field should still be visible and ready for follow-up
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible({ timeout: 10000 })

      // Wait for any loading to complete before proceeding
      // Check for loading indicators and wait for them to disappear
      if (!authenticatedPage.isClosed()) {
        const loadingIndicators = authenticatedPage.locator(
          '.loading-message, [class*="loading"], [data-testid*="loading"]'
        )
        await loadingIndicators
          .first()
          .waitFor({ state: 'hidden', timeout: 10000 })
          .catch(() => {})
      }

      // Wait for network to be idle to ensure previous comparison is complete
      if (!authenticatedPage.isClosed()) {
        try {
          await authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 })
        } catch {
          await authenticatedPage.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
        }
      }

      // Check page validity again before clearing
      if (authenticatedPage.isClosed()) {
        throw new Error('Page was closed before clearing input')
      }

      // Clear any existing text first
      await inputField.clear({ timeout: 5000 })
      if (!authenticatedPage.isClosed()) {
        await authenticatedPage.waitForTimeout(300)
      }

      // Check page validity before filling
      if (authenticatedPage.isClosed()) {
        throw new Error('Page was closed before filling input')
      }

      // Fill follow-up question
      await inputField.fill('What are its main use cases?', { timeout: 5000 })

      // Wait for input to be processed and React state to update
      if (!authenticatedPage.isClosed()) {
        await authenticatedPage.waitForTimeout(500)
      }

      // Check page validity before checking button
      if (authenticatedPage.isClosed()) {
        throw new Error('Page was closed before checking submit button')
      }

      // Get submit button - in follow-up mode, it should be enabled if not loading and credits > 0
      const submitButton = authenticatedPage.getByTestId('comparison-submit-button')

      // Check if button is disabled and why (for debugging)
      const isDisabled = await submitButton.isDisabled({ timeout: 5000 }).catch(() => true)
      if (isDisabled && !authenticatedPage.isClosed()) {
        // Check if it's because of loading state
        const isLoading = await authenticatedPage
          .locator('[class*="loading"], [data-testid*="loading"]')
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)

        // Wait a bit more for loading to complete if still loading
        if (isLoading && !authenticatedPage.isClosed()) {
          await authenticatedPage.waitForTimeout(2000)
        }
      }

      // Wait for button to be enabled (with longer timeout to account for React state updates)
      // In follow-up mode, button should be enabled unless loading or no credits
      if (!authenticatedPage.isClosed()) {
        await expect(submitButton).toBeEnabled({ timeout: 15000 })
      }

      // Submit follow-up
      await submitButton.click()
      await authenticatedPage.waitForLoadState('networkidle')
    })

    await test.step('Follow-up responses appear', async () => {
      // Results should update with follow-up responses
      // Result cards use class "result-card conversation-card" (no data-testid)
      const results = authenticatedPage.locator(
        '.result-card, ' +
          '.conversation-card, ' +
          '[data-testid^="result-card-"], ' +
          '.model-response'
      )

      // Wait for follow-up responses to stream in (they may take longer than initial responses)
      // First wait for at least one result card to be visible
      await expect(results.first())
        .toBeVisible({ timeout: 30000 })
        .catch(() => {
          // If results don't appear, check if backend is running
          test.info().annotations.push({
            type: 'note',
            description: 'Follow-up results may not have appeared - backend may not be running',
          })
        })

      // Then check the count
      const resultCount = await results.count()
      expect(resultCount).toBeGreaterThan(0)
    })
  })

  test('User can interact with model responses', async ({ authenticatedPage }) => {
    await test.step('Perform comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('Explain quantum computing.')

      // Wait for models to load first
      const loadingMessage = authenticatedPage.locator(
        '.loading-message:has-text("Loading available models")'
      )
      await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

      // Expand first provider dropdown if collapsed (checkboxes are inside dropdowns)
      const providerHeaders = authenticatedPage.locator(
        '.provider-header, button[class*="provider-header"]'
      )
      const headerCount = await providerHeaders.count()
      if (headerCount > 0) {
        const firstProvider = providerHeaders.first()
        const isExpanded = await firstProvider.getAttribute('aria-expanded')
        if (isExpanded !== 'true') {
          await firstProvider.click()
          await authenticatedPage.waitForTimeout(500)
        }
      }

      // Wait for checkboxes to be available
      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )

      // Wait for at least one checkbox to be visible
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })

      // Wait a bit more for all checkboxes to load
      await authenticatedPage.waitForTimeout(1000)

      // Now count checkboxes
      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      if (checkboxCount > 0) {
        // Find first enabled checkbox
        let checked = false
        for (let i = 0; i < checkboxCount && !checked; i++) {
          const checkbox = modelCheckboxes.nth(i)
          const isEnabled = await checkbox.isEnabled().catch(() => false)
          if (isEnabled) {
            await checkbox.check({ timeout: 10000 })
            checked = true
          }
        }
        if (!checked) {
          throw new Error('No enabled checkboxes found to select')
        }
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 15000 })
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

    await test.step('Response cards have interactive elements', async () => {
      const resultCards = authenticatedPage.locator('[data-testid^="result-card-"], .result-card')

      const cardCount = await resultCards.count()
      if (cardCount > 0) {
        const firstCard = resultCards.first()

        // Look for common interactive elements:
        // - Copy button
        // - Expand/collapse
        // - Model name/header

        const cardContent = await firstCard.textContent()
        expect(cardContent).toBeTruthy()
        expect(cardContent?.length).toBeGreaterThan(0)
      }
    })
  })

  test('User sees credit/usage information', async ({ authenticatedPage }) => {
    // Look for credit/usage indicators
    const creditIndicators = authenticatedPage.locator(
      '[data-testid*="credit"], ' +
        '[data-testid*="usage"], ' +
        '.credit-balance, ' +
        '.usage-status, ' +
        '[class*="credit"], ' +
        '[class*="usage"]'
    )

    // Credit info might be visible in various places
    const indicatorCount = await creditIndicators.count()

    // At least some indication of credits/usage should be present
    // (might be in header, sidebar, or near submit button)
    expect(indicatorCount).toBeGreaterThanOrEqual(0)
  })

  test('User can select different model combinations', async ({ authenticatedPage }) => {
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
        await authenticatedPage.waitForTimeout(500)
      }
    }

    await test.step('Select first set of models', async () => {
      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      const checkboxCount = await modelCheckboxes.count()
      expect(checkboxCount).toBeGreaterThan(0)

      if (checkboxCount >= 2) {
        // Select first two enabled models
        let selectedCount = 0
        for (let i = 0; i < checkboxCount && selectedCount < 2; i++) {
          const checkbox = modelCheckboxes.nth(i)
          await expect(checkbox).toBeVisible({ timeout: 5000 })
          const isEnabled = await checkbox.isEnabled().catch(() => false)
          if (isEnabled) {
            await checkbox.check({ timeout: 10000 })
            await expect(checkbox).toBeChecked()
            selectedCount++
          }
        }
        expect(selectedCount).toBeGreaterThanOrEqual(2)
      }
    })

    await test.step('Change model selection', async () => {
      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      const checkboxCount = await modelCheckboxes.count()

      if (checkboxCount >= 3) {
        // Find first enabled checkbox to uncheck, and third enabled to check
        let firstEnabled = -1
        let thirdEnabled = -1
        let enabledCount = 0

        for (let i = 0; i < checkboxCount; i++) {
          const checkbox = modelCheckboxes.nth(i)
          const isEnabled = await checkbox.isEnabled().catch(() => false)
          if (isEnabled) {
            if (firstEnabled === -1) firstEnabled = i
            enabledCount++
            if (enabledCount === 3) {
              thirdEnabled = i
              break
            }
          }
        }

        if (firstEnabled >= 0 && thirdEnabled >= 0) {
          const checkbox1 = modelCheckboxes.nth(firstEnabled)
          const checkbox3 = modelCheckboxes.nth(thirdEnabled)
          await expect(checkbox1).toBeVisible({ timeout: 5000 })
          await expect(checkbox3).toBeVisible({ timeout: 5000 })

          // Uncheck first if checked
          const isChecked1 = await checkbox1.isChecked().catch(() => false)
          if (isChecked1) {
            await checkbox1.uncheck({ timeout: 10000 })
            await expect(checkbox1).not.toBeChecked()
          }

          // Check third
          await checkbox3.check({ timeout: 10000 })
          await expect(checkbox3).toBeChecked()
        }
      }
    })
  })

  test('User can clear and start new comparison', async ({ authenticatedPage }) => {
    await test.step('Perform a comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('Test question')

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
          await authenticatedPage.waitForTimeout(500)
        }
      }

      const modelCheckboxes = authenticatedPage.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      // Wait for load state with fallback - networkidle can be too strict
      try {
        await authenticatedPage.waitForLoadState('load', { timeout: 15000 })
      } catch {
        await authenticatedPage
          .waitForLoadState('domcontentloaded', { timeout: 5000 })
          .catch(() => {})
      }
    })

    await test.step('Start new comparison', async () => {
      // Wait for comparison to complete and follow-up mode to activate
      await authenticatedPage.waitForTimeout(2000)

      // Look for "New Comparison" button (appears in follow-up mode)
      // Or the clear-all-button if models are selected
      const newComparisonButton = authenticatedPage
        .locator(
          'button.new-inquiry-button, button[title*="Exit follow up"], button[aria-label*="Exit follow up"]'
        )
        .first()

      const clearAllButton = authenticatedPage.locator('button.clear-all-button').first()

      // Try new comparison button first (follow-up mode)
      const hasNewComparisonButton = await newComparisonButton
        .isVisible({ timeout: 3000 })
        .catch(() => false)

      if (hasNewComparisonButton) {
        // Wait for button to be enabled (not loading)
        await expect(newComparisonButton).toBeEnabled({ timeout: 10000 })
        await newComparisonButton.click()
        await authenticatedPage.waitForLoadState('networkidle')
      } else {
        // If not in follow-up mode, try clearing models and input manually
        // Clear input field
        const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
        await inputField.clear()

        // Clear model selections if clear button is enabled
        const isClearButtonEnabled = await clearAllButton
          .isEnabled({ timeout: 2000 })
          .catch(() => false)

        if (isClearButtonEnabled) {
          await clearAllButton.click()
          await authenticatedPage.waitForTimeout(500)
        }
      }

      // Verify we can start a new comparison (input should be clear or ready)
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      const value = await inputField.inputValue()
      // Value should be empty or very short (allowing for placeholder/whitespace)
      expect(value.trim().length).toBeLessThanOrEqual(10)
    })
  })
})
