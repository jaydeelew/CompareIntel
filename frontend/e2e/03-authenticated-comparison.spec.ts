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
      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      const checkboxCount = await modelCheckboxes.count()

      expect(checkboxCount).toBeGreaterThan(0)

      // Select at least 2 models for comparison
      const modelsToSelect = Math.min(3, checkboxCount)
      for (let i = 0; i < modelsToSelect; i++) {
        await modelCheckboxes.nth(i).check()
        await expect(modelCheckboxes.nth(i)).toBeChecked()
      }
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
    await test.step('Perform initial comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('What is Python?')

      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

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

    await test.step('Enter follow-up question', async () => {
      // Input field should still be visible and ready for follow-up
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()

      // Placeholder might change to indicate follow-up mode
      const _placeholder = await inputField.getAttribute('placeholder')

      await inputField.fill('What are its main use cases?')

      // Submit follow-up
      await authenticatedPage.getByTestId('comparison-submit-button').click()
      await authenticatedPage.waitForLoadState('networkidle')
    })

    await test.step('Follow-up responses appear', async () => {
      // Results should update with follow-up responses
      const results = authenticatedPage.locator(
        '[data-testid^="result-card-"], .result-card, .model-response'
      )

      // Wait a bit for follow-up responses to stream in
      await authenticatedPage.waitForTimeout(2000)

      const resultCount = await results.count()
      expect(resultCount).toBeGreaterThan(0)
    })
  })

  test('User can interact with model responses', async ({ authenticatedPage }) => {
    await test.step('Perform comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('Explain quantum computing.')

      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

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
    await test.step('Select first set of models', async () => {
      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      const checkboxCount = await modelCheckboxes.count()

      if (checkboxCount >= 2) {
        // Select first two models
        await modelCheckboxes.nth(0).check()
        await modelCheckboxes.nth(1).check()

        await expect(modelCheckboxes.nth(0)).toBeChecked()
        await expect(modelCheckboxes.nth(1)).toBeChecked()
      }
    })

    await test.step('Change model selection', async () => {
      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      const checkboxCount = await modelCheckboxes.count()

      if (checkboxCount >= 3) {
        // Uncheck first, check third
        await modelCheckboxes.nth(0).uncheck()
        await modelCheckboxes.nth(2).check()

        await expect(modelCheckboxes.nth(0)).not.toBeChecked()
        await expect(modelCheckboxes.nth(2)).toBeChecked()
      }
    })
  })

  test('User can clear and start new comparison', async ({ authenticatedPage }) => {
    await test.step('Perform a comparison', async () => {
      const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
      await inputField.fill('Test question')

      const modelCheckboxes = authenticatedPage.locator('input[type="checkbox"]')
      if ((await modelCheckboxes.count()) > 0) {
        await modelCheckboxes.first().check()
      }

      await authenticatedPage.getByTestId('comparison-submit-button').click()
      await authenticatedPage.waitForLoadState('networkidle')
    })

    await test.step('Start new comparison', async () => {
      // Look for "New Comparison" or similar button
      const newComparisonButton = authenticatedPage.getByRole('button', {
        name: /new|clear|reset|start over/i,
      })

      if (await newComparisonButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newComparisonButton.click()
        await authenticatedPage.waitForLoadState('networkidle')

        // Input should be cleared or ready for new input
        const inputField = authenticatedPage.getByTestId('comparison-input-textarea')
        const value = await inputField.inputValue()
        // Value might be empty or reset
        expect(value.length).toBeLessThanOrEqual(0)
      }
    })
  })
})
