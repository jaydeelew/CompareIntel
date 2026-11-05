/**
 * Pricing page -> auth modal
 *
 * Signed-out users who click "Get Started Free" or "Subscribe" on /pricing must see the
 * existing sign-up modal on the home page, and the `showAuthModal` param must be removed
 * from the URL without adding a history entry.
 *
 * All APIs are mocked, so these tests do not depend on seeded users.
 */

import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { mockModelsApi } from './helpers/mockModels'

async function openPricingSignedOut(page: Page): Promise<void> {
  await mockModelsApi(page, 'unregistered')
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })
  await page.route('**/api/auth/refresh', async route => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

  await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
  await page.locator('.pricing-page').waitFor({ state: 'visible', timeout: 15000 })
}

async function expectSignupModal(page: Page): Promise<void> {
  const modal = page.getByTestId('auth-modal')
  await expect(modal).toBeVisible({ timeout: 15000 })
  await expect(modal.getByRole('heading', { name: 'Create Account' })).toBeVisible()
  await expect(modal.getByTestId('register-submit-button')).toBeVisible()
  await expect(page).toHaveURL(url => url.pathname === '/' && !url.search.includes('showAuthModal'))
}

test.describe('Pricing page auth modal', () => {
  test('Get Started Free opens the signup modal and cleans the URL', async ({ page }) => {
    await openPricingSignedOut(page)

    await page.getByRole('button', { name: 'Get Started Free' }).click()

    await expectSignupModal(page)

    // Param removal used replace, so a single back step returns to /pricing.
    await page.goBack()
    await expect(page).toHaveURL(/\/pricing$/)
  })

  test('Subscribe opens the signup modal and remembers the chosen tier', async ({ page }) => {
    await openPricingSignedOut(page)

    await page.getByRole('button', { name: 'Subscribe' }).first().click()

    await expectSignupModal(page)

    const intent = await page.evaluate(() =>
      sessionStorage.getItem('compareintel:pendingAuthIntent')
    )
    expect(intent).not.toBeNull()
    expect(JSON.parse(intent as string)).toMatchObject({ returnTo: '/pricing', tier: 'starter' })
  })

  test('?showAuthModal=login opens the login modal', async ({ page }) => {
    await mockModelsApi(page, 'unregistered')
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not authenticated' }),
      })
    })

    await page.goto('/?showAuthModal=login', { waitUntil: 'domcontentloaded' })

    const modal = page.getByTestId('auth-modal')
    await expect(modal).toBeVisible({ timeout: 15000 })
    await expect(modal.getByTestId('login-submit-button')).toBeVisible()
    await expect(page).toHaveURL(url => !url.search.includes('showAuthModal'))
  })
})
