import { expect, type Page, type TestInfo } from '@playwright/test'

import { dismissMobileBlockers } from './modelCheckbox'

export async function expandTutorialProvider(page: Page, providerName: string): Promise<void> {
  const header = page
    .locator(`.provider-dropdown[data-provider-name="${providerName}"] .provider-header`)
    .first()
  await header.scrollIntoViewIfNeeded()
  await dismissMobileBlockers(page)
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

/**
 * Toggle a tutorial model checkbox. On split steps, selecting the first model
 * advances the tour and filters that row out of the list — skip toBeChecked then.
 */
export async function selectTutorialModelCheckbox(
  page: Page,
  modelId: string,
  provider: string,
  _testInfo: TestInfo
): Promise<void> {
  const header = page
    .locator(`.provider-dropdown[data-provider-name="${provider}"] .provider-header`)
    .first()
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await expandTutorialProvider(page, provider)
  }

  const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
  await expect(checkbox).toBeEnabled()
  const label = page.locator(`label:has([data-testid="model-checkbox-${modelId}"])`).first()
  await label.scrollIntoViewIfNeeded()
  await dismissMobileBlockers(page)
  await label.click({ timeout: 10000 })

  await expect
    .poll(
      async () => {
        if (!(await checkbox.isVisible().catch(() => false))) {
          return true
        }
        return checkbox.isChecked()
      },
      { timeout: 10000, message: `expected ${modelId} to be selected or step to advance` }
    )
    .toBe(true)
}

export function tutorialTooltip(page: Page) {
  return page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip')
}

export async function expectSplitOrCombinedModelStep(page: Page): Promise<'split' | 'combined'> {
  const tooltip = tutorialTooltip(page)
  const splitHeading = tooltip.getByRole('heading', { name: 'Select Gemini 2.5 Flash', exact: true })
  const combinedHeading = tooltip.getByRole('heading', { name: 'Select Models', exact: true })
  await expect(splitHeading.or(combinedHeading)).toBeVisible({ timeout: 15000 })
  return (await splitHeading.isVisible().catch(() => false)) ? 'split' : 'combined'
}