import { test, expect } from '@playwright/test'

/**
 * Install prompt must not cover onboarding / guided tutorial.
 * Uses base Playwright (not test-setup) so the welcome modal can appear.
 */

const MOCK_MODELS_RESPONSE = {
  models: [
    {
      id: 'google/gemini-test-a',
      name: 'Gemini Test A',
      description: 'Gemini Test A test model',
      category: 'google',
      provider: 'Google',
      available: true,
      tier_access: 'unregistered',
    },
  ],
  models_by_provider: {
    Google: [
      {
        id: 'google/gemini-test-a',
        name: 'Gemini Test A',
        description: 'Gemini Test A test model',
        category: 'google',
        provider: 'Google',
        available: true,
        tier_access: 'unregistered',
      },
    ],
  },
}

const installPrompt = (page: import('@playwright/test').Page) =>
  page.locator('.install-prompt-banner, .install-prompt-overlay')

test.describe('Install prompt during onboarding tutorial', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('compareintel_tutorial_completed')
      localStorage.removeItem('compareintel_welcome_dont_show_again')
      localStorage.removeItem('pwa-install-dismissed')
    })
  })

  test('stays hidden while welcome modal is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Skip for Now' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-onboarding-tutorial-active', '')

    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    await expect(installPrompt(page)).toHaveCount(0)
  })

  test('stays hidden after starting guided tutorial', async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible()

    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(page.locator('.tutorial-welcome-backdrop')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-onboarding-tutorial-active', '')
    await expect(
      page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip, .tutorial-backdrop').first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(installPrompt(page)).toHaveCount(0)
  })

  test('on iOS may appear again after tutorial is skipped', async ({ page }) => {
    const isIosProject = /iPhone|iPad/i.test(test.info().project.name)
    test.skip(!isIosProject, 'iOS user agent required for engagement-only install banner')

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Skip for Now' })).toBeVisible()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    await expect(installPrompt(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Skip for Now' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-onboarding-tutorial-active', '')
    await expect(installPrompt(page)).toBeVisible({ timeout: 5_000 })
  })
})